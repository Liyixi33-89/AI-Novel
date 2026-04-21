# backend/services/projects_service.py
# -*- coding: utf-8 -*-
"""项目（小说）服务层。

"项目"本质上是一个 novel_preset：
  - 每个 project 的 id == preset 名称
  - 每个 project 的独立数据目录 == preset.filepath
  - meta（话题、体裁、章节数等）直接从 preset 读取

本文件集中提供：
  1. 项目元信息（meta + 统计：章节数 / 角色数 / 总字数 / 最后修改时间）
  2. 以 project_id 为作用域解析 filepath（供各 router 调用）
  3. 复制 / 创建 / 删除项目（带或不带磁盘目录）

所有写操作仍然落在 config.json（novel_presets 字段），保持与现有 preset 机制完全兼容。
"""
from __future__ import annotations

import copy
import os
import shutil
from dataclasses import dataclass
from typing import Any, Optional


# ---------- 数据结构 ----------
@dataclass
class ProjectStats:
    chapter_count: int = 0
    total_chars: int = 0
    character_count: int = 0
    has_architecture: bool = False
    has_directory: bool = False
    has_summary: bool = False
    last_modified: Optional[float] = None
    filepath_exists: bool = False


# ---------- 内部工具 ----------
def _presets(cfg: dict[str, Any]) -> dict[str, Any]:
    return cfg.get("novel_presets") or {}


def _preset(cfg: dict[str, Any], project_id: str) -> Optional[dict[str, Any]]:
    return _presets(cfg).get(project_id)


# ---------- 作用域路径解析 ----------
def resolve_filepath(cfg: dict[str, Any], project_id: Optional[str]) -> str:
    """根据 project_id 返回数据目录（filepath）。

    - project_id 为空：回退到 other_params.filepath（当前激活项目）
    - project_id 有效：使用该 preset 的 filepath
    - 自动 mkdir
    - 若路径为空字符串，返回空字符串（调用方自行 raise）
    """
    if project_id:
        preset = _preset(cfg, project_id)
        if preset is None:
            raise LookupError(f"项目不存在：{project_id}")
        filepath = (preset.get("filepath") or "").strip()
    else:
        filepath = (cfg.get("other_params", {}) or {}).get("filepath", "").strip()

    if filepath:
        os.makedirs(filepath, exist_ok=True)
    return filepath


# ---------- 统计 ----------
def _count_chapters_and_chars(filepath: str) -> tuple[int, int, Optional[float]]:
    if not filepath or not os.path.isdir(filepath):
        return 0, 0, None
    chapters_dir = os.path.join(filepath, "chapters")
    if not os.path.isdir(chapters_dir):
        return 0, 0, None
    cnt = 0
    total = 0
    last_mod: Optional[float] = None
    for fn in os.listdir(chapters_dir):
        if fn.startswith("chapter_") and fn.endswith(".txt"):
            full = os.path.join(chapters_dir, fn)
            # 只统计非空章节，避免"空文件 = 已存在"的误判
            try:
                size = os.path.getsize(full)
            except OSError:
                continue
            if size <= 0:
                continue
            cnt += 1
            try:
                with open(full, "r", encoding="utf-8") as f:
                    total += len(f.read())
            except OSError:
                continue
            try:
                mtime = os.path.getmtime(full)
                if last_mod is None or mtime > last_mod:
                    last_mod = mtime
            except OSError:
                pass
    return cnt, total, last_mod


