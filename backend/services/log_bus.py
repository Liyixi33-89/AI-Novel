# backend/services/log_bus.py
# -*- coding: utf-8 -*-
"""
全局日志总线：
- 拦截 root logger，将所有 logging.info/warning/error 等消息转发到订阅者
- 另外提供 publish() 直接发送自定义日志
- SSE 订阅者通过 subscribe() 拿到一个独立 asyncio.Queue
"""
from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import Optional


class _LogBus:
    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue[str]] = []
        self._lock = threading.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """FastAPI 启动时把主事件循环绑进来，供子线程投递消息使用。"""
        self._loop = loop

    def subscribe(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=1000)
        with self._lock:
            self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[str]) -> None:
        with self._lock:
            if q in self._subscribers:
                self._subscribers.remove(q)

    def publish(self, message: str) -> None:
        """线程安全地把消息广播给所有订阅者。"""
        ts = time.strftime("%H:%M:%S")
        payload = f"[{ts}] {message}"
        with self._lock:
            subs = list(self._subscribers)

        loop = self._loop
        if loop is None:
            return

        for q in subs:
            try:
                loop.call_soon_threadsafe(self._put_nowait_safe, q, payload)
            except RuntimeError:
                # loop 已关闭
                pass

    @staticmethod
    def _put_nowait_safe(q: asyncio.Queue[str], payload: str) -> None:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            # 丢弃最老的
            try:
                q.get_nowait()
                q.put_nowait(payload)
            except Exception:
                pass


log_bus = _LogBus()


class BusLogHandler(logging.Handler):
    """把 Python logging 的消息也转发到总线。"""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
        except Exception:
            msg = record.getMessage()
        log_bus.publish(msg)


def install_logging_bridge() -> None:
    """将 BusLogHandler 挂到 root logger，使 novel_generator 里的 logging.info 也能被订阅到。"""
    root = logging.getLogger()
    # 避免重复挂载
    for h in root.handlers:
        if isinstance(h, BusLogHandler):
            return
    handler = BusLogHandler()
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    root.addHandler(handler)
    if root.level > logging.INFO or root.level == logging.NOTSET:
        root.setLevel(logging.INFO)
