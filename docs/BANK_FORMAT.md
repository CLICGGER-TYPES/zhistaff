# `.bank` 题库格式规范

`.bank` 是一个 **UTF-8 编码的 JSON 文件**，单文件自包含。扩展名 `.bank` 只用于标识用途，内容和 `.json` 完全一样。

设计目标是：一个文件 = 一个科目，图片内嵌，不依赖外部资源，可以整个丢给任何人。

---

## 1. 顶层结构

```json
{
  "name": "示例题库",
  "version": 1,
  "questions": []
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | 是 | 题库显示名。**同时是本地存储的主键**——导入同名题库会覆盖旧的 |
| `version` | number | 是 | 格式版本，当前固定为 `1` |
| `questions` | array | 是 | 题目数组，见下节 |

---

## 2. 题目对象

```jsonc
{
  "num": 1,
  "type": "choice",
  "text": "以下工作于 OSI 参考模型数据链路层的设备是______。",
  "options": [
    {"k": "A", "v": "广域网交换机"},
    {"k": "B", "v": "路由器"}
  ],
  "answer": ["A"],
  "explain": "广域网交换机工作在数据链路层。",
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "desc": "拓扑图：SWA 与 SWB 通过 GE0/0/1 互联。",
  "meta": {"page": 3, "bad": false}
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `num` | number | 是 | 题号，同一题库内唯一，用于错题本/收藏去重 |
| `type` | `"choice"` \| `"fill"` | 是 | 选择题 / 填空题 |
| `text` | string | 是 | 题干正文，**不含选项**。选项在 `options` 里 |
| `options` | array | `choice` 必填 | `{"k":"A","v":"选项文字"}`，`k` 取 `A`–`H` |
| `answer` | array \| null | 是 | `choice` 存字母数组 `["A","C"]`；`fill` 存 `["标准答案"]` |
| `explain` | string | 否 | 答案解析，可含换行 |
| `image` | string \| null | 否 | 配图，**data URL** 格式，单题一张 |
| `desc` | string | 否 | 配图的文字转述，由 `transcribe_images.py` 生成 |
| `meta` | object | 否 | `{"page": 起始页码, "bad": 是否残缺}` |

### 多选题

`type` 仍然是 `"choice"`，靠 `answer` 数组长度体现：

```json
{"num": 12, "type": "choice", "text": "...", "options": [...], "answer": ["A", "C", "D"]}
```

### 填空题

没有 `options`，`answer` 是文本数组：

```json
{"num": 200, "type": "fill", "text": "OSPF 的默认 Hello 间隔是______秒。", "answer": ["10"]}
```

---

## 3. `meta.bad` —— 残缺题标记

`build_bank.py` 在提取时会给每道题打上 `bad` 标记。**加载时 `bad: true` 的题会被直接过滤，不进入刷题池。**

判定为 `bad` 的条件（任一命中）：

- 没有解析出答案（`answer` 为 `null` 或空数组）
- 题干为空
- `choice` 类型但没有任何选项
- 答案里的字母全部不在选项范围内

保留这些题而不删除，是为了方便人工回查 PDF 原文。想修的话把 `bad` 改成 `false` 并补全字段即可。

---

## 4. 图片处理

- `image` 必须是 **data URL**：`data:image/jpeg;base64,...`
- 单题只保留一张图（题目区域内第一张）
- 提取时自动**剔除水印**：出现在超过 50% 页面上的图判定为水印，直接丢弃（`WATERMARK_RATIO = 0.5`）
- 图片转述写进 `desc`，用 `tools/transcribe_images.py` 调用多模态模型批量生成，支持断点续跑

---

## 5. 用 PDF 生成题库

### 环境

只依赖 PyMuPDF，用 `uv` 临时装：

```bash
uv run --with pymupdf python tools/build_bank.py 题库.pdf bank/输出.bank "科目名"
```

参数：

```
build_bank.py <pdf路径> <输出.bank路径> [科目名]
```

第三个参数省略时，用 PDF 文件名（去扩展名）作为题库名。

### 运行结果

```
[示例题库] total=446 choice=423 fill=23 bad=0 with_img=42
```

`bad` 不为 0 时，说明有题没解析干净，需要回 PDF 对照。

### 提取规则

| 规则 | 说明 |
|---|---|
| 切题 | 按行首 `QUESTION N` 切分，`N` 即 `num` |
| 排序 | 题干/选项/答案/解析按页面内的 y 坐标顺序归并，同一视觉行（y 差 < 1.6pt）合并 |
| 选项识别 | 正则 `([A-H])[.．、](?![0-9])`，支持独立行 `A. xxx`、同一行多个 `A. x B. y`、跨页断行 |
| 答案识别 | 行内 `Answer: ABCD` 或 `Correct Answer: ABCD`，取开头的连续字母 |
| 答案注释剥离 | `ACD 不能修改为as-path` → `ACD` |
| 解析范围 | 答案行之后到下一题之前，过滤掉 `Section:` 和 `Explanation:` 标记行 |
| 题型判定 | 解析出选项 → `choice`，否则 `fill` |
| 水印剔除 | 出现页数 ≥ 总页数 50% 的图片判定为水印 |

### 已知限制

- PDF 里如果是扫描件（图片 PDF，无文字层），提取会失败——需要先 OCR
- 题干与选项在同一行、且没有任何分隔符时，可能被误判
- 一道题有多张图时只保留第一张

---

## 6. 手工校验

生成后建议抽查：

```bash
# 看看统计
python3 -c "
import json,sys
d=json.load(open(sys.argv[1]))
qs=d['questions']
bad=[q for q in qs if q.get('meta',{}).get('bad')]
print(f\"{d['name']}: 共 {len(qs)} 题, 残缺 {len(bad)}\")
for q in bad[:10]: print('  bad:', q['num'], q['text'][:40])
" bank/某某.bank
```

网页版里也能直接看：导入题库后，残缺题不会出现。想确认某题是否被过滤，看 `meta.bad`。
