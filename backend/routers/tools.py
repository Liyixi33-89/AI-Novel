# backend/routers/tools.py
# -*- coding: utf-8 -*-
"""工具接口：连接测试、模型拉取、一致性检查、知识库导入/清空、提示词预览。"""
from __future__ import annotations

import os
import traceback
from typing import Any

import requests
from fastapi import APIRouter, HTTPException

from ..schemas import (
    BuildPromptReq,
    BuildPromptResp,
    ImportKnowledgeReq,
    ListModelsReq,
    ListModelsResp,
    TaskCreatedResp,
    TestEmbeddingReq,
    TestEmbeddingResp,
    TestLLMReq,
    TestLLMResp,
)
from ..services.log_bus import log_bus
from ..services.task_runner import task_runner
from .config import CONFIG_FILE

from config_manager import load_config
from consistency_checker import check_consistency
from embedding_adapters import create_embedding_adapter
from llm_adapters import create_llm_adapter
from novel_generator.chapter import build_chapter_prompt
from novel_generator.knowledge import import_knowledge_file
from novel_generator.vectorstore_utils import clear_vector_store
from utils import read_file

router = APIRouter(prefix="/api/tools", tags=["tools"])


def _load_cfg() -> dict[str, Any]:
    cfg = load_config(CONFIG_FILE)
    if not cfg:
        raise HTTPException(status_code=500, detail="配置文件加载失败")
    return cfg


# ---------- 1) 连接测试 ----------
@router.post("/test_llm", response_model=TestLLMResp)
def test_llm(req: TestLLMReq) -> TestLLMResp:
    cfg = _load_cfg()
    name = req.llm_name or cfg.get("choose_configs", {}).get("architecture_llm", "")
    llm = cfg.get("llm_configs", {}).get(name)
    if not llm:
        return TestLLMResp(ok=False, error=f"LLM 配置不存在：{name}")
    try:
        adapter = create_llm_adapter(
            interface_format=llm["interface_format"],
            base_url=llm["base_url"],
            model_name=llm["model_name"],
            api_key=llm["api_key"],
            temperature=float(llm.get("temperature", 0.7)),
            max_tokens=int(llm.get("max_tokens", 8192)),
            timeout=int(llm.get("timeout", 600)),
        )
        resp = adapter.invoke(req.prompt)
        if not resp:
            return TestLLMResp(ok=False, error="模型无响应")
        return TestLLMResp(ok=True, response=str(resp)[:500])
    except Exception as exc:
        return TestLLMResp(ok=False, error=f"{type(exc).__name__}: {exc}")


@router.post("/test_embedding", response_model=TestEmbeddingResp)
def test_embedding(req: TestEmbeddingReq) -> TestEmbeddingResp:
    cfg = _load_cfg()
    name = req.embedding_name or cfg.get("last_embedding_interface_format", "")
    emb = cfg.get("embedding_configs", {}).get(name)
    if not emb:
        return TestEmbeddingResp(ok=False, error=f"Embedding 配置不存在：{name}")
    try:
        adapter = create_embedding_adapter(
            emb["interface_format"],
            emb.get("api_key", ""),
            emb.get("base_url", ""),
            emb.get("model_name", ""),
        )
        vec = adapter.embed_query(req.text)
        if not vec:
            return TestEmbeddingResp(ok=False, error="未获取到向量")
        return TestEmbeddingResp(ok=True, dim=len(vec))
    except Exception as exc:
        return TestEmbeddingResp(ok=False, error=f"{type(exc).__name__}: {exc}")


# ---------- 2) 拉取模型列表 ----------
@router.post("/list_models", response_model=ListModelsResp)
def list_models(req: ListModelsReq) -> ListModelsResp:
    fmt = (req.interface_format or "").lower()
    base = req.base_url.rstrip("/")
    try:
        if fmt == "ollama":
            # Ollama: GET {base}/tags 或 /api/tags
            url = base.replace("/v1", "")
            if not url.endswith("/api"):
                url = url + "/api"
            r = requests.get(f"{url}/tags", timeout=10)
            r.raise_for_status()
            data = r.json()
            names = [m.get("name", "") for m in data.get("models", []) if m.get("name")]
            return ListModelsResp(models=sorted(set(names)))
        else:
            # OpenAI 兼容：GET {base}/models
            headers = {"Authorization": f"Bearer {req.api_key}"} if req.api_key else {}
            r = requests.get(f"{base}/models", headers=headers, timeout=10)
            r.raise_for_status()
            data = r.json()
            items = data.get("data") or data.get("models") or []
            names = [item.get("id") or item.get("name") for item in items]
            names = [n for n in names if isinstance(n, str) and n]
            return ListModelsResp(models=sorted(set(names)))
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"请求失败：{exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc


