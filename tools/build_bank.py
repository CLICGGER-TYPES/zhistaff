#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""通用 PDF 题库提取器：PDF → .bank 题库文件（JSON，图片 base64 内嵌）

用法:
  uv run --with pymupdf python build_bank.py <pdf路径> <输出.bank路径> [科目名]
  （不传科目名则取 PDF 文件名去扩展名）

产物格式（.bank 单文件，JSON）:
{
  "name": "科目名",
  "version": 1,
  "questions": [
    {
      "num": 1,
      "type": "choice" | "fill",
      "text": "题干",
      "options": [{"k":"A","v":"选项文字"}, ...],   // choice 才有
      "answer": ["A","B"],                           // choice: 字母数组; fill: [标准答案]
      "explain": "解析",
      "image": "data:image/jpeg;base64,...",         // 可无
      "desc": "识图转述文字（后续步骤填）",
      "meta": {"page": 5, "bad": false}
    }
  ]
}

规则:
- 按 "QUESTION N" 切题，题干/选项/答案/解析块按页面坐标顺序归并
- 剥离答案行尾注释（如 "ACD 不能修改为as-path"）
- 选项支持行内(A. x B. y)与独立行两种，跨页断行合并
- 填空题（无 ABCD 选项）answer 存文本答案
- 水印图（每页都出现）自动剔除
"""
import argparse
import base64
import json
import re
import sys

import fitz  # pymupdf


WATERMARK_RATIO = 0.5  # 出现在超过一半页面上的图视为水印
OPT_RE = re.compile(r"([A-H])[.．、](?![0-9])")
ANSWER_RE = re.compile(r"^(?:Answer|Correct Answer)\s*:\s*(.*)$", re.I)
SECTION_RE = re.compile(r"^Section\s*:\s*(.*)$", re.I)
EXPLAIN_MARK_RE = re.compile(r"^(Explanation|Explanation/Reference|Explanation/Ref|Explanation/Reference:)\s*:?\s*$", re.I)
QNUM_RE = re.compile(r"^QUESTION\s+(\d+)")


def is_watermark(pdf, watermark_xrefs):
    return lambda xref: xref in watermark_xrefs


def detect_watermark(pdf):
    from collections import Counter
    counts = Counter()
    for pno in range(pdf.page_count):
        for img in pdf[pno].get_images(full=True):
            counts[img[0]] += 1
    return {x for x, c in counts.items() if c >= pdf.page_count * WATERMARK_RATIO}


def extract_blocks(pdf):
    """返回 [(page, y0, kind, value)]，kind='T' text | 'I' image(xref)。
    line 粒度提取 + 同一视觉行（y 间距 <1.6pt）合并，兼顾选项断行与题干粘合。"""
    wm = detect_watermark(pdf)
    entries = []
    for pno in range(pdf.page_count):
        page = pdf[pno]
        raw_lines = []  # (y0, x0, text)
        for b in page.get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for line in b["lines"]:
                txt = "".join(s["text"] for s in line["spans"]).strip()
                if txt:
                    raw_lines.append((line["bbox"][1], line["bbox"][0], txt))
        # 合并同一视觉行（阈值 1.6pt，仅合并真正同行的 span）
        raw_lines.sort(key=lambda e: (e[0], e[1]))
        merged = []
        for y0, x0, txt in raw_lines:
            if merged and abs(y0 - merged[-1][0]) < 1.6:
                prev = merged[-1][2]
                if re.match(r"^[A-H][.．、]", txt) and prev and not prev[-1].isspace():
                    merged[-1][2] += " "
                merged[-1][2] += txt
                merged[-1][1] = min(merged[-1][1], x0)
            else:
                merged.append([y0, x0, txt])
        txt_entries = [(y0, "T", txt) for y0, x0, txt in merged]
        # 图片定位
        img_entries = []
        for img in page.get_images(full=True):
            xref = img[0]
            if xref in wm:
                continue
            for r in page.get_image_rects(xref):
                img_entries.append((r.y0, "I", xref))
        # 合并文本+图片，按 y 排序
        all_e = txt_entries + img_entries
        all_e.sort(key=lambda e: (e[0], 1 if e[1] == "I" else 0))
        for y0, k, v in all_e:
            entries.append((pno, y0, k, v))
    return entries


def parse_options(lines):
    """从题目正文行中解析选项。
    返回 (options, body_lines)
    支持：独立行/行内多选/跨行续行/标记与正文分离（同行前缀 "IS-IS D."）。"""
    joined = "\n".join(lines)
    # 记录每个选项标记及其所在行的起点
    tokens = []  # (start, k, end, line_start)
    line_starts = [0]
    for m in re.finditer(r"\n", joined):
        line_starts.append(m.start() + 1)
    for m in OPT_RE.finditer(joined):
        prev = joined[:m.start()]
        if prev and not prev[-1].isspace() and prev[-1] not in "\n":
            continue
        ls = max((s for s in line_starts if s <= m.start()), default=0)
        tokens.append((m.start(), m.group(1), m.end(), ls))
    if not tokens:
        return [], [l for l in lines if l.strip()]
    body_text = []
    first_start, first_k, first_end, first_ls = tokens[0]
    head = joined[:first_start]
    if head.strip():
        body_text.append(head.strip())
    options = []
    for idx, (start, k, end, ls) in enumerate(tokens):
        end_next = tokens[idx+1][0] if idx + 1 < len(tokens) else len(joined)
        seg = joined[end:end_next].strip()
        # 同行前缀（标记与正文分离）：如 "IS-IS D." 中 D 标记前同一行有 IS-IS
        if ls < start:
            line_prefix = joined[ls:start].strip()
            if line_prefix and not any(line_prefix.startswith(mk) for mk in "ABCDEFGH"):
                seg = line_prefix + (" " + seg if seg else "")
                # 前一个选项的正文如果以该前缀结尾（同行），去掉前缀
                if options and options[-1][1].endswith(line_prefix):
                    options[-1][1] = options[-1][1][:-len(line_prefix)].rstrip()
                elif options and ("\n" + line_prefix) in options[-1][1]:
                    options[-1][1] = options[-1][1].rsplit("\n" + line_prefix, 1)[0].rstrip()
        options.append([k, seg])
    return [(k, v) for k, v in options], [b for b in body_text if b]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("name", nargs="?", default=None)
    args = ap.parse_args()

    pdf = fitz.open(args.pdf)
    name = args.name or args.pdf.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    entries = extract_blocks(pdf)

    questions = []
    cur = None

    def flush_q():
        nonlocal cur
        if cur is not None:
            questions.append(cur)
        cur = None

    for pno, y0, kind, val in entries:
        if kind == "T":
            m = QNUM_RE.match(val)
            if m:
                flush_q()
                cur = {"num": int(m.group(1)), "text": [], "imgs": [],
                       "explain": "", "answer": None, "type": None,
                       "options": [], "desc": "", "meta": {"page": pno + 1}}
                continue
            if cur is not None:
                cur["text"].append(val)
        else:  # image
            if cur is not None:
                cur["imgs"].append(val)

    flush_q()

    # 逐题解析
    result = []
    for q in questions:
        lines = q["text"]
        # 去掉 "QUESTION N" 行（不应在 text 里，但保险）
        lines = [l for l in lines if not QNUM_RE.match(l.strip())]

        # 找答案行：允许非行首（长选项续行后跟 Answer: X），
        # 但要求 Answer 前缀前是空白或行首，避免命中题干里单词 "Answer"
        ans_idx = None
        ans_raw = None
        for i, l in enumerate(lines):
            m = re.search(r"(?:^|\s)(?:Answer|Correct Answer)\s*:\s*(.*)$", l.strip(), re.I)
            if m:
                ans_idx = i
                ans_raw = m.group(1).strip()
                # 若行内 Answer 前有选项残余（如 "LSA Answer: ABCD"），答案仍可取字母
                break

        # 答案行之前是题干+选项；之后是解析
        if ans_idx is None:
            ans_idx = len(lines)

        pre = lines[:ans_idx]
        post = lines[ans_idx+1:] if ans_idx < len(lines) else []

        # 解析：过滤 Section / Explanation 标记行
        explain_lines = []
        for l in post:
            if SECTION_RE.match(l.strip()) or EXPLAIN_MARK_RE.match(l.strip()):
                continue
            # 清理解析里残留的 "Correct Answer: X" 之类的尾巴
            l = re.sub(r"(?:Answer|Correct Answer)\s*:\s*[A-H]+\s*$", "", l, flags=re.I).strip()
            if l.strip():
                explain_lines.append(l.strip())
        explain = "\n".join(explain_lines).strip()

        # 选项：在 pre 中解析。选项标记通常以 A. 开头
        options, body = parse_options(pre)
        # 清理选项文本里残留的答案尾巴（如 "LSA Answer: ABCD" → "LSA"）
        options = [(k, re.sub(r"(?:Answer|Correct Answer)\s*:\s*[A-H]+", "", v, flags=re.I).strip())
                   for k, v in options]
        options = [(k, v) for k, v in options if v]
        text = "\n".join(body).strip()

        # 判类型
        if options:
            qtype = "choice"
        else:
            qtype = "fill"

        # 解析答案
        answer = None
        if ans_raw is not None and qtype == "choice":
            # 取字母（去掉行尾注释：非字母/空格后）
            m = re.match(r"^([A-H]+)", ans_raw.upper().replace(" ", "").replace("，", ","))
            if m:
                letters = [c for c in m.group(1) if c in "ABCDEFGH"]
                answer = letters
            # 校验字母都在选项内；不强行
        elif ans_raw is not None and qtype == "fill":
            answer = [ans_raw.strip()]

        bad = not answer
        # 题干清理：去掉首字符的排版残留（. , 、 空格）
        text = re.sub(r"^[\s.,，、。．:：]+", "", text).strip()
        # bad 仅：无答案 / 空题干 / 选项完全为空
        if not bad and qtype == "choice" and not options:
            bad = True
        if not text:
            bad = True
        # 答案裁到选项内（缺选项的题，多余答案字母剔除）
        if not bad and qtype == "choice" and answer:
            keys = [o[0] for o in options]
            answer = [a for a in answer if a in keys] or None
            if not answer:
                bad = True
        q_out = {
            "num": q["num"],
            "type": qtype,
            "text": text,
            "options": [{"k": k, "v": v} for k, v in options],
            "answer": answer,
            "explain": explain,
            "image": None,
            "desc": "",
            "meta": {"page": q["meta"]["page"], "bad": bad},
        }
        # 图片：取第一张，转 base64
        if q["imgs"]:
            xref = q["imgs"][0]
            try:
                info = pdf.extract_image(xref)
                b64 = base64.b64encode(info["image"]).decode()
                q_out["image"] = f"data:image/{info['ext']};base64,{b64}"
            except Exception as e:
                q_out["meta"]["img_err"] = str(e)[:80]
        result.append(q_out)

    bank = {"name": name, "version": 1, "questions": result}
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(bank, f, ensure_ascii=False, separators=(",", ":"))

    n_choice = sum(1 for x in result if x["type"] == "choice")
    n_fill = sum(1 for x in result if x["type"] == "fill")
    n_bad = sum(1 for x in result if x["meta"]["bad"])
    n_img = sum(1 for x in result if x["image"])
    print(f"[{name}] total={len(result)} choice={n_choice} fill={n_fill} "
          f"bad={n_bad} with_img={n_img}")


if __name__ == "__main__":
    main()
