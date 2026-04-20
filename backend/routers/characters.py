# backend/routers/characters.py
# -*- coding: utf-8 -*-
"""角色库 CRUD 接口。

数据源：`{filepath}/character_state.txt`
存储：实时读取/写入磁盘文件（每次 API 调用都重新 parse/serialize，保持与文件的一致性）。
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException

from ..schemas import (
    Character,
    CharacterItem,
    CharacterListItem,
    CharacterRenameReq,
    CharacterSections,
    RawCharacterStateReq,
    RawCharacterStateResp,
)
from ..services.character_parser import (
    SECTION_ORDER,
    new_empty_character,
    parse_character_state,
    serialize_characters,
)
from .config import CONFIG_FILE

from config_manager import load_config

router = APIRouter(prefix="/api/characters", tags=["characters"])


# ---------- 公共帮助函数 ----------
def _get_character_state_path() -> str:
    cfg = load_config(CONFIG_FILE)
    if not cfg:
        raise HTTPException(status_code=500, detail="配置文件加载失败")
    filepath = (cfg.get("other_params", {}) or {}).get("filepath", "").strip()
    if not filepath:
        raise HTTPException(status_code=400, detail="请先在配置中设置保存路径（filepath）")
    os.makedirs(filepath, exist_ok=True)
    return os.path.join(filepath, "character_state.txt")


def _read_all() -> list[dict[str, Any]]:
    path = _get_character_state_path()
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return parse_character_state(f.read())


def _write_all(chars: list[dict[str, Any]]) -> None:
    path = _get_character_state_path()
    content = serialize_characters(chars)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def _find_index(chars: list[dict[str, Any]], name: str) -> int:
    for i, c in enumerate(chars):
        if c["name"] == name:
            return i
    return -1


def _to_character_dict(c: Character) -> dict[str, Any]:
    """把 Pydantic Character 转为内部字典，并确保 5 个 section 都存在。"""
    sections_dump = c.sections.model_dump() if hasattr(c.sections, "model_dump") else dict(c.sections)
    sections: dict[str, list[dict[str, Any]]] = {name: [] for name in SECTION_ORDER}
    for sec_name in SECTION_ORDER:
        items = sections_dump.get(sec_name) or []
        for it in items:
            if isinstance(it, dict):
                sections[sec_name].append(
                    {
                        "name": (it.get("name") or "").strip(),
                        "desc": (it.get("desc") or "").strip(),
                        "subtype": (it.get("subtype") or None),
                    }
                )
    return {"name": c.name.strip(), "sections": sections}


def _dict_to_character_model(d: dict[str, Any]) -> Character:
    sections_src = d.get("sections") or {}
    kwargs: dict[str, Any] = {}
    for sec_name in SECTION_ORDER:
        items = sections_src.get(sec_name) or []
        kwargs[sec_name] = [
            CharacterItem(
                name=(it.get("name") or ""),
                desc=(it.get("desc") or ""),
                subtype=it.get("subtype"),
            )
            for it in items
        ]
    return Character(name=d.get("name", ""), sections=CharacterSections(**kwargs))


def _to_list_item(c: dict[str, Any]) -> CharacterListItem:
    sections = c.get("sections") or {}
    return CharacterListItem(
        name=c.get("name", ""),
        item_count=len(sections.get("物品") or []),
        ability_count=len(sections.get("能力") or []),
        relation_count=len(sections.get("主要角色间关系网") or []),
    )


# ---------- 列表与详情 ----------
@router.get("", response_model=list[CharacterListItem])
def list_characters() -> list[CharacterListItem]:
    chars = _read_all()
    return [_to_list_item(c) for c in chars]


@router.get("/{name}", response_model=Character)
def get_character(name: str) -> Character:
    chars = _read_all()
    idx = _find_index(chars, name)
    if idx < 0:
        raise HTTPException(status_code=404, detail=f"角色不存在：{name}")
    return _dict_to_character_model(chars[idx])


# ---------- 新建 / 更新 / 删除 ----------
@router.post("", response_model=Character)
def create_character(payload: Character) -> Character:
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="角色名不能为空")
    chars = _read_all()
    if _find_index(chars, name) >= 0:
        raise HTTPException(status_code=409, detail=f"角色已存在：{name}")
    new_char = _to_character_dict(payload)
    chars.append(new_char)
    _write_all(chars)
    return _dict_to_character_model(new_char)


@router.put("/{name}", response_model=Character)
def update_character(name: str, payload: Character) -> Character:
    chars = _read_all()
    idx = _find_index(chars, name)
    if idx < 0:
        raise HTTPException(status_code=404, detail=f"角色不存在：{name}")
    # 若 name 改变了，需要检查新名称是否冲突
    new_name = (payload.name or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="角色名不能为空")
    if new_name != name and _find_index(chars, new_name) >= 0:
        raise HTTPException(status_code=409, detail=f"新角色名已存在：{new_name}")
    chars[idx] = _to_character_dict(payload)
    _write_all(chars)
    return _dict_to_character_model(chars[idx])


@router.post("/{name}/rename", response_model=Character)
def rename_character(name: str, req: CharacterRenameReq) -> Character:
    chars = _read_all()
    idx = _find_index(chars, name)
    if idx < 0:
        raise HTTPException(status_code=404, detail=f"角色不存在：{name}")
    new_name = req.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="新角色名不能为空")
    if new_name == name:
        return _dict_to_character_model(chars[idx])
    if _find_index(chars, new_name) >= 0:
        raise HTTPException(status_code=409, detail=f"新角色名已存在：{new_name}")
    chars[idx]["name"] = new_name
    _write_all(chars)
    return _dict_to_character_model(chars[idx])


@router.delete("/{name}")
def delete_character(name: str) -> dict[str, Any]:
    chars = _read_all()
    idx = _find_index(chars, name)
    if idx < 0:
        raise HTTPException(status_code=404, detail=f"角色不存在：{name}")
    del chars[idx]
    _write_all(chars)
    return {"ok": True}


# ---------- 兜底：直接操作原始 txt ----------
@router.get("/raw/text", response_model=RawCharacterStateResp)
def read_raw() -> RawCharacterStateResp:
    path = _get_character_state_path()
    if not os.path.exists(path):
        return RawCharacterStateResp(content="")
    with open(path, "r", encoding="utf-8") as f:
        return RawCharacterStateResp(content=f.read())


@router.post("/raw/text")
def write_raw(req: RawCharacterStateReq) -> dict[str, Any]:
    path = _get_character_state_path()
    with open(path, "w", encoding="utf-8") as f:
        f.write(req.content)
    return {"ok": True}


# ---------- 辅助：新建空角色模板 ----------
@router.post("/_bootstrap_empty", response_model=Character)
def bootstrap_empty_template(name: str = "新角色") -> Character:
    """前端点"新建"时可先调这个拿个空壳（但不写盘）。"""
    return _dict_to_character_model(new_empty_character(name))