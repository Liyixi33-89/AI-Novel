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

// ---------- Projects ----------
export type ProjectStats = {
  chapter_count: number;
  total_chars: number;
  character_count: number;
  has_architecture: boolean;
  has_directory: boolean;
  has_summary: boolean;
  last_modified: number | null;
  filepath_exists: boolean;
};

export type ProjectInfo = {
  id: string;
  name: string;
  is_active: boolean;
  meta: OtherParams;
  stats: ProjectStats;
};

const withProject = (path: string, projectId?: string | null): string => {
  if (!projectId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}project_id=${encodeURIComponent(projectId)}`;
};

export const api = {
  getConfig: () => apiGet<FullConfig>("/api/config"),
  saveConfig: (cfg: FullConfig) => apiPost<{ ok: boolean }>("/api/config", cfg),
  generateArchitecture: (projectId?: string | null) =>
    apiPost<TaskCreatedResp>("/api/generate/architecture", { project_id: projectId ?? null }),
  generateDirectory: (projectId?: string | null) =>
    apiPost<TaskCreatedResp>("/api/generate/directory", { project_id: projectId ?? null }),
  generateChapterDraft: (req: GenerateChapterDraftReq, projectId?: string | null) =>
    apiPost<TaskCreatedResp>("/api/generate/chapter_draft", { ...req, project_id: projectId ?? null }),
  finalizeChapter: (req: FinalizeChapterReq, projectId?: string | null) =>
    apiPost<TaskCreatedResp>("/api/generate/finalize_chapter", { ...req, project_id: projectId ?? null }),
  readFile: (name: string, projectId?: string | null) =>
    apiGet<FileContentResp>(withProject(`/api/files/${encodeURIComponent(name)}`, projectId)),
  saveFile: (name: string, content: string, projectId?: string | null) =>
    apiPost<{ ok: boolean }>(
      withProject(`/api/files/${encodeURIComponent(name)}`, projectId),
      { content },
    ),
  listChapters: (projectId?: string | null) =>
    apiGet<ChapterInfoResp[]>(withProject("/api/files/chapters/list", projectId)),
  readChapter: (n: number, projectId?: string | null) =>
    apiGet<FileContentResp>(withProject(`/api/files/chapters/${n}`, projectId)),
  saveChapter: (n: number, content: string, projectId?: string | null) =>
    apiPost<{ ok: boolean }>(withProject(`/api/files/chapters/${n}`, projectId), { content }),
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
  consistencyCheck: (projectId?: string | null) =>
    apiPost<TaskCreatedResp>("/api/tools/consistency_check", { project_id: projectId ?? null }),
  importKnowledge: (file_path: string, projectId?: string | null) =>
    apiPost<TaskCreatedResp>("/api/tools/import_knowledge", {
      file_path,
      project_id: projectId ?? null,
    }),
  clearVectorStore: (projectId?: string | null) =>
    apiPost<{ ok: boolean }>("/api/tools/clear_vectorstore", { project_id: projectId ?? null }),
  buildPrompt: (
    payload: {
      chapter_num: number;
      word_number: number;
      user_guidance?: string;
      characters_involved?: string;
      key_items?: string;
      scene_location?: string;
      time_constraint?: string;
    },
    projectId?: string | null,
  ) => apiPost<{ prompt: string }>("/api/tools/build_prompt", { ...payload, project_id: projectId ?? null }),
  // -------- characters --------
  listCharacters: (projectId?: string | null) =>
    apiGet<CharacterListItem[]>(withProject("/api/characters", projectId)),
  getCharacter: (name: string, projectId?: string | null) =>
    apiGet<Character>(withProject(`/api/characters/${encodeURIComponent(name)}`, projectId)),
  createCharacter: (payload: Character, projectId?: string | null) =>
    apiPost<Character>(withProject("/api/characters", projectId), payload),
  updateCharacter: (name: string, payload: Character, projectId?: string | null) =>
    apiPut<Character>(withProject(`/api/characters/${encodeURIComponent(name)}`, projectId), payload),
  renameCharacter: (name: string, new_name: string, projectId?: string | null) =>
    apiPost<Character>(
      withProject(`/api/characters/${encodeURIComponent(name)}/rename`, projectId),
      { new_name },
    ),
  deleteCharacter: (name: string, projectId?: string | null) =>
    apiDelete<{ ok: boolean }>(
      withProject(`/api/characters/${encodeURIComponent(name)}`, projectId),
    ),
  readRawCharacters: (projectId?: string | null) =>
    apiGet<{ content: string }>(withProject("/api/characters/raw/text", projectId)),
  saveRawCharacters: (content: string, projectId?: string | null) =>
    apiPost<{ ok: boolean }>(withProject("/api/characters/raw/text", projectId), { content }),
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
  // -------- projects --------
  listProjects: () => apiGet<ProjectInfo[]>("/api/projects"),
  getProject: (projectId: string) =>
    apiGet<ProjectInfo>(`/api/projects/${encodeURIComponent(projectId)}`),
  createProject: (payload: { name: string; meta: OtherParams; copy_from?: string | null }) =>
    apiPost<ProjectInfo>("/api/projects", payload),
  updateProject: (projectId: string, meta: OtherParams) =>
    apiPut<ProjectInfo>(`/api/projects/${encodeURIComponent(projectId)}`, { meta }),
  activateProject: (projectId: string) =>
    apiPost<ProjectInfo>(`/api/projects/${encodeURIComponent(projectId)}/activate`),
  deleteProject: (projectId: string, deleteFiles = false) =>
    apiPost<{ ok: boolean; active: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/delete`,
      { delete_files: deleteFiles },
    ),
  // -------- misc --------
  openFolder: (projectId?: string | null) =>
    apiPost<{ ok: boolean; path: string }>(withProject("/api/files/open_folder", projectId)),
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
