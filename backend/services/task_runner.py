# backend/services/task_runner.py
# -*- coding: utf-8 -*-
"""
后台任务执行器：
- 使用线程池执行同步阻塞的生成任务
- 维护 task_id -> {status, error, started_at, finished_at} 字典
- 任务执行过程中向 log_bus 推送日志
"""
from __future__ import annotations

import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from typing import Any, Callable, Optional

from .log_bus import log_bus


@dataclass
class TaskInfo:
    id: str
    name: str
    status: str = "pending"  # pending | running | success | failed
    error: Optional[str] = None
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    extra: dict[str, Any] = field(default_factory=dict)


class TaskRunner:
    def __init__(self, max_workers: int = 2) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max_workers)
        self._tasks: dict[str, TaskInfo] = {}
        self._lock = threading.Lock()

    def submit(self, name: str, func: Callable[..., Any], *args: Any, **kwargs: Any) -> str:
        task_id = uuid.uuid4().hex[:12]
        info = TaskInfo(id=task_id, name=name)
        with self._lock:
            self._tasks[task_id] = info

        def _wrapped() -> None:
            info.status = "running"
            info.started_at = time.time()
            log_bus.publish(f"▶️ 任务开始：{name} (id={task_id})")
            try:
                func(*args, **kwargs)
                info.status = "success"
                log_bus.publish(f"✅ 任务完成：{name} (id={task_id})")
            except Exception as exc:
                info.status = "failed"
                info.error = f"{type(exc).__name__}: {exc}"
                log_bus.publish(f"❌ 任务失败：{name} (id={task_id}) — {info.error}")
                log_bus.publish(traceback.format_exc())
            finally:
                info.finished_at = time.time()

        self._executor.submit(_wrapped)
        return task_id

    def get(self, task_id: str) -> Optional[dict[str, Any]]:
        with self._lock:
            info = self._tasks.get(task_id)
        if info is None:
            return None
        return asdict(info)

    def list_all(self) -> list[dict[str, Any]]:
        with self._lock:
            return [asdict(t) for t in self._tasks.values()]


task_runner = TaskRunner()
