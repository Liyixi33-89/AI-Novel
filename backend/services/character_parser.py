# backend/services/character_parser.py
# -*- coding: utf-8 -*-
"""
解析/序列化 character_state.txt 的工具函数。

输入样例：
    云烨（Yún Yè）：
    ├──物品:
    │  ├──星纹之袍（防具）：淡灰长袍绣有古老星纹...
    │  └──星纹之剑（武器）：银白长剑...
    ├──能力
    │  ├──星纹之火引导：可将体内星纹之火聚集...
    ├──状态
    │  ├──身体状态：身形修长...
    │  └──心理状态：使命感强烈...
    ├──主要角色间关系网
    │  ├──玄月：宿命对立的敌手...
    ├──触发或加深的事件
    │  ├──星辰裂痕核心仪式被玄月倾覆：...

内部模型：
    Character = {"name": str, "sections": {section_name: [Item, ...]}}
    Item = {"name": str, "desc": str, "subtype": Optional[str]}
"""
from __future__ import annotations

import re
from typing import Any, Optional

# 5 个固定分类（顺序写回时保持一致）
SECTION_ORDER: list[str] = [
    "物品",
    "能力",
    "状态",
    "主要角色间关系网",
    "触发或加深的事件",
]
SECTION_SET = set(SECTION_ORDER)

# 容忍 "物品" / "物品:" / "物品：" 等变体
_SECTION_LINE_RE = re.compile(r"^├──([^\s:：]+)\s*[:：]?\s*$")
# 条目行：│  ├──xxx（类型）：描述  或  │  ├──xxx：描述
_ITEM_LINE_RE = re.compile(r"^│\s*[├└]──\s*(?P<rest>.+?)\s*$")
# 角色标题行：名字（...）：  或  名字：
_ROLE_HEAD_RE = re.compile(r"^(?P<name>[^\s├│└─].*?)\s*[:：]\s*$")
# item 内部再解析 subtype
_SUBTYPE_RE = re.compile(r"^(?P<name>.+?)（(?P<subtype>[^（）]+)）\s*[:：]\s*(?P<desc>.*)$")
_PLAIN_ITEM_RE = re.compile(r"^(?P<name>.+?)\s*[:：]\s*(?P<desc>.*)$")


def _parse_item(rest: str) -> dict[str, Any]:
    """解析单条 item 行的 rest 部分。"""
    m = _SUBTYPE_RE.match(rest)
    if m:
        return {"name": m.group("name").strip(), "desc": m.group("desc").strip(), "subtype": m.group("subtype").strip()}
    m = _PLAIN_ITEM_RE.match(rest)
    if m:
        return {"name": m.group("name").strip(), "desc": m.group("desc").strip(), "subtype": None}
    # 没有冒号，整行作为 name
    return {"name": rest.strip(), "desc": "", "subtype": None}


def _empty_sections() -> dict[str, list[dict[str, Any]]]:
    return {name: [] for name in SECTION_ORDER}


def parse_character_state(text: str) -> list[dict[str, Any]]:
    """把整个 character_state.txt 解析成结构化 Character 列表。

    规则：
    - 以 "空行" 切分角色块
    - 每块的第一行（非 tree 行）视为角色名
    - 遇 `├──分类[:：]?` 切换 section
    - 遇 `│ ├──...` / `│ └──...` 追加条目
    - 忽略以 "新出场角色" / "- (...)" 开头的占位段
    """
    characters: list[dict[str, Any]] = []
    if not text or not text.strip():
        return characters

    # 以空行分隔为块
    raw_blocks = re.split(r"\n\s*\n", text.strip())
    for block in raw_blocks:
        lines = [ln for ln in block.splitlines() if ln.strip() != ""]
        if not lines:
            continue

        # 跳过说明性占位块（例如 "新出场角色："）
        first = lines[0].strip()
        if first.startswith("-") or first.startswith("（"):
            continue

        head_match = _ROLE_HEAD_RE.match(first)
        if not head_match:
            # 首行不像角色名，跳过
            continue

        role: dict[str, Any] = {
            "name": head_match.group("name").strip(),
            "sections": _empty_sections(),
        }
        current_section: Optional[str] = None

        for line in lines[1:]:
            stripped = line.rstrip()
            sec = _SECTION_LINE_RE.match(stripped)
            if sec:
                sec_name = sec.group(1).strip()
                if sec_name in SECTION_SET:
                    current_section = sec_name
                else:
                    current_section = None
                continue
            item = _ITEM_LINE_RE.match(stripped)
            if item and current_section is not None:
                role["sections"][current_section].append(_parse_item(item.group("rest")))
                continue
            # 其他行（例如多行描述续行）附加到上一条 desc
            if current_section and role["sections"][current_section]:
                last = role["sections"][current_section][-1]
                last["desc"] = (last["desc"] + " " + stripped.strip()).strip()

        characters.append(role)

    return characters


def _serialize_item(item: dict[str, Any], is_last: bool) -> str:
    prefix = "│  └──" if is_last else "│  ├──"
    name = (item.get("name") or "").strip()
    desc = (item.get("desc") or "").strip()
    subtype = (item.get("subtype") or "").strip()
    head = f"{name}（{subtype}）" if subtype else name
    if desc:
        return f"{prefix}{head}：{desc}"
    return f"{prefix}{head}"


def serialize_characters(characters: list[dict[str, Any]]) -> str:
    """反向序列化成 character_state.txt 格式。

    完全无内容的角色（所有 section 都为空）会被跳过，避免写回时多出占位块。
    """
    out_blocks: list[str] = []
    for role in characters:
        sections = role.get("sections") or {}
        total_items = sum(len(sections.get(s) or []) for s in SECTION_ORDER)
        if total_items == 0:
            continue
        lines: list[str] = [f"{role.get('name', '').strip()}："]
        for sec_name in SECTION_ORDER:
            items = sections.get(sec_name) or []
            # 物品分类沿用原文件尾随冒号写法（`物品:`），其他分类不带
            header = f"├──{sec_name}:" if sec_name == "物品" else f"├──{sec_name}"
            lines.append(header)
            for idx, it in enumerate(items):
                lines.append(_serialize_item(it, is_last=(idx == len(items) - 1)))
        out_blocks.append("\n".join(lines))
    return "\n\n".join(out_blocks) + "\n"


def new_empty_character(name: str) -> dict[str, Any]:
    return {"name": name, "sections": _empty_sections()}
