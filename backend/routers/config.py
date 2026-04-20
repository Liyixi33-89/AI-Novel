# backend/routers/config.py
# -*- coding: utf-8 -*-
"""配置读写 API。"""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException

from config_manager import load_config, save_config

router = APIRouter(prefix="/api/config", tags=["config"])

CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "config.json",
)


@router.get("")
def get_config() -> dict[str, Any]:
    """读取完整 config.json 内容。"""
    cfg = load_config(CONFIG_FILE)
    if not cfg:
        raise HTTPException(status_code=500, detail="配置文件加载失败")
    return cfg


@router.post("")
def update_config(payload: dict[str, Any]) -> dict[str, Any]:
    """保存完整配置。前端一次性提交整个 JSON。"""
    ok = save_config(payload, CONFIG_FILE)
    if not ok:
        raise HTTPException(status_code=500, detail="配置保存失败")
    return {"ok": True}


@router.get("/path")
def get_config_path() -> dict[str, str]:
    return {"path": CONFIG_FILE}
