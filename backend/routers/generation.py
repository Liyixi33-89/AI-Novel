# backend/routers/generation.py
# -*- coding: utf-8 -*-
"""四步生成流水线 + 任务状态 + SSE 日志流。"""
from __future__ import annotations

import asyncio
import json
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from ..schemas import (
    FinalizeChapterReq,
    GenerateChapterDraftReq,
    TaskCreatedResp,
    TaskInfoResp,
)
from ..services.log_bus import log_bus
from ..services.projects_service import resolve_filepath
from ..services.task_runner import task_runner
from .config import CONFIG_FILE

from config_manager import load_config, save_config
from novel_generator import (
    Chapter_blueprint_generate,
    Novel_architecture_generate,
    finalize_chapter,
    generate_chapter_draft,
)
from novel_generator.finalization import enrich_chapter_text
from utils import clear_file_content, read_file, save_string_to_txt

router = APIRouter(prefix="/api", tags=["generation"])


def _load_cfg() -> dict[str, Any]:
    cfg = load_config(CONFIG_FILE)
    if not cfg:
        raise HTTPException(status_code=500, detail="配置文件加载失败")
    return cfg


def _pick_llm(cfg: dict[str, Any], role_key: str) -> dict[str, Any]:
    """根据 choose_configs[role_key] 找到对应 llm 配置块。"""
    chosen_name = cfg.get("choose_configs", {}).get(role_key, "").strip()
    if not chosen_name:
        raise HTTPException(status_code=400, detail=f"choose_configs.{role_key} 未配置")
    llm_block = cfg.get("llm_configs", {}).get(chosen_name)
    if not llm_block:
        raise HTTPException(
            status_code=400, detail=f"llm_configs 中找不到 {chosen_name}（{role_key}）"
        )
    return llm_block


def _pick_embedding(cfg: dict[str, Any]) -> dict[str, Any]:
    last = cfg.get("last_embedding_interface_format", "").strip()
    emb_all = cfg.get("embedding_configs", {})
    if last and last in emb_all:
        return emb_all[last]
    if emb_all:
        return next(iter(emb_all.values()))
    raise HTTPException(status_code=400, detail="未配置任何 embedding")


