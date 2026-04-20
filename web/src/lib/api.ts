import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: Array<string | undefined | null | false>): string =>
  twMerge(clsx(inputs));

export type ApiError = {
  status: number;
  detail: string;
};

const handleResponse = async <T,>(res: Response): Promise<T> => {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw { status: res.status, detail } as ApiError;
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
};

export const apiGet = async <T,>(path: string): Promise<T> => {
  const res = await fetch(path, { method: "GET" });
  return handleResponse<T>(res);
};

export const apiPost = async <T,>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleResponse<T>(res);
};

export const apiPut = async <T,>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleResponse<T>(res);
};

export const apiDelete = async <T,>(path: string): Promise<T> => {
  const res = await fetch(path, { method: "DELETE" });
  return handleResponse<T>(res);
};

export type TaskCreatedResp = { task_id: string; name: string };

export type TaskInfoResp = {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "failed";
  error: string | null;
  started_at: number | null;
  finished_at: number | null;
  extra: Record<string, unknown>;
};

export const fetchTask = (taskId: string) => apiGet<TaskInfoResp>(`/api/tasks/${taskId}`);

export type LogMessage = { msg: string };

export type SubscribeLogsOptions = {
  onMessage: (msg: string) => void;
  onOpen?: () => void;
  onError?: (ev: Event) => void;
};

/**
 * 订阅服务器日志 SSE 流，返回一个关闭函数。
 */
export const subscribeLogs = ({ onMessage, onOpen, onError }: SubscribeLogsOptions): (() => void) => {
  const es = new EventSource("/api/logs/stream");

  es.onopen = () => {
    onOpen?.();
  };

  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as LogMessage;
      if (data?.msg) onMessage(data.msg);
    } catch {
      onMessage(ev.data);
    }
  };

  es.onerror = (ev) => {
    onError?.(ev);
  };

  return () => es.close();
};

export type GenerateChapterDraftReq = {
  chapter_num: number;
  word_number: number;
  user_guidance?: string;
  characters_involved?: string;
  key_items?: string;
  scene_location?: string;
  time_constraint?: string;
  custom_prompt_text?: string | null;
};

export type FinalizeChapterReq = {
  chapter_num: number;
  word_number: number;
  edited_text?: string | null;
};

export type FileContentResp = { name: string; content: string };
export type ChapterInfoResp = { number: number; filename: string; size: number };

export type LLMConfigItem = {
  api_key: string;
  base_url: string;
  model_name: string;
  temperature: number;
  max_tokens: number;
  timeout: number;
  interface_format: string;
};

export type EmbeddingConfigItem = {
  api_key: string;
  base_url: string;
  model_name: string;
  retrieval_k: number;
  interface_format: string;
};

export type OtherParams = {
  topic: string;
  genre: string;
  num_chapters: number;
  word_number: number;
  filepath: string;
  chapter_num: string;
  user_guidance: string;
  characters_involved: string;
  key_items: string;
  scene_location: string;
  time_constraint: string;
};

export type ChooseConfigs = {
  prompt_draft_llm: string;
  chapter_outline_llm: string;
  architecture_llm: string;
  final_chapter_llm: string;
  consistency_review_llm: string;
};

export type FullConfig = {
  last_interface_format: string;
  last_embedding_interface_format: string;
  llm_configs: Record<string, LLMConfigItem>;
  embedding_configs: Record<string, EmbeddingConfigItem>;
  other_params: OtherParams;
  choose_configs: ChooseConfigs;
  proxy_setting: { proxy_url: string; proxy_port: string; enabled: boolean };
  webdav_config: { webdav_url: string; webdav_username: string; webdav_password: string };
};

