# backend/routers/projects.py
# -*- coding: utf-8 -*-
"""项目（小说）CRUD 接口。

"项目"是 novel_preset 的上层封装，每个项目对应一个独立的数据目录。
这里提供比 /api/presets 更丰富的信息（统计、活跃状态），
并允许读取时按 project_id 作用域隔离，供其他 router 复用。
"""
from __future__ import annotations

import copy
from typing import Any

from fastapi import APIRouter, HTTPException

from ..schemas import (
    ProjectCreateReq,
    ProjectDeleteReq,
    ProjectDeleteResp,
    ProjectResp,
    ProjectUpdateReq,
)
from ..services.projects_service import (
    create_project,
    delete_project,
    get_project,
    list_projects,
    update_project_meta,
)
from .config import CONFIG_FILE
from .presets import _ensure_presets  # 复用预设初始化逻辑

from config_manager import load_config, save_config

router = APIRouter(prefix="/api/projects", tags=["projects"])


# ---------- 内部 ----------
def _load_cfg() -> dict[str, Any]:
    cfg = load_config(CONFIG_FILE)
    if not cfg:
        raise HTTPException(status_code=500, detail="配置文件加载失败")
    cfg, changed = _ensure_presets(cfg)
    if changed:
        save_config(cfg, CONFIG_FILE)
    return cfg


def _save_cfg(cfg: dict[str, Any]) -> None:
    if not save_config(cfg, CONFIG_FILE):
        raise HTTPException(status_code=500, detail="配置保存失败")


# ---------- 列表 / 详情 ----------
@router.get("", response_model=list[ProjectResp])
def api_list_projects() -> list[ProjectResp]:
    cfg = _load_cfg()
    return [ProjectResp(**p) for p in list_projects(cfg)]


@router.get("/{project_id}", response_model=ProjectResp)
def api_get_project(project_id: str) -> ProjectResp:
    cfg = _load_cfg()
    try:
        return ProjectResp(**get_project(cfg, project_id))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ---------- 创建 / 更新 / 删除 ----------
@router.post("", response_model=ProjectResp)
def api_create_project(req: ProjectCreateReq) -> ProjectResp:
    cfg = _load_cfg()
    meta_dict = req.meta.model_dump() if hasattr(req.meta, "model_dump") else dict(req.meta)
    try:
        project = create_project(
            cfg,
            name=req.name,
            meta=meta_dict,
            copy_from=req.copy_from,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    _save_cfg(cfg)
    return ProjectResp(**project)


@router.put("/{project_id}", response_model=ProjectResp)
def api_update_project(project_id: str, req: ProjectUpdateReq) -> ProjectResp:
    cfg = _load_cfg()
    meta_dict = req.meta.model_dump() if hasattr(req.meta, "model_dump") else dict(req.meta)
    try:
        project = update_project_meta(cfg, project_id, meta_dict)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    _save_cfg(cfg)
    return ProjectResp(**project)


@router.post("/{project_id}/activate", response_model=ProjectResp)
def api_activate_project(project_id: str) -> ProjectResp:
    """把项目设为默认（影响不带 project_id 的接口）。"""
    cfg = _load_cfg()
    if project_id not in (cfg.get("novel_presets") or {}):
        raise HTTPException(status_code=404, detail=f"项目不存在：{project_id}")
    cfg["active_preset"] = project_id
    cfg["other_params"] = copy.deepcopy(cfg["novel_presets"][project_id])
    _save_cfg(cfg)
    return ProjectResp(**get_project(cfg, project_id))


@router.post("/{project_id}/delete", response_model=ProjectDeleteResp)
def api_delete_project(project_id: str, req: ProjectDeleteReq) -> ProjectDeleteResp:
    """删除项目。DELETE method 无 body，这里用 POST /delete 以传 delete_files。"""
    cfg = _load_cfg()
    try:
        new_active = delete_project(cfg, project_id, delete_files=req.delete_files)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    _save_cfg(cfg)
    return ProjectDeleteResp(ok=True, active=new_active)


@router.delete("/{project_id}", response_model=ProjectDeleteResp)
def api_delete_project_simple(project_id: str) -> ProjectDeleteResp:
    """简单删除（不删磁盘文件）。"""
    cfg = _load_cfg()
    try:
        new_active = delete_project(cfg, project_id, delete_files=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    _save_cfg(cfg)
    return ProjectDeleteResp(ok=True, active=new_active)
