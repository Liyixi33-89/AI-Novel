# server.py
# -*- coding: utf-8 -*-
"""
一键启动 Web API 服务。
用法：
    python server.py
默认端口 8000，可通过环境变量 HOST / PORT 覆盖。
"""
from __future__ import annotations

import os

import uvicorn


def main() -> None:
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    reload = os.environ.get("RELOAD", "false").lower() == "true"
    uvicorn.run(
        "backend.app:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