def _get_novel_params(
    cfg: dict[str, Any], project_id: str | None = None
) -> dict[str, Any]:
    """根据 project_id 返回参数块：

    - 若 project_id 有效，用对应 preset 作为 params；否则用 other_params（当前激活）
    - 保证 filepath 非空并确保目录存在
    """
    if project_id:
        preset = (cfg.get("novel_presets") or {}).get(project_id)
        if preset is None:
            raise HTTPException(status_code=404, detail=f"项目不存在：{project_id}")
        params = dict(preset)
    else:
        params = dict(cfg.get("other_params", {}) or {})
    try:
        filepath = resolve_filepath(cfg, project_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not filepath:
        raise HTTPException(status_code=400, detail="请先在配置中设置保存路径（filepath）")
    params["filepath"] = filepath
    return params


# ---------- 新增：三类校验（P0-2 / P0-3） ----------
def _require_blueprint_exists(filepath: str) -> None:
    """前置校验：架构 + 目录文件必须存在且非空，否则不允许生成章节。"""
    arch_file = os.path.join(filepath, "Novel_architecture.txt")
    dir_file = os.path.join(filepath, "Novel_directory.txt")
    if not (os.path.exists(arch_file) and os.path.getsize(arch_file) > 0):
        raise HTTPException(
            status_code=400,
            detail="尚未生成小说架构（Novel_architecture.txt 不存在或为空），请先执行 1.生成小说架构。",
        )
    if not (os.path.exists(dir_file) and os.path.getsize(dir_file) > 0):
        raise HTTPException(
            status_code=400,
            detail="尚未生成章节目录（Novel_directory.txt 不存在或为空），请先执行 2.生成章节目录。",
        )


def _require_chapter_in_range(chap_num: int, params: dict[str, Any]) -> None:
    """上限校验：1 <= chap_num <= num_chapters（num_chapters<=0 时放行，表示未约束）。"""
    if chap_num < 1:
        raise HTTPException(status_code=400, detail=f"章节号必须 ≥ 1，当前：{chap_num}")
    num_chapters = int(params.get("num_chapters", 0) or 0)
    if num_chapters > 0 and chap_num > num_chapters:
        raise HTTPException(
            status_code=400,
            detail=f"章节号 {chap_num} 已超过设定总章节数 {num_chapters}，请先在参数中调大章节总数或停止生成。",
        )


def _require_chapter_file_exists(filepath: str, chap_num: int) -> None:
    """定稿前置：chapters/chapter_N.txt 必须存在且非空（正文已生成）。"""
    chapter_file = os.path.join(filepath, "chapters", f"chapter_{chap_num}.txt")
    if not (os.path.exists(chapter_file) and os.path.getsize(chapter_file) > 0):
        raise HTTPException(
            status_code=400,
            detail=f"第 {chap_num} 章草稿不存在或为空，请先生成该章草稿再定稿。",
        )


def _advance_chapter_num(project_id: str | None, chap_num: int) -> None:
    """定稿成功后调用：把 preset.chapter_num 推进到 chap_num+1，并同步 other_params（若激活）。

    注意：为避免并发任务间覆盖，这里每次都重新 load_config 再 save_config。
    """
    try:
        cfg = load_config(CONFIG_FILE) or {}
        presets = cfg.get("novel_presets") or {}
        target: str | None = None
        if project_id and project_id in presets:
            target = project_id
        else:
            # 项目上下文缺失 → 尝试推进当前激活预设
            active = cfg.get("active_preset")
            if active and active in presets:
                target = active
        if not target:
            return
        next_num = max(1, chap_num + 1)
        presets[target]["chapter_num"] = str(next_num)
        # 同步 other_params（若目标为 active）
        if cfg.get("active_preset") == target:
            other = cfg.setdefault("other_params", {})
            other["chapter_num"] = str(next_num)
        save_config(cfg, CONFIG_FILE)
        log_bus.publish(f"✅ 定稿完成，当前章节号已自动推进到 {next_num}")
    except Exception as exc:  # pragma: no cover
        # 推进失败不应影响主流程，仅记录
        log_bus.publish(f"⚠️ 章节号自动推进失败：{exc}")


class _ProjectScopedReq(BaseModel):
    project_id: str | None = None


# ---------- 1) 架构生成 ----------
@router.post("/generate/architecture", response_model=TaskCreatedResp)
def gen_architecture(req: _ProjectScopedReq | None = None) -> TaskCreatedResp:
    project_id = req.project_id if req else None
    cfg = _load_cfg()
    llm = _pick_llm(cfg, "architecture_llm")
    params = _get_novel_params(cfg, project_id)

    def _run() -> None:
        Novel_architecture_generate(
            interface_format=llm["interface_format"],
            api_key=llm["api_key"],
            base_url=llm["base_url"],
            llm_model=llm["model_name"],
            topic=params.get("topic", ""),
            genre=params.get("genre", ""),
            number_of_chapters=int(params.get("num_chapters", 0) or 0),
            word_number=int(params.get("word_number", 0) or 0),
            filepath=params["filepath"],
            user_guidance=params.get("user_guidance", ""),
            temperature=float(llm.get("temperature", 0.7)),
            max_tokens=int(llm.get("max_tokens", 8192)),
            timeout=int(llm.get("timeout", 600)),
        )

    task_id = task_runner.submit("生成小说架构", _run)
    return TaskCreatedResp(task_id=task_id, name="生成小说架构")


# ---------- 2) 章节目录 ----------
@router.post("/generate/directory", response_model=TaskCreatedResp)
def gen_directory(req: _ProjectScopedReq | None = None) -> TaskCreatedResp:
    project_id = req.project_id if req else None
    cfg = _load_cfg()
    llm = _pick_llm(cfg, "chapter_outline_llm")
    params = _get_novel_params(cfg, project_id)

    def _run() -> None:
        Chapter_blueprint_generate(
            interface_format=llm["interface_format"],
            api_key=llm["api_key"],
            base_url=llm["base_url"],
            llm_model=llm["model_name"],
            filepath=params["filepath"],
            number_of_chapters=int(params.get("num_chapters", 0) or 0),
            user_guidance=params.get("user_guidance", ""),
            temperature=float(llm.get("temperature", 0.7)),
            max_tokens=int(llm.get("max_tokens", 8192)),
            timeout=int(llm.get("timeout", 600)),
        )

    task_id = task_runner.submit("生成章节目录", _run)
    return TaskCreatedResp(task_id=task_id, name="生成章节目录")


# ---------- 3) 章节草稿 ----------
@router.post("/generate/chapter_draft", response_model=TaskCreatedResp)
def gen_chapter_draft(req: GenerateChapterDraftReq) -> TaskCreatedResp:
    cfg = _load_cfg()
    llm = _pick_llm(cfg, "prompt_draft_llm")
    emb = _pick_embedding(cfg)
    params = _get_novel_params(cfg, req.project_id)

    chap_num = req.chapter_num
    # P0-2 / P0-3：上限校验 + 前置校验（架构 + 目录）
    _require_chapter_in_range(chap_num, params)
    _require_blueprint_exists(params["filepath"])

    word_number = req.word_number or int(params.get("word_number", 3000) or 3000)

    def _run() -> None:
        generate_chapter_draft(
            api_key=llm["api_key"],
            base_url=llm["base_url"],
            model_name=llm["model_name"],
            filepath=params["filepath"],
            novel_number=chap_num,
            word_number=word_number,
            temperature=float(llm.get("temperature", 0.7)),
            user_guidance=req.user_guidance or params.get("user_guidance", ""),
            characters_involved=req.characters_involved
            or params.get("characters_involved", ""),
            key_items=req.key_items or params.get("key_items", ""),
            scene_location=req.scene_location or params.get("scene_location", ""),
            time_constraint=req.time_constraint or params.get("time_constraint", ""),
            embedding_api_key=emb.get("api_key", ""),
            embedding_url=emb.get("base_url", ""),
            embedding_interface_format=emb.get("interface_format", "OpenAI"),
            embedding_model_name=emb.get("model_name", ""),
            embedding_retrieval_k=int(emb.get("retrieval_k", 2) or 2),
            interface_format=llm["interface_format"],
            max_tokens=int(llm.get("max_tokens", 8192)),
            timeout=int(llm.get("timeout", 600)),
            custom_prompt_text=req.custom_prompt_text,
        )

    task_id = task_runner.submit(f"生成第{chap_num}章草稿", _run)
    return TaskCreatedResp(task_id=task_id, name=f"生成第{chap_num}章草稿")


# ---------- 4) 章节定稿 ----------
@router.post("/generate/finalize_chapter", response_model=TaskCreatedResp)
def gen_finalize(req: FinalizeChapterReq) -> TaskCreatedResp:
    cfg = _load_cfg()
    llm = _pick_llm(cfg, "final_chapter_llm")
    emb = _pick_embedding(cfg)
    params = _get_novel_params(cfg, req.project_id)

    chap_num = req.chapter_num
    # P0-2 / P0-3：上限 + 架构目录 + 草稿文件
    _require_chapter_in_range(chap_num, params)
    _require_blueprint_exists(params["filepath"])
    # 若请求带了 edited_text，则稍后会写入；否则必须已有草稿文件
    if req.edited_text is None:
        _require_chapter_file_exists(params["filepath"], chap_num)

    word_number = req.word_number or int(params.get("word_number", 3000) or 3000)
    project_id_for_advance = req.project_id

    def _run() -> None:
        filepath = params["filepath"]
        chapters_dir = os.path.join(filepath, "chapters")
        os.makedirs(chapters_dir, exist_ok=True)
        chapter_file = os.path.join(chapters_dir, f"chapter_{chap_num}.txt")

        # 若请求带了编辑后的文本，先覆盖
        if req.edited_text is not None:
            clear_file_content(chapter_file)
            save_string_to_txt(req.edited_text, chapter_file)

        # 读取磁盘版本
        edited_text = read_file(chapter_file).strip()
        if not edited_text:
            log_bus.publish(f"⚠️ 第{chap_num}章无内容，终止定稿")
            return

        # 字数不足自动扩写（不再依赖 UI 交互）
        if len(edited_text) < 0.7 * word_number:
            log_bus.publish(
                f"字数不足（{len(edited_text)} < {int(0.7 * word_number)}），自动扩写..."
            )
            enriched = enrich_chapter_text(
                chapter_text=edited_text,
                word_number=word_number,
                api_key=llm["api_key"],
                base_url=llm["base_url"],
                model_name=llm["model_name"],
                temperature=float(llm.get("temperature", 0.7)),
                interface_format=llm["interface_format"],
                max_tokens=int(llm.get("max_tokens", 8192)),
                timeout=int(llm.get("timeout", 600)),
            )
            clear_file_content(chapter_file)
            save_string_to_txt(enriched, chapter_file)

        finalize_chapter(
            novel_number=chap_num,
            word_number=word_number,
            api_key=llm["api_key"],
            base_url=llm["base_url"],
            model_name=llm["model_name"],
            temperature=float(llm.get("temperature", 0.7)),
            filepath=filepath,
            embedding_api_key=emb.get("api_key", ""),
            embedding_url=emb.get("base_url", ""),
            embedding_interface_format=emb.get("interface_format", "OpenAI"),
            embedding_model_name=emb.get("model_name", ""),
            interface_format=llm["interface_format"],
            max_tokens=int(llm.get("max_tokens", 8192)),
            timeout=int(llm.get("timeout", 600)),
        )

        # P0-1：定稿完成后自动推进 chapter_num
        _advance_chapter_num(project_id_for_advance, chap_num)

    task_id = task_runner.submit(f"定稿第{chap_num}章", _run)
    return TaskCreatedResp(task_id=task_id, name=f"定稿第{chap_num}章")


# ---------- 任务状态 ----------
@router.get("/tasks/{task_id}", response_model=TaskInfoResp)
def get_task(task_id: str) -> TaskInfoResp:
    info = task_runner.get(task_id)
    if info is None:
        raise HTTPException(status_code=404, detail="task not found")
    return TaskInfoResp(**info)


@router.get("/tasks")
def list_tasks() -> list[dict[str, Any]]:
    return task_runner.list_all()


# ---------- 实时日志 SSE ----------
@router.get("/logs/stream")
async def logs_stream() -> EventSourceResponse:
    queue = log_bus.subscribe()

    async def event_gen():
        try:
            # 首次连接推送一条问候
            yield {"event": "message", "data": json.dumps({"msg": "🟢 日志流已连接"})}
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield {"event": "message", "data": json.dumps({"msg": msg})}
                except asyncio.TimeoutError:
                    # 心跳保活
                    yield {"event": "ping", "data": "keepalive"}
        except asyncio.CancelledError:
            raise
        finally:
            log_bus.unsubscribe(queue)

    return EventSourceResponse(event_gen())
