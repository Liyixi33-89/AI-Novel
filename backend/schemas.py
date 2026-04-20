# backend/schemas.py
# -*- coding: utf-8 -*-
"""Pydantic 请求/响应模型。"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class LLMConfig(BaseModel):
    api_key: str = ""
    base_url: str = ""
    model_name: str = ""
    temperature: float = 0.7
    max_tokens: int = 8192
    timeout: int = 600
    interface_format: str = "OpenAI"


class EmbeddingConfig(BaseModel):
    api_key: str = ""
    base_url: str = ""
    model_name: str = ""
    retrieval_k: int = 4
    interface_format: str = "OpenAI"


class OtherParams(BaseModel):
    topic: str = ""
    genre: str = ""
    num_chapters: int = 0
    word_number: int = 0
    filepath: str = ""
    chapter_num: str = "1"
    user_guidance: str = ""
    characters_involved: str = ""
    key_items: str = ""
    scene_location: str = ""
    time_constraint: str = ""


class ChooseConfigs(BaseModel):
    prompt_draft_llm: str = ""
    chapter_outline_llm: str = ""
    architecture_llm: str = ""
    final_chapter_llm: str = ""
    consistency_review_llm: str = ""


class ProxySetting(BaseModel):
    proxy_url: str = "127.0.0.1"
    proxy_port: str = ""
    enabled: bool = False


class WebDavConfig(BaseModel):
    webdav_url: str = ""
    webdav_username: str = ""
    webdav_password: str = ""


class FullConfig(BaseModel):
    last_interface_format: str = "OpenAI"
    last_embedding_interface_format: str = "OpenAI"
    llm_configs: dict[str, LLMConfig] = Field(default_factory=dict)
    embedding_configs: dict[str, EmbeddingConfig] = Field(default_factory=dict)
    other_params: OtherParams = Field(default_factory=OtherParams)
    choose_configs: ChooseConfigs = Field(default_factory=ChooseConfigs)
    proxy_setting: ProxySetting = Field(default_factory=ProxySetting)
    webdav_config: WebDavConfig = Field(default_factory=WebDavConfig)


class TaskCreatedResp(BaseModel):
    task_id: str
    name: str


class TaskInfoResp(BaseModel):
    id: str
    name: str
    status: str
    error: Optional[str] = None
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    extra: dict[str, Any] = Field(default_factory=dict)


class FileContent(BaseModel):
    name: str
    content: str


class SaveFileReq(BaseModel):
    content: str


class ChapterInfo(BaseModel):
    number: int
    filename: str
    size: int


class GenerateChapterDraftReq(BaseModel):
    """生成章节草稿的完整参数。"""

    chapter_num: int = 1
    word_number: int = 3000
    user_guidance: str = ""
    characters_involved: str = ""
    key_items: str = ""
    scene_location: str = ""
    time_constraint: str = ""
    custom_prompt_text: Optional[str] = None


class FinalizeChapterReq(BaseModel):
    chapter_num: int = 1
    word_number: int = 3000
    edited_text: Optional[str] = None  # 若提供则覆盖当前磁盘文件


# ---------- Tools ----------
class TestLLMReq(BaseModel):
    """指定配置名直接测试；若不传则用 choose_configs.architecture_llm。"""

    llm_name: Optional[str] = None
    prompt: str = "Please reply 'OK'"


class TestLLMResp(BaseModel):
    ok: bool
    response: Optional[str] = None
    error: Optional[str] = None


class TestEmbeddingReq(BaseModel):
    embedding_name: Optional[str] = None
    text: str = "测试文本"


class TestEmbeddingResp(BaseModel):
    ok: bool
    dim: Optional[int] = None
    error: Optional[str] = None


class ListModelsReq(BaseModel):
    interface_format: str
    base_url: str
    api_key: str = ""


class ListModelsResp(BaseModel):
    models: list[str] = Field(default_factory=list)


class BuildPromptReq(BaseModel):
    chapter_num: int = 1
    word_number: int = 3000
    user_guidance: str = ""
    characters_involved: str = ""
    key_items: str = ""
    scene_location: str = ""
    time_constraint: str = ""


class BuildPromptResp(BaseModel):
    prompt: str


class ImportKnowledgeReq(BaseModel):
    file_path: str


# ---------- Characters ----------
class CharacterItem(BaseModel):
    name: str
    desc: str = ""
    subtype: Optional[str] = None


class CharacterSections(BaseModel):
    """5 个固定分类，每个分类下是若干条目。"""

    物品: list[CharacterItem] = Field(default_factory=list)
    能力: list[CharacterItem] = Field(default_factory=list)
    状态: list[CharacterItem] = Field(default_factory=list)
    主要角色间关系网: list[CharacterItem] = Field(default_factory=list)
    触发或加深的事件: list[CharacterItem] = Field(default_factory=list)


class Character(BaseModel):
    name: str
    sections: CharacterSections = Field(default_factory=CharacterSections)


class CharacterListItem(BaseModel):
    """角色列表项（不含完整细节，供左侧列表展示）。"""

    name: str
    item_count: int
    ability_count: int
    relation_count: int


class RawCharacterStateResp(BaseModel):
    content: str


class RawCharacterStateReq(BaseModel):
    content: str


class CharacterRenameReq(BaseModel):
    new_name: str
