#!/usr/bin/env python3
"""Repair truncated UTF-8 (U+FFFD) in locale HTML files."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCALE_DIRS = ("de", "de-ch-at", "us")
REPLACEMENT = "\ufffd"


def fix_text(text: str) -> str:
    if REPLACEMENT not in text:
        return text

    # Broken closing tags: corrupted arrow/checkmark ate "<"
    text = text.replace(
        'class="result-card__icon" aria-hidden="true">\ufffd?/div>',
        'class="result-card__icon" aria-hidden="true">✓</div>',
    )
    for tag in ("a", "strong", "span"):
        text = text.replace(f"\ufffd?/{tag}>", f"→</{tag}>")

    # Currency / em dash in copy
    text = re.sub(r"Ab 300 \ufffd\?/ Monat", "Ab 300 €/ Monat", text)
    text = re.sub(r"(\d+)\ufffd\?Monat", r"\1 €/Monat", text)
    text = re.sub(r"\$300 \ufffd\?well", "$300 — well", text)
    text = re.sub(r"(\d+) \ufffd\?\ufffddeutlich", r"\1 € — deutlich", text)
    text = re.sub(r"bei 300 \ufffd\?\ufffd\?deutlich unter dem üblichen Marktpreis\.", "bei 300 € — deutlich unter dem üblichen Marktpreis.", text)
    text = re.sub(
        r"beginnt bereits bei 300 \ufffd\?',",
        "beginnt bereits bei 300 € — deutlich unter dem üblichen Marktpreis.',",
        text,
    )
    text = text.replace("Start Assistant \ufffd?", "Start Assistant →")
    text = re.sub(r"below \ufffd\?the", "below — the", text)
    text = re.sub(r"below \ufffd\?badges", "below — badges", text)
    text = re.sub(r" \ufffd\?die ", " — die ", text)
    text = re.sub(r"\$\{house\.price\} \ufffd\?Kaltmiete", "${house.price} € Kaltmiete", text)
    text = re.sub(r"Starting from \ufffd\?00/month", "Starting from $300/month", text)

    # Teach/home CTA strings ending with arrow before quote
    text = re.sub(r"wählen \ufffd\?,", "wählen →',", text)
    text = re.sub(r"starten \ufffd\?\n", "starten →\n", text)
    text = re.sub(r"state \ufffd\?,", "state →',", text)
    text = re.sub(r"state \ufffd\?$", "state →'", text, flags=re.MULTILINE)
    text = re.sub(r"Kanton wählen \ufffd\?,", "Kanton wählen →',", text)
    text = re.sub(r"Kanton starten \ufffd\?", "Kanton starten →'", text)

    # Chinese comments / inline notes
    replacements = [
        ("默认移动\ufffd?\ufffd", "默认移动端2列"),
        ("桌面4\ufffd?", "桌面4列"),
        ("实现居\ufffd?+", "实现居中 +"),
        ("\ufffd?关键，允许在 grid/flex 中压\ufffd?", "★ 关键，允许在 grid/flex 中压缩"),
        ("\ufffd?防止被撑\ufffd?", "★ 防止被撑开"),
        ("分割\ufffd?li，占满整\ufffd?", "分割线 li，占满整行"),
        ("统一声明一\ufffd?", "统一声明一次"),
        ("优先\ufffd??state=", "优先读 ?state="),
        ("优先\ufffd?query", "优先读 query"),
        ("路径提\ufffd?", "路径提取"),
        ("支持\ufffd?\n", "支持：\n"),
        ("不是\ufffd?list", "不是 /list"),
        ("最后不\ufffd?list", "最后不是 /list"),
        ("老格式 /de \ufffd?/de-ch-at", "老格式 /de 与 /de-ch-at"),
        ("原来\ufffd?page/list", "原来的 page/list"),
        ("新\ufffd?pathname", "新的 pathname"),
        ("\ufffd?个房源插\ufffd?条广", "每 2 个房源插入 1 条广告"),
        ("初始\ufffd?observer", "初始化 observer"),
        ("初始化分\ufffd?    $(document)", "初始化分页\n    $(document)"),
        ("调用初始化函\ufffd?        init", "调用初始化函数\n        init"),
        ("新结\ufffd?", "新结构"),
        ("老结\ufffd?", "老结构"),
        ("\ufffd?德语语言集合", "德语文语言集合"),
        ("老格\ufffd?", "老格式"),
        ("页面总高\ufffd?", "页面总高度"),
        ("避\ufffd?SRA", "避免 SRA"),
        ("锚定尚\ufffd?display", "锚定尚未 display"),
        ("干净\ufffd?->", "干净）-->"),
        ("已加\ufffd?->", "已加载-->"),
        ("并展\ufffd?->", "并展示-->"),
        ("鍔犺\ufffd?header", "加载 header"),
        ("鍔犺\ufffd?footer", "加载 footer"),
        ("或你希望的默认\ufffd?            }", "或你希望的默认值\n            }"),
        ("或你希望的默认\ufffd?            // }", "或你希望的默认值\n            // }"),
    ]
    for old, new in replacements:
        text = text.replace(old, new)

    return text


def main() -> None:
    changed_files: list[str] = []
    remaining = 0

    for locale in LOCALE_DIRS:
        locale_dir = ROOT / locale
        if not locale_dir.is_dir():
            continue
        for path in sorted(locale_dir.rglob("*.html")):
            original = path.read_text(encoding="utf-8")
            fixed = fix_text(original)
            if fixed != original:
                path.write_text(fixed, encoding="utf-8")
                changed_files.append(str(path.relative_to(ROOT)))
            remaining += fixed.count(REPLACEMENT)

    print(f"Updated {len(changed_files)} files")
    for name in changed_files:
        print(f"  - {name}")
    print(f"Remaining {REPLACEMENT} characters: {remaining}")


if __name__ == "__main__":
    main()