# ---------- 3) 一致性检查（异步任务） ----------
@router.post("/consistency_check", response_model=TaskCreatedResp)
def consistency_check() -> TaskCreatedResp:
    cfg = _load_cfg()
    chosen = cfg.get("choose_configs", {}).get("consistency_review_llm", "")
    llm = cfg.get("llm_configs", {}).get(chosen)
    if not llm:
        raise HTTPException(status_code=400, detail=f"一致性审校 LLM 未配置：{chosen}")

    params = cfg.get("other_params", {}) or {}
    filepath = (params.get("filepath") or "").strip()
    if not filepath:
        raise HTTPException(status_code=400, detail="请先配置保存路径")

    try:
        chap_num = int(params.get("chapter_num", 1) or 1)
    except (TypeError, ValueError):
        chap_num = 1

    def _run() -> None:
        arch_file = os.path.join(filepath, "Novel_architecture.txt")
        char_file = os.path.join(filepath, "character_state.txt")
        sum_file = os.path.join(filepath, "global_summary.txt")
        chap_file = os.path.join(filepath, "chapters", f"chapter_{chap_num}.txt")

        chap_text = read_file(chap_file).strip()
        if not chap_text:
            log_bus.publish(f"⚠️ 第 {chap_num} 章无内容，无法执行一致性检查")
            return

        log_bus.publish(f"开始对第 {chap_num} 章执行一致性检查...")
        result = check_consistency(
            novel_setting=read_file(arch_file),
            character_state=read_file(char_file),
            global_summary=read_file(sum_file),
            chapter_text=chap_text,
            api_key=llm["api_key"],
            base_url=llm["base_url"],
            model_name=llm["model_name"],
            temperature=float(llm.get("temperature", 0.3)),
            interface_format=llm["interface_format"],
            max_tokens=int(llm.get("max_tokens", 8192)),
            timeout=int(llm.get("timeout", 600)),
        )
        log_bus.publish("—— 一致性检查结果 ——")
        for line in (result or "").splitlines():
            log_bus.publish(line)
        log_bus.publish("—— 检查完成 ——")

    task_id = task_runner.submit(f"一致性检查（第{chap_num}章）", _run)
    return TaskCreatedResp(task_id=task_id, name=f"一致性检查（第{chap_num}章）")


# ---------- 4) 知识库导入 ----------
@router.post("/import_knowledge", response_model=TaskCreatedResp)
def import_knowledge(req: ImportKnowledgeReq) -> TaskCreatedResp:
    cfg = _load_cfg()
    params = cfg.get("other_params", {}) or {}
    filepath = (params.get("filepath") or "").strip()
    if not filepath:
        raise HTTPException(status_code=400, detail="请先配置保存路径")

    last = cfg.get("last_embedding_interface_format", "")
    emb = cfg.get("embedding_configs", {}).get(last)
    if not emb:
        raise HTTPException(status_code=400, detail=f"Embedding 配置不存在：{last}")

    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=400, detail=f"文件不存在：{req.file_path}")

    def _run() -> None:
        log_bus.publish(f"开始导入知识文件：{req.file_path}")
        try:
            import_knowledge_file(
                embedding_api_key=emb.get("api_key", ""),
                embedding_url=emb.get("base_url", ""),
                embedding_interface_format=emb.get("interface_format", "OpenAI"),
                embedding_model_name=emb.get("model_name", ""),
                file_path=req.file_path,
                filepath=filepath,
            )
            log_bus.publish("✅ 知识文件导入完成")
        except Exception as exc:
            log_bus.publish(f"❌ 导入失败：{exc}")
            log_bus.publish(traceback.format_exc())

    task_id = task_runner.submit("导入知识文件", _run)
    return TaskCreatedResp(task_id=task_id, name="导入知识文件")


# ---------- 5) 清空向量库 ----------
@router.post("/clear_vectorstore")
def clear_vectorstore() -> dict[str, Any]:
    cfg = _load_cfg()
    params = cfg.get("other_params", {}) or {}
    filepath = (params.get("filepath") or "").strip()
    if not filepath:
        raise HTTPException(status_code=400, detail="请先配置保存路径")
    ok = clear_vector_store(filepath)
    if ok:
        log_bus.publish("🗑 向量库已清空")
    else:
        log_bus.publish("⚠️ 向量库不存在或清空失败")
    return {"ok": ok}


# ---------- 6) 构建章节 prompt（不调用 LLM） ----------
@router.post("/build_prompt", response_model=BuildPromptResp)
def build_prompt(req: BuildPromptReq) -> BuildPromptResp:
    cfg = _load_cfg()
    chosen = cfg.get("choose_configs", {}).get("prompt_draft_llm", "")
    llm = cfg.get("llm_configs", {}).get(chosen)
    if not llm:
        raise HTTPException(status_code=400, detail=f"章节草稿 LLM 未配置：{chosen}")

    last = cfg.get("last_embedding_interface_format", "")
    emb = cfg.get("embedding_configs", {}).get(last, {})

    params = cfg.get("other_params", {}) or {}
    filepath = (params.get("filepath") or "").strip()
    if not filepath:
        raise HTTPException(status_code=400, detail="请先配置保存路径")

    try:
        prompt = build_chapter_prompt(
            api_key=llm["api_key"],
            base_url=llm["base_url"],
            model_name=llm["model_name"],
            filepath=filepath,
            novel_number=req.chapter_num,
            word_number=req.word_number,
            temperature=float(llm.get("temperature", 0.7)),
            user_guidance=req.user_guidance or params.get("user_guidance", ""),
            characters_involved=req.characters_involved or params.get("characters_involved", ""),
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
        )
        return BuildPromptResp(prompt=prompt or "")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}") from exc