def _count_characters(filepath: str) -> int:
    if not filepath:
        return 0
    char_file = os.path.join(filepath, "character_state.txt")
    if not os.path.exists(char_file):
        return 0
    try:
        with open(char_file, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return 0
    # 粗略统计：以 "## 角色名" 为分隔符
    return sum(1 for line in text.splitlines() if line.strip().startswith("## "))


def _file_nonempty(path: str) -> bool:
    """文件存在且大小 > 0 才视为"已生成"，避免空文件误判。"""
    try:
        return os.path.isfile(path) and os.path.getsize(path) > 0
    except OSError:
        return False


def compute_stats(filepath: str) -> ProjectStats:
    stats = ProjectStats()
    if not filepath:
        return stats
    stats.filepath_exists = os.path.isdir(filepath)
    if not stats.filepath_exists:
        return stats
    chap_cnt, total_chars, last_mod = _count_chapters_and_chars(filepath)
    stats.chapter_count = chap_cnt
    stats.total_chars = total_chars
    stats.last_modified = last_mod
    stats.character_count = _count_characters(filepath)
    stats.has_architecture = _file_nonempty(os.path.join(filepath, "Novel_architecture.txt"))
    stats.has_directory = _file_nonempty(os.path.join(filepath, "Novel_directory.txt"))
    stats.has_summary = _file_nonempty(os.path.join(filepath, "global_summary.txt"))
    return stats


# ---------- 项目列表 / 详情 ----------
def list_projects(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """返回项目列表（含 meta + 统计）。"""
    presets = _presets(cfg)
    active = cfg.get("active_preset") or ""
    result: list[dict[str, Any]] = []
    for name, meta in presets.items():
        filepath = (meta.get("filepath") or "").strip()
        stats = compute_stats(filepath)
        result.append(
            {
                "id": name,
                "name": name,
                "is_active": name == active,
                "meta": meta,
                "stats": {
                    "chapter_count": stats.chapter_count,
                    "total_chars": stats.total_chars,
                    "character_count": stats.character_count,
                    "has_architecture": stats.has_architecture,
                    "has_directory": stats.has_directory,
                    "has_summary": stats.has_summary,
                    "last_modified": stats.last_modified,
                    "filepath_exists": stats.filepath_exists,
                },
            }
        )
    # 按最后修改时间倒序，未知的排最后
    result.sort(
        key=lambda p: (p["stats"]["last_modified"] or 0, p["name"]),
        reverse=True,
    )
    return result


def get_project(cfg: dict[str, Any], project_id: str) -> dict[str, Any]:
    meta = _preset(cfg, project_id)
    if meta is None:
        raise LookupError(f"项目不存在：{project_id}")
    filepath = (meta.get("filepath") or "").strip()
    stats = compute_stats(filepath)
    return {
        "id": project_id,
        "name": project_id,
        "is_active": cfg.get("active_preset") == project_id,
        "meta": meta,
        "stats": {
            "chapter_count": stats.chapter_count,
            "total_chars": stats.total_chars,
            "character_count": stats.character_count,
            "has_architecture": stats.has_architecture,
            "has_directory": stats.has_directory,
            "has_summary": stats.has_summary,
            "last_modified": stats.last_modified,
            "filepath_exists": stats.filepath_exists,
        },
    }


# ---------- 创建 / 复制 / 删除 ----------
def create_project(
    cfg: dict[str, Any],
    name: str,
    meta: dict[str, Any],
    *,
    copy_from: Optional[str] = None,
) -> dict[str, Any]:
    """创建新项目。

    - 若 copy_from 给出，用它作为模板并用 meta 覆盖
    - filepath 若与已有项目冲突会警告但不强制拒绝（用户自行负责）
    """
    name = (name or "").strip()
    if not name:
        raise ValueError("项目名不能为空")
    if name.startswith("_"):
        raise ValueError("项目名不能以下划线开头")
    presets = cfg.setdefault("novel_presets", {})
    if name in presets:
        raise ValueError(f"项目已存在：{name}")

    if copy_from:
        src = presets.get(copy_from)
        if src is None:
            raise LookupError(f"复制来源项目不存在：{copy_from}")
        new_meta = copy.deepcopy(src)
        new_meta.update(meta or {})
    else:
        # 以默认字段填充
        base = {
            "topic": "",
            "genre": "",
            "num_chapters": 0,
            "word_number": 3000,
            "filepath": "",
            "chapter_num": "1",
            "user_guidance": "",
            "characters_involved": "",
            "key_items": "",
            "scene_location": "",
            "time_constraint": "",
        }
        base.update(meta or {})
        new_meta = base

    # 若 filepath 为空，自动按项目名生成一个相对路径（相对当前 filepath 的父目录）
    if not (new_meta.get("filepath") or "").strip():
        # 尝试使用 active preset 的父目录作为根
        active = cfg.get("active_preset")
        parent_root = ""
        if active and active in presets:
            old_fp = (presets[active].get("filepath") or "").strip()
            if old_fp:
                parent_root = os.path.dirname(old_fp) or old_fp
        if not parent_root:
            parent_root = os.path.abspath("novel_output")
        new_meta["filepath"] = os.path.join(parent_root, _safe_dirname(name))

    # 建目录
    fp = new_meta["filepath"].strip()
    if fp:
        os.makedirs(fp, exist_ok=True)

    presets[name] = new_meta
    return get_project(cfg, name)


def delete_project(
    cfg: dict[str, Any],
    project_id: str,
    *,
    delete_files: bool = False,
) -> str:
    """删除项目。若 delete_files=True，同时删除磁盘目录。

    返回新的 active_preset（若删除的是当前激活项目则会切换）。
    """
    presets = _presets(cfg)
    if project_id not in presets:
        raise LookupError(f"项目不存在：{project_id}")
    if len(presets) <= 1:
        raise ValueError("至少要保留一个项目")

    meta = presets[project_id]
    fp = (meta.get("filepath") or "").strip()

    del cfg["novel_presets"][project_id]

    # 若是 active，切到第一个
    if cfg.get("active_preset") == project_id:
        new_active = next(iter(cfg["novel_presets"].keys()))
        cfg["active_preset"] = new_active
        cfg["other_params"] = copy.deepcopy(cfg["novel_presets"][new_active])
    new_active = cfg.get("active_preset", "")

    if delete_files and fp and os.path.isdir(fp):
        try:
            shutil.rmtree(fp)
        except OSError as exc:  # pragma: no cover
            raise RuntimeError(f"文件夹删除失败：{exc}") from exc

    return new_active


def update_project_meta(
    cfg: dict[str, Any],
    project_id: str,
    meta: dict[str, Any],
) -> dict[str, Any]:
    presets = _presets(cfg)
    if project_id not in presets:
        raise LookupError(f"项目不存在：{project_id}")
    presets[project_id].update(meta or {})
    # 若是激活项目，同步到 other_params
    if cfg.get("active_preset") == project_id:
        cfg["other_params"] = copy.deepcopy(presets[project_id])
    # 新建目录
    fp = (presets[project_id].get("filepath") or "").strip()
    if fp:
        os.makedirs(fp, exist_ok=True)
    return get_project(cfg, project_id)


# ---------- 辅助 ----------
_INVALID_CHARS = '<>:"/\\|?*'


def _safe_dirname(name: str) -> str:
    safe = "".join(c if c not in _INVALID_CHARS else "_" for c in name)
    return safe.strip() or "novel"
