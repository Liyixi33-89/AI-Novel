import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  FileCog,
  Loader2,
  PenLine,
  PlayCircle,
  Save,
  Sparkles as SparklesIcon,
  Wand2,
} from "lucide-react";
import LogStream from "@/components/LogStream";
import Modal from "@/components/Modal";
import PresetSwitcher from "@/components/PresetSwitcher";
import { api, fetchTask, type OtherParams, type TaskCreatedResp, type TaskInfoResp } from "@/lib/api";
import { useProjects } from "@/lib/projectContext";

type StepKey = "architecture" | "directory" | "draft" | "finalize";

type Step = {
  key: StepKey;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
};

const STEPS: Step[] = [
  {
    key: "architecture",
    title: "1. 生成小说架构",
    desc: "调用架构 LLM，生成核心种子、角色动力学、世界观与三幕式情节。",
    icon: BookOpen,
    accent: "border-indigo-400",
  },
  {
    key: "directory",
    title: "2. 生成章节目录",
    desc: "基于已有架构生成每章标题与简介（支持分块续写）。",
    icon: FileCog,
    accent: "border-sky-400",
  },
  {
    key: "draft",
    title: "3. 生成章节草稿",
    desc: "根据当前章节号与参数，生成指定章节的草稿正文。",
    icon: PenLine,
    accent: "border-amber-400",
  },
  {
    key: "finalize",
    title: "4. 章节定稿",
    desc: "更新全局摘要、角色状态，并写入向量库。",
    icon: CheckCircle2,
    accent: "border-emerald-400",
  },
];

type RunningMap = Partial<Record<StepKey, TaskInfoResp>>;

const STATUS_MAP: Record<TaskInfoResp["status"], string> = {
  pending: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  failed: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
};

const STATUS_LABEL: Record<TaskInfoResp["status"], string> = {
  pending: "等待中",
  running: "运行中",
  success: "✅ 完成",
  failed: "❌ 失败",
};

const DEFAULT_PARAMS: OtherParams = {
  topic: "",
  genre: "",
  num_chapters: 0,
  word_number: 3000,
  filepath: "",
  chapter_num: "1",
  user_guidance: "",
  characters_involved: "",
  key_items: "",
  scene_location: "",
  time_constraint: "",
};

