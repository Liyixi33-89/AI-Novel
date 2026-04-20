# backend/routers/presets.py
# -*- coding: utf-8 -*-
"""小说参数「预设集」管理。

在 config.json 中引入两个新字段，完全向后兼容：
    {
      ...
      "other_params": { ... },           # 始终代表"当前活动预设"（生成接口读这里）
      "novel_presets": { name: OtherParams, ... },   # 🆕 多套预设
      "active_preset": "默认"            # 🆕 激活的预设名
    }

首次访问时若没有 novel_presets，会把现有 other_params 复制为名为"默认"的预设。
激活某预设时，会把它 copy 到 other_params，这样所有生成接口完全无感知。
"""
from __future__ import annotations

import copy
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..schemas import OtherParams
from .config import CONFIG_FILE

from config_manager import load_config, save_config

router = APIRouter(prefix="/api/presets", tags=["presets"])

DEFAULT_PRESET_NAME = "默认"


class PresetIndexResp(BaseModel):
    active: str
    names: list[str]


class PresetCopyReq(BaseModel):
    source: str
    target: str


class ActivateResp(BaseModel):
    active: str
    params: OtherParams


# ---------- 内部工具 ----------
def _load_cfg() -> dict[str, Any]:
    cfg = load_config(CONFIG_FILE)
    if not cfg:
        raise HTTPException(status_code=500, detail="配置文件加载失败")
    return cfg


def _save_cfg(cfg: dict[str, Any]) -> None:
    ok = save_config(cfg, CONFIG_FILE)
    if not ok:
        raise HTTPException(status_code=500, detail="配置保存失败")


def _ensure_presets(cfg: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """确保 cfg 里有 novel_presets / active_preset；若没有则初始化。

    返回 (cfg, changed)。若 changed 为 True，调用方应保存回磁盘。
    """
    changed = False
    other = cfg.get("other_params") or {}
    if "novel_presets" not in cfg or not isinstance(cfg.get("novel_presets"), dict):
        cfg["novel_presets"] = {DEFAULT_PRESET_NAME: copy.deepcopy(other)}
        changed = True
    if "active_preset" not in cfg or not cfg.get("active_preset"):
        # 若已有预设，取第一个；否则用默认名
        names = list(cfg["novel_presets"].keys())
        cfg["active_preset"] = names[0] if names else DEFAULT_PRESET_NAME
        changed = True
    # 如果 active 指向的 preset 不存在，兜底
    if cfg["active_preset"] not in cfg["novel_presets"]:
        # 把当前 other_params 写入作为该名字的预设
        cfg["novel_presets"][cfg["active_preset"]] = copy.deepcopy(other)
        changed = True
    return cfg, changed


def _params_to_dict(p: OtherParams) -> dict[str, Any]:
    if hasattr(p, "model_dump"):
        return p.model_dump()
    return dict(p)


# ---------- API ----------
@router.get("", response_model=PresetIndexResp)
def list_presets() -> PresetIndexResp:
    cfg = _load_cfg()
    cfg, changed = _ensure_presets(cfg)
    if changed:
        _save_cfg(cfg)
    return PresetIndexResp(active=cfg["active_preset"], names=list(cfg["novel_presets"].keys()))


@router.get("/{name}", response_model=OtherParams)
def get_preset(name: str) -> OtherParams:
    cfg = _load_cfg()
    cfg, _ = _ensure_presets(cfg)
    preset = cfg["novel_presets"].get(name)
    if preset is None:
        raise HTTPException(status_code=404, detail=f"预设不存在：{name}")
    return OtherParams(**preset)


# 注意：以下两个 POST 必须写在 /{name} POST 之前，否则 FastAPI 会把 /_copy 当成 name="_copy" 匹配到 save_preset
@router.post("/_copy", response_model=PresetIndexResp)
def copy_preset(req: PresetCopyReq) -> PresetIndexResp:
    src = req.source.strip()
    dst = req.target.strip()
    if not src or not dst:
        raise HTTPException(status_code=400, detail="源或目标预设名为空")
    if src == dst:
        raise HTTPException(status_code=400, detail="源和目标相同")
    cfg = _load_cfg()
    cfg, _ = _ensure_presets(cfg)
    if src not in cfg["novel_presets"]:
        raise HTTPException(status_code=404, detail=f"源预设不存在：{src}")
    if dst in cfg["novel_presets"]:
        raise HTTPException(status_code=409, detail=f"目标预设已存在：{dst}")
    cfg["novel_presets"][dst] = copy.deepcopy(cfg["novel_presets"][src])
    _save_cfg(cfg)
    return PresetIndexResp(active=cfg["active_preset"], names=list(cfg["novel_presets"].keys()))


@router.post("/{name}", response_model=OtherParams)
def save_preset(name: str, payload: OtherParams) -> OtherParams:
    """创建或覆盖某个预设。若该预设是激活预设，则同步写入 other_params。"""
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="预设名不能为空")
    if name.startswith("_"):
        raise HTTPException(status_code=400, detail="预设名不能以下划线开头")
    cfg = _load_cfg()
    cfg, _ = _ensure_presets(cfg)
    data = _params_to_dict(payload)
    cfg["novel_presets"][name] = data
    if cfg.get("active_preset") == name:
        cfg["other_params"] = copy.deepcopy(data)
    _save_cfg(cfg)
    return OtherParams(**data)


