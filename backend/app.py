# backend/app.py
# -*- coding: utf-8 -*-
"""FastAPI 应用入口。"""
from __future__ import annotations

import asyncio
import os
import sys

# 把项目根目录加入 sys.path，确保可以 import novel_generator / utils / config_manager
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import characters as characters_router
from backend.routers import config as config_router
from backend.routers import files as files_router
from backend.routers import generation as generation_router
from backend.routers import presets as presets_router
from backend.routers import tools as tools_router
from backend.services.log_bus import install_logging_bridge, log_bus


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI Novel Generator Web API",
        version="0.1.0",
        description="Phase 1 MVP —— 4 步生成 + 实时日志 + 配置读写",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    async def _on_startup() -> None:
        loop = asyncio.get_running_loop()
        log_bus.bind_loop(loop)
        install_logging_bridge()
        log_bus.publish("🚀 AI Novel Generator Web API 已启动")

    app.include_router(config_router.router)
    app.include_router(files_router.router)
    app.include_router(generation_router.router)
    app.include_router(tools_router.router)
    app.include_router(characters_router.router)
    app.include_router(presets_router.router)

    @app.get("/api/health")
    def _health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