const StatusBadge = ({ info }: { info?: TaskInfoResp }) => {
  if (!info) return <span className="text-xs text-slate-400 dark:text-slate-500">未执行</span>;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_MAP[info.status]}`}>
      {STATUS_LABEL[info.status]}
    </span>
  );
};

const Home = () => {
  const { refresh: refreshProjects, setCurrentProjectId } = useProjects();
  const [running, setRunning] = useState<RunningMap>({});

  // 预设相关
  const [presetNames, setPresetNames] = useState<string[]>([]);
  const [activePreset, setActivePreset] = useState<string>("");
  const [loadingPreset, setLoadingPreset] = useState<boolean>(true);

  // 当前编辑中的参数（未保存 = dirty）
  const [params, setParams] = useState<OtherParams>(DEFAULT_PARAMS);
  const [dirty, setDirty] = useState<boolean>(false);
  const [savingParams, setSavingParams] = useState<boolean>(false);

  // Prompt 预览弹窗
  const [promptOpen, setPromptOpen] = useState<boolean>(false);
  const [promptLoading, setPromptLoading] = useState<boolean>(false);
  const [promptText, setPromptText] = useState<string>("");
  const [promptError, setPromptError] = useState<string | null>(null);

  // ---- 初始化 & 切换预设时重新加载 ----
  const loadActivePreset = useCallback(async (): Promise<void> => {
    setLoadingPreset(true);
    try {
      const idx = await api.listPresets();
      setPresetNames(idx.names);
      setActivePreset(idx.active);
      const p = await api.getPreset(idx.active);
      setParams({ ...DEFAULT_PARAMS, ...p });
      setDirty(false);
      // 同步刷新项目上下文，使 Files / Characters 等页面感知切换
      void refreshProjects();
      // 主操作台 = 全局模式：保持 currentProjectId 与 active 预设一致
      setCurrentProjectId(idx.active);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPreset(false);
    }
  }, [refreshProjects, setCurrentProjectId]);

  useEffect(() => {
    void loadActivePreset();
  }, [loadActivePreset]);

  // ---- 任务完成后钩子：定稿成功时同步后端新 chapter_num ----
  const handleTaskDone = useCallback(
    async (stepKey: StepKey, info: TaskInfoResp): Promise<void> => {
      if (info.status !== "success") return;
      // 定稿完成：后端已自动把 preset.chapter_num 推进到 N+1
      // 前端重新拉一次 preset，刷新 UI 中的章节号，避免覆盖下一章
      if (stepKey === "finalize" && activePreset) {
        try {
          const p = await api.getPreset(activePreset);
          setParams((prev) => ({ ...prev, ...p }));
          setDirty(false);
          void refreshProjects();
        } catch (err) {
          console.error("刷新 preset 失败", err);
        }
      }
    },
    [activePreset, refreshProjects],
  );

  // ---- 任务轮询 ----
  const pollTask = useCallback(
    (stepKey: StepKey, task: TaskCreatedResp) => {
      setRunning((prev) => ({
        ...prev,
        [stepKey]: {
          id: task.task_id,
          name: task.name,
          status: "pending",
          error: null,
          started_at: null,
          finished_at: null,
          extra: {},
        },
      }));
      const timer = window.setInterval(async () => {
        try {
          const info = await fetchTask(task.task_id);
          setRunning((prev) => ({ ...prev, [stepKey]: info }));
          if (info.status === "success" || info.status === "failed") {
            window.clearInterval(timer);
            void handleTaskDone(stepKey, info);
          }
        } catch (err) {
          console.error(err);
          window.clearInterval(timer);
        }
      }, 1500);
    },
    [handleTaskDone],
  );

  const isRunning = (k: StepKey): boolean => {
    const info = running[k];
    return !!info && (info.status === "pending" || info.status === "running");
  };

  const canRun = !!params.filepath.trim() && !!params.topic.trim() && !dirty;

  // ---- 参数编辑 ----
  const updateField = <K extends keyof OtherParams>(key: K, value: OtherParams[K]): void => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSaveParams = async (): Promise<void> => {
    if (!activePreset || savingParams) return;
    setSavingParams(true);
    try {
      await api.savePreset(activePreset, params);
      setDirty(false);
    } catch (err) {
      const e = err as { detail?: string };
      window.alert(`保存失败：${e.detail ?? String(err)}`);
    } finally {
      setSavingParams(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void handleSaveParams();
    }
  };

  // ---- 生成相关 ----
  const chapterNum = Math.max(1, parseInt(params.chapter_num || "1", 10) || 1);
  const wordNumber = params.word_number > 0 ? params.word_number : 3000;

  // 章节上限状态：num_chapters > 0 且 chapterNum > num_chapters 视为越界
  const numChapters = params.num_chapters || 0;
  const overLimit = numChapters > 0 && chapterNum > numChapters;

  const handleRun = async (step: StepKey): Promise<void> => {
    if (isRunning(step)) return;
    if (dirty) {
      if (!window.confirm("当前参数有未保存的修改，确定放弃并运行旧参数？")) return;
    }
    try {
      let resp: TaskCreatedResp;
      if (step === "architecture") resp = await api.generateArchitecture();
      else if (step === "directory") resp = await api.generateDirectory();
      else if (step === "draft")
        resp = await api.generateChapterDraft({ chapter_num: chapterNum, word_number: wordNumber });
      else resp = await api.finalizeChapter({ chapter_num: chapterNum, word_number: wordNumber });
      pollTask(step, resp);
    } catch (err) {
      const e = err as { detail?: string };
      window.alert(`启动失败：${e.detail ?? String(err)}`);
    }
  };

  // ---- Prompt 预览 ----
  const handlePreviewPrompt = async (): Promise<void> => {
    setPromptOpen(true);
    setPromptLoading(true);
    setPromptError(null);
    setPromptText("");
    try {
      const res = await api.buildPrompt({ chapter_num: chapterNum, word_number: wordNumber });
      setPromptText(res.prompt ?? "");
    } catch (err) {
      const e = err as { detail?: string };
      setPromptError(e.detail ?? String(err));
    } finally {
      setPromptLoading(false);
    }
  };

  const handleClosePrompt = (): void => {
    if (promptLoading) return;
    setPromptOpen(false);
  };

  const handleRunWithCustomPrompt = async (): Promise<void> => {
    if (!promptText.trim()) {
      window.alert("Prompt 不能为空");
      return;
    }
    try {
      const resp = await api.generateChapterDraft({
        chapter_num: chapterNum,
        word_number: wordNumber,
        custom_prompt_text: promptText,
      });
      pollTask("draft", resp);
      setPromptOpen(false);
    } catch (err) {
      const e = err as { detail?: string };
      window.alert(`启动失败：${e.detail ?? String(err)}`);
    }
  };

  return (
    <div className="flex h-full flex-col" onKeyDown={handleKeyDown}>
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">主操作台</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              四步流水线：架构 → 目录 → 章节草稿 → 定稿。参数来自当前预设，切换预设即切换项目。
            </p>
          </div>
          <PresetSwitcher
            active={activePreset}
            names={presetNames}
            onChanged={loadActivePreset}
            loading={loadingPreset}
          />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-3">
        <div className="col-span-1 overflow-auto p-4 sm:p-6 lg:col-span-2">
          {/* ====== 基础设定 ====== */}
          <section className="card mb-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">基础设定</h3>
              <div className="flex items-center gap-2">
                {dirty ? (
                  <span className="text-xs text-amber-600 dark:text-amber-400">● 未保存</span>
                ) : null}
                <button
                  type="button"
                  onClick={handleSaveParams}
                  disabled={!dirty || savingParams || loadingPreset}
                  className="btn-primary !px-3 !py-1 text-xs"
                  aria-label="保存到当前预设"
                  tabIndex={0}
                >
                  {savingParams ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  保存 <span className="opacity-60">(Ctrl+S)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="label" htmlFor="h-topic">
                  主题 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="h-topic"
                  className="input"
                  value={params.topic}
                  onChange={(e) => updateField("topic", e.target.value)}
                  placeholder="例如：天启轮回 × 宿命终结"
                  tabIndex={0}
                />
              </div>
              <div>
                <label className="label" htmlFor="h-genre">
                  类型 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="h-genre"
                  className="input"
                  value={params.genre}
                  onChange={(e) => updateField("genre", e.target.value)}
                  placeholder="玄幻 / 悬疑 / 科幻"
                  tabIndex={0}
                />
              </div>
              <div>
                <label className="label" htmlFor="h-nchap">
                  章节总数
                </label>
                <input
                  id="h-nchap"
                  type="number"
                  min={0}
                  className="input"
                  value={params.num_chapters}
                  onChange={(e) => updateField("num_chapters", parseInt(e.target.value || "0", 10))}
                  tabIndex={0}
                />
              </div>
              <div>
                <label className="label" htmlFor="h-wnum">
                  每章字数
                </label>
                <input
                  id="h-wnum"
                  type="number"
                  min={500}
                  step={100}
                  className="input"
                  value={params.word_number}
                  onChange={(e) => updateField("word_number", parseInt(e.target.value || "3000", 10))}
                  tabIndex={0}
                />
              </div>
              <div className="md:col-span-2">
                <label className="label" htmlFor="h-fp">
                  保存路径 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="h-fp"
                  className="input font-mono text-xs"
                  value={params.filepath}
                  onChange={(e) => updateField("filepath", e.target.value)}
                  placeholder={"C:\\novels\\my_novel"}
                  tabIndex={0}
                />
              </div>
              <div>
                <label className="label" htmlFor="h-cnum">
                  当前章节号
                </label>
                <input
                  id="h-cnum"
                  className="input"
                  value={params.chapter_num}
                  onChange={(e) => updateField("chapter_num", e.target.value)}
                  tabIndex={0}
                />
              </div>
            </div>

            {/* Prompt 预览入口 */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-brand-300 bg-brand-50/50 px-3 py-2 dark:border-brand-500/30 dark:bg-brand-500/5">
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <SparklesIcon className="h-3.5 w-3.5 text-brand-500" />
                <span>生成草稿前预览并编辑章节 Prompt（可选）</span>
              </div>
              <button
                type="button"
                onClick={handlePreviewPrompt}
                disabled={promptLoading || !params.filepath.trim()}
                className="btn-secondary !px-3 !py-1 text-xs"
                aria-label="预览并编辑 Prompt"
                tabIndex={0}
              >
                {promptLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                预览 Prompt
              </button>
            </div>
          </section>

          {/* ====== 生成步骤 ====== */}
          {!params.filepath.trim() || !params.topic.trim() ? (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              ⚠️ 请先填写「主题」和「保存路径」并保存，才能执行生成任务。
            </div>
          ) : dirty ? (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              ● 当前参数有未保存的修改，建议先保存（Ctrl+S）再运行
            </div>
          ) : null}

          {overLimit ? (
            <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              ⛔ 当前章节号 <b>{chapterNum}</b> 已超过设定总章节数 <b>{numChapters}</b>
              ，草稿 / 定稿已被禁用。请先调大「章节总数」或停止继续生成。
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {STEPS.map((step) => {
              const info = running[step.key];
              const isActive = isRunning(step.key);
              const Icon = step.icon;
              const isChapterStep = step.key === "draft" || step.key === "finalize";
              const disabledByLimit = isChapterStep && overLimit;
              const disabled = isActive || !canRun || disabledByLimit;
              const disabledReason = !canRun
                ? "请先填写主题和保存路径并保存"
                : disabledByLimit
                  ? `当前章节号 ${chapterNum} 已超过总章节数 ${numChapters}`
                  : "";
              return (
                <article key={step.key} className={`card flex flex-col gap-3 border-l-4 ${step.accent}`}>
                  <div className="flex items-center gap-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {step.title}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{step.desc}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge info={info} />
                    <button
                      type="button"
                      onClick={() => handleRun(step.key)}
                      disabled={disabled}
                      className="btn-primary"
                      aria-label={step.title}
                      tabIndex={0}
                      title={disabledReason}
                    >
                      {isActive ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          执行中
                        </>
                      ) : (
                        <>
                          <PlayCircle className="h-4 w-4" />
                          运行
                        </>
                      )}
                    </button>
                  </div>
                  {info?.error ? (
                    <pre className="max-h-24 overflow-auto rounded bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                      {info.error}
                    </pre>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <aside className="col-span-1 h-full border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <LogStream />
        </aside>
      </div>

      {/* Prompt 编辑弹窗 */}
      <Modal
        open={promptOpen}
        onClose={handleClosePrompt}
        title={`编辑第 ${chapterNum} 章的 Prompt`}
        description="这里的 Prompt 是后端实时构建的，你可以编辑后再发送给 LLM，实现更精准的控制。"
        size="xl"
        footer={
          <>
            <span className="mr-auto text-xs text-slate-500 dark:text-slate-400">
              {promptText.length} 字符
            </span>
            <button
              type="button"
              onClick={handleClosePrompt}
              className="btn-secondary"
              aria-label="取消"
              tabIndex={0}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleRunWithCustomPrompt}
              disabled={promptLoading || !promptText.trim()}
              className="btn-primary"
              aria-label="使用此 Prompt 生成"
              tabIndex={0}
            >
              <PlayCircle className="h-4 w-4" />
              使用此 Prompt 生成草稿
            </button>
          </>
        }
      >
        {promptLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        ) : promptError ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            ❌ {promptError}
          </div>
        ) : (
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={20}
            spellCheck={false}
            className="input h-[60vh] resize-none font-mono text-xs leading-relaxed"
            aria-label="Prompt 编辑区"
            tabIndex={0}
          />
        )}
      </Modal>
    </div>
  );
};

export default Home;