@router.post("/{name}/activate", response_model=ActivateResp)
def activate_preset(name: str) -> ActivateResp:
    """把指定预设设为激活，并同步到 other_params 供生成接口使用。"""
    cfg = _load_cfg()
    cfg, _ = _ensure_presets(cfg)
    if name not in cfg["novel_presets"]:
        raise HTTPException(status_code=404, detail=f"预设不存在：{name}")
    cfg["active_preset"] = name
    cfg["other_params"] = copy.deepcopy(cfg["novel_presets"][name])
    _save_cfg(cfg)
    return ActivateResp(active=name, params=OtherParams(**cfg["other_params"]))


@router.delete("/{name}")
def delete_preset(name: str) -> dict[str, Any]:
    cfg = _load_cfg()
    cfg, _ = _ensure_presets(cfg)
    if name not in cfg["novel_presets"]:
        raise HTTPException(status_code=404, detail=f"预设不存在：{name}")
    if len(cfg["novel_presets"]) <= 1:
        raise HTTPException(status_code=400, detail="至少要保留一个预设")
    del cfg["novel_presets"][name]
    # 若删的是激活预设，自动切到第一个
    if cfg.get("active_preset") == name:
        first = next(iter(cfg["novel_presets"].keys()))
        cfg["active_preset"] = first
        cfg["other_params"] = copy.deepcopy(cfg["novel_presets"][first])
    _save_cfg(cfg)
    return {"ok": True, "active": cfg["active_preset"]}


class RenameReq(BaseModel):
    new_name: str


@router.post("/{name}/rename", response_model=PresetIndexResp)
def rename_preset(name: str, req: RenameReq) -> PresetIndexResp:
    new_name = req.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="新名称不能为空")
    cfg = _load_cfg()
    cfg, _ = _ensure_presets(cfg)
    if name not in cfg["novel_presets"]:
        raise HTTPException(status_code=404, detail=f"预设不存在：{name}")
    if new_name == name:
        return PresetIndexResp(active=cfg["active_preset"], names=list(cfg["novel_presets"].keys()))
    if new_name in cfg["novel_presets"]:
        raise HTTPException(status_code=409, detail=f"新名称已存在：{new_name}")
    cfg["novel_presets"][new_name] = cfg["novel_presets"].pop(name)
    if cfg.get("active_preset") == name:
        cfg["active_preset"] = new_name
    _save_cfg(cfg)
    return PresetIndexResp(active=cfg["active_preset"], names=list(cfg["novel_presets"].keys()))
