# backend/routers/files.py
# -*- coding: utf-8 -*-
"""小说相关文本文件读写。支持 ?project_id=xxx 作用域隔离。"""
from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import APIRouter, HTTPException

from ..schemas import ChapterInfo, FileContent, SaveFileReq
from ..services.projects_service import resolve_filepath
from .config import CONFIG_FILE  # 复用路径
from config_manager import load_config

router = APIRouter(prefix="/api/files", tags=["files"])

# 逻辑文件名 -> 物理文件相对路径（相对 filepath）
FILE_MAP: dict[str, str] = {
    "architecture": "Novel_architecture.txt",
    "directory": "Novel_directory.txt",
    "character": "character_state.txt",
    "summary": "global_summary.txt",
}


def _get_filepath(project_id: Optional[str] = None) -> str:
    cfg = load_config(CONFIG_FILE)
    if not cfg:
        raise HTTPException(status_code=500, detail="配置文件加载失败")
    try:
        filepath = resolve_filepath(cfg, project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not filepath:
        raise HTTPException(status_code=400, detail="请先在配置中设置保存路径（filepath）")
    return filepath


@router.get("/chapters/list", response_model=list[ChapterInfo])
def list_chapters(project_id: Optional[str] = None) -> list[ChapterInfo]:
    filepath = _get_filepath(project_id)
    chapters_dir = os.path.join(filepath, "chapters")
    if not os.path.isdir(chapters_dir):
        return []
    items: list[ChapterInfo] = []
    for fn in os.listdir(chapters_dir):
        if fn.startswith("chapter_") and fn.endswith(".txt"):
            try:
                num = int(fn[len("chapter_") : -len(".txt")])
            except ValueError:
                continue
            full = os.path.join(chapters_dir, fn)
            items.append(ChapterInfo(number=num, filename=fn, size=os.path.getsize(full)))
    items.sort(key=lambda c: c.number)
    return items


@router.get("/chapters/{number}", response_model=FileContent)
def read_chapter(number: int, project_id: Optional[str] = None) -> FileContent:
    filepath = _get_filepath(project_id)
    full = os.path.join(filepath, "chapters", f"chapter_{number}.txt")
    if not os.path.exists(full):
        return FileContent(name=f"chapter_{number}", content="")
    with open(full, "r", encoding="utf-8") as f:
        return FileContent(name=f"chapter_{number}", content=f.read())


@router.post("/chapters/{number}")
def save_chapter(number: int, req: SaveFileReq, project_id: Optional[str] = None) -> dict[str, Any]:
    filepath = _get_filepath(project_id)
    chapters_dir = os.path.join(filepath, "chapters")
    os.makedirs(chapters_dir, exist_ok=True)
    full = os.path.join(chapters_dir, f"chapter_{number}.txt")
    with open(full, "w", encoding="utf-8") as f:
        f.write(req.content)
    return {"ok": True}


@router.post("/open_folder")
def open_folder(project_id: Optional[str] = None) -> dict[str, Any]:
    """在系统文件管理器中打开当前保存路径。"""
    import subprocess
    import sys

    filepath = _get_filepath(project_id)
    try:
        if sys.platform.startswith("win"):
            os.startfile(filepath)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", filepath])
        else:
            subprocess.Popen(["xdg-open", filepath])
        return {"ok": True, "path": filepath}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"打开失败：{exc}") from exc


@router.get("/{name}", response_model=FileContent)
def read_file_api(name: str, project_id: Optional[str] = None) -> FileContent:
    if name not in FILE_MAP:
        raise HTTPException(status_code=404, detail=f"未知文件：{name}")
    filepath = _get_filepath(project_id)
    full = os.path.join(filepath, FILE_MAP[name])
    if not os.path.exists(full):
        return FileContent(name=name, content="")
    with open(full, "r", encoding="utf-8") as f:
        return FileContent(name=name, content=f.read())


@router.post("/{name}")
def save_file_api(name: str, req: SaveFileReq, project_id: Optional[str] = None) -> dict[str, Any]:
    if name not in FILE_MAP:
        raise HTTPException(status_code=404, detail=f"未知文件：{name}")
    filepath = _get_filepath(project_id)
    full = os.path.join(filepath, FILE_MAP[name])
    with open(full, "w", encoding="utf-8") as f:
        f.write(req.content)
    return {"ok": True}


@router.get("/chapters/list", response_model=list[ChapterInfo])
def list_chapters() -> list[ChapterInfo]:
    filepath = _get_filepath()
    chapters_dir = os.path.join(filepath, "chapters")
    if not os.path.isdir(chapters_dir):
        return []
    items: list[ChapterInfo] = []
    for fn in os.listdir(chapters_dir):
        if fn.startswith("chapter_") and fn.endswith(".txt"):
            try:
                num = int(fn[len("chapter_") : -len(".txt")])
            except ValueError:
                continue
            full = os.path.join(chapters_dir, fn)
            items.append(ChapterInfo(number=num, filename=fn, size=os.path.getsize(full)))
    items.sort(key=lambda c: c.number)
    return items


@router.get("/chapters/{number}", response_model=FileContent)
def read_chapter(number: int) -> FileContent:
    filepath = _get_filepath()
    full = os.path.join(filepath, "chapters", f"chapter_{number}.txt")
    if not os.path.exists(full):
        return FileContent(name=f"chapter_{number}", content="")
    with open(full, "r", encoding="utf-8") as f:
        return FileContent(name=f"chapter_{number}", content=f.read())


@router.post("/chapters/{number}")
def save_chapter(number: int, req: SaveFileReq) -> dict[str, Any]:
    filepath = _get_filepath()
    chapters_dir = os.path.join(filepath, "chapters")
    os.makedirs(chapters_dir, exist_ok=True)
    full = os.path.join(chapters_dir, f"chapter_{number}.txt")
    with open(full, "w", encoding="utf-8") as f:
        f.write(req.content)
    return {"ok": True}


@router.post("/open_folder")
def open_folder() -> dict[str, Any]:
    """在系统文件管理器中打开当前保存路径。"""
    import subprocess
    import sys

    filepath = _get_filepath()
    try:
        if sys.platform.startswith("win"):
            os.startfile(filepath)  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", filepath])
        else:
            subprocess.Popen(["xdg-open", filepath])
        return {"ok": True, "path": filepath}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"打开失败：{exc}") from exc
