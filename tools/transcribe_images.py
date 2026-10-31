#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""批量对 .bank 中的插图做识图转述（调用兼容 OpenAI 协议的多模态模型），结果写回 desc 字段。

用法:
  uv run --with pymupdf python transcribe_images.py <bank文件>...
  （可断点续跑：已有 desc 的题跳过）

模型地址通过环境变量配置:
  TRANS_LLM_URL  默认 http://127.0.0.1:8011/v1/chat/completions
  TRANS_LLM_MODEL 见下方 MODEL
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request

BASE_URL = os.environ.get("TRANS_LLM_URL", "http://127.0.0.1:8011/v1/chat/completions")
MODEL = "MiniCPM-V-4.6"
PROMPT = (
    "这是一张技术类题库的拓扑图或示意图。请用中文简要转述图中的关键信息："
    "网络设备及型号/角色、各端口连接关系、网段/IP地址、配置状态、标注文字、图标含义。"
    "如果是命令输出截图，请逐行转录内容。尽量完整、忠于原图，控制在200字以内。"
)


def call_vision(image_b64, mime, timeout=180):
    payload = {
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
            ],
        }],
        "max_tokens": 512,
        "temperature": 0.2,
    }
    req = urllib.request.Request(
        BASE_URL,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode())
        return data["choices"][0]["message"]["content"].strip()


def process(path):
    with open(path, encoding="utf-8") as f:
        bank = json.load(f)
    todo = [q for q in bank["questions"] if q.get("image") and not q.get("desc")]
    print(f"[{bank['name']}] images={sum(1 for q in bank['questions'] if q.get('image'))} todo={len(todo)}")
    ok = fail = 0
    for i, q in enumerate(todo, 1):
        # q["image"] 形如 data:image/jpeg;base64,xxx
        mime = q["image"].split(";", 1)[0]  # image/jpeg
        b64 = q["image"].split(",", 1)[1]
        try:
            desc = call_vision(b64, mime, timeout=180)
            q["desc"] = desc
            ok += 1
            print(f"  Q{q['num']} ok ({i}/{len(todo)}): {desc[:60]}...")
        except Exception as e:
            q["desc"] = ""
            fail += 1
            print(f"  Q{q['num']} FAIL: {str(e)[:80]}")
        # 每 5 题写一次，防丢
        if i % 5 == 0 or i == len(todo):
            with open(path, "w", encoding="utf-8") as f:
                json.dump(bank, f, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(bank, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[{bank['name']}] done ok={ok} fail={fail}")


def main():
    for p in sys.argv[1:]:
        process(p)


if __name__ == "__main__":
    main()