export const api = {
  getConfig: () => apiGet<FullConfig>("/api/config"),
  saveConfig: (cfg: FullConfig) => apiPost<{ ok: boolean }>("/api/config", cfg),
  generateArchitecture: () => apiPost<TaskCreatedResp>("/api/generate/architecture"),
  generateDirectory: () => apiPost<TaskCreatedResp>("/api/generate/directory"),
  generateChapterDraft: (req: GenerateChapterDraftReq) =>
    apiPost<TaskCreatedResp>("/api/generate/chapter_draft", req),
  finalizeChapter: (req: FinalizeChapterReq) =>
    apiPost<TaskCreatedResp>("/api/generate/finalize_chapter", req),
  readFile: (name: string) => apiGet<FileContentResp>(`/api/files/${encodeURIComponent(name)}`),
  saveFile: (name: string, content: string) =>
    apiPost<{ ok: boolean }>(`/api/files/${encodeURIComponent(name)}`, { content }),
  listChapters: () => apiGet<ChapterInfoResp[]>("/api/files/chapters/list"),
  readChapter: (n: number) => apiGet<FileContentResp>(`/api/files/chapters/${n}`),
  saveChapter: (n: number, content: string) =>
    apiPost<{ ok: boolean }>(`/api/files/chapters/${n}`, { content }),
  // -------- tools --------
  testLLM: (llm_name?: string) =>
    apiPost<{ ok: boolean; response?: string; error?: string }>("/api/tools/test_llm", {
      llm_name: llm_name ?? null,
    }),
  testEmbedding: (embedding_name?: string) =>
    apiPost<{ ok: boolean; dim?: number; error?: string }>("/api/tools/test_embedding", {
      embedding_name: embedding_name ?? null,
    }),
  listModels: (payload: { interface_format: string; base_url: string; api_key: string }) =>
    apiPost<{ models: string[] }>("/api/tools/list_models", payload),
  consistencyCheck: () => apiPost<TaskCreatedResp>("/api/tools/consistency_check"),
  importKnowledge: (file_path: string) =>
    apiPost<TaskCreatedResp>("/api/tools/import_knowledge", { file_path }),
  clearVectorStore: () => apiPost<{ ok: boolean }>("/api/tools/clear_vectorstore"),
  buildPrompt: (payload: {
    chapter_num: number;
    word_number: number;
    user_guidance?: string;
    characters_involved?: string;
    key_items?: string;
    scene_location?: string;
    time_constraint?: string;
  }) => apiPost<{ prompt: string }>("/api/tools/build_prompt", payload),
  // -------- characters --------
  listCharacters: () => apiGet<CharacterListItem[]>("/api/characters"),
  getCharacter: (name: string) =>
    apiGet<Character>(`/api/characters/${encodeURIComponent(name)}`),
  createCharacter: (payload: Character) =>
    apiPost<Character>("/api/characters", payload),
  updateCharacter: (name: string, payload: Character) =>
    apiPut<Character>(`/api/characters/${encodeURIComponent(name)}`, payload),
  renameCharacter: (name: string, new_name: string) =>
    apiPost<Character>(`/api/characters/${encodeURIComponent(name)}/rename`, { new_name }),
  deleteCharacter: (name: string) =>
    apiDelete<{ ok: boolean }>(`/api/characters/${encodeURIComponent(name)}`),
  readRawCharacters: () => apiGet<{ content: string }>("/api/characters/raw/text"),
  saveRawCharacters: (content: string) =>
    apiPost<{ ok: boolean }>("/api/characters/raw/text", { content }),
  // -------- presets --------
  listPresets: () =>
    apiGet<{ active: string; names: string[] }>("/api/presets"),
  getPreset: (name: string) =>
    apiGet<OtherParams>(`/api/presets/${encodeURIComponent(name)}`),
  savePreset: (name: string, payload: OtherParams) =>
    apiPost<OtherParams>(`/api/presets/${encodeURIComponent(name)}`, payload),
  activatePreset: (name: string) =>
    apiPost<{ active: string; params: OtherParams }>(
      `/api/presets/${encodeURIComponent(name)}/activate`,
    ),
  deletePreset: (name: string) =>
    apiDelete<{ ok: boolean; active: string }>(`/api/presets/${encodeURIComponent(name)}`),
  copyPreset: (source: string, target: string) =>
    apiPost<{ active: string; names: string[] }>("/api/presets/_copy", { source, target }),
  renamePreset: (name: string, new_name: string) =>
    apiPost<{ active: string; names: string[] }>(
      `/api/presets/${encodeURIComponent(name)}/rename`,
      { new_name },
    ),
  // -------- misc --------
  openFolder: () => apiPost<{ ok: boolean; path: string }>("/api/files/open_folder"),
};

// ---------- Character 相关类型 ----------
export const CHARACTER_SECTION_ORDER: readonly CharacterSectionKey[] = [
  "物品",
  "能力",
  "状态",
  "主要角色间关系网",
  "触发或加深的事件",
] as const;

export type CharacterSectionKey =
  | "物品"
  | "能力"
  | "状态"
  | "主要角色间关系网"
  | "触发或加深的事件";

export type CharacterItem = {
  name: string;
  desc: string;
  subtype?: string | null;
};

export type CharacterSections = Record<CharacterSectionKey, CharacterItem[]>;

export type Character = {
  name: string;
  sections: CharacterSections;
};

export type CharacterListItem = {
  name: string;
  item_count: number;
  ability_count: number;
  relation_count: number;
};

export const emptyCharacterSections = (): CharacterSections => ({
  物品: [],
  能力: [],
  状态: [],
  主要角色间关系网: [],
  触发或加深的事件: [],
});
