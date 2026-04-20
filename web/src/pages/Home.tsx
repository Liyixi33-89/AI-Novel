import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2, FileCog, Loader2, PenLine, PlayCircle } from "lucide-react";
import LogStream from "@/components/LogStream";
import {
  api,
  fetchTask,
  type TaskCreatedResp,
  type TaskInfoResp,
} from "@/lib/api";

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
    accent: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  {
    key: "directory",
    title: "2. 生成章节目录",
    desc: "基于已有架构生成每章标题与简介（支持分块续写）。",
    icon: FileCog,
    accent: "bg-sky-50 text-sky-700 border-sky-200",
  },
  {
    key: "draft",
    title: "3. 生成章节草稿",
    desc: "根据当前章节号与参数，生成指定章节的草稿正文。",
    icon: PenLine,
    accent: "bg-amber-50 text-amber-700 border-amber-200",
  },
  {
    key: "finalize",
    title: "4. 章节定稿",
    desc: "更新全局摘要、角色状态，并写入向量库。",
    icon: CheckCircle2,
    accent: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
];

type RunningMap = Partial<Record<StepKey, TaskInfoResp>>;

const Home = () => {
  const [running, setRunning] = useState<RunningMap>({});
  const [chapterNum, setChapterNum] = useState<number>(1);
  const [wordNumber, setWordNumber] = useState<number>(3000);
  const [filepath, setFilepath] = useState<string>("");
  const [loadingParams, setLoadingParams] = useState(true);

  // 拉取 config 中保存路径与章节号作为默认值
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await api.getConfig();
        if (!mounted) return;
        const op = cfg.other_params;
        if (op?.filepath) setFilepath(op.filepath);
        if (op?.chapter_num) {
          const n = parseInt(op.chapter_num, 10);
          if (!Number.isNaN(n) && n > 0) setChapterNum(n);
        }
        if (op?.word_number && op.word_number > 0) setWordNumber(op.word_number);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoadingParams(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 轮询任务状态直到结束
  const pollTask = useCallback((stepKey: StepKey, task: TaskCreatedResp) => {
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
        }
      } catch (err) {
        console.error(err);
        window.clearInterval(timer);
      }
    }, 1500);
  }, []);

  const isRunning = (k: StepKey): boolean => {
    const info = running[k];
    return !!info && (info.status === "pending" || info.status === "running");
  };

  const handleRun = async (step: StepKey) => {
    if (isRunning(step)) return;
    try {
      let resp: TaskCreatedResp;
      if (step === "architecture") {
        resp = await api.generateArchitecture();
      } else if (step === "directory") {
        resp = await api.generateDirectory();
      } else if (step === "draft") {
        resp = await api.generateChapterDraft({
          chapter_num: chapterNum,
          word_number: wordNumber,
        });
      } else {
        resp = await api.finalizeChapter({
          chapter_num: chapterNum,
          word_number: wordNumber,
        });
      }
      pollTask(step, resp);
    } catch (err) {
      const e = err as { detail?: string; status?: number };
      alert(`启动失败：${e.detail ?? String(err)}`);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-slate-900">主操作台</h1>
        <p className="mt-1 text-sm text-slate-500">
          四步流水线：架构 → 目录 → 章节草稿 → 定稿。所有任务在后台线程执行，实时日志在右侧显示。
        </p>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-3">
        {/* 左侧 2/3：步骤卡片与参数 */}
        <div className="col-span-2 overflow-auto p-6">
          <section className="card mb-5">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">章节参数</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="label" htmlFor="chap-num">
                  章节号
                </label>
                <input
                  id="chap-num"
                  type="number"
                  min={1}
                  className="input"
                  value={chapterNum}
                  onChange={(e) => setChapterNum(parseInt(e.target.value || "1", 10))}
                  tabIndex={0}
                />
              </div>
              <div>
                <label className="label" htmlFor="word-num">
                  目标字数
                </label>
                <input
                  id="word-num"
                  type="number"
                  min={500}
                  step={100}
                  className="input"
                  value={wordNumber}
                  onChange={(e) => setWordNumber(parseInt(e.target.value || "3000", 10))}
                  tabIndex={0}
                />
              </div>
              <div>
                <label className="label">保存路径</label>
                <div className="input !bg-slate-50 !text-slate-500 truncate" title={filepath}>
                  {loadingParams ? "加载中..." : filepath || "（未配置，请前往配置页）"}
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {STEPS.map((step) => {
              const info = running[step.key];
              const running_ = isRunning(step.key);
              const Icon = step.icon;
              return (
                <article
                  key={step.key}
                  className={`card flex flex-col gap-3 border-l-4 ${step.accent.split(" ").pop()}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-md border p-2 ${step.accent}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-slate-800">{step.title}</h4>
                      <p className="text-xs text-slate-500">{step.desc}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge info={info} />
                    <button
                      type="button"
                      onClick={() => handleRun(step.key)}
                      disabled={running_}
                      className="btn-primary"
                      aria-label={step.title}
                      tabIndex={0}
                    >
                      {running_ ? (
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
                    <pre className="max-h-24 overflow-auto rounded bg-rose-50 p-2 text-xs text-rose-700">
                      {info.error}
                    </pre>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        {/* 右侧 1/3：实时日志 */}
        <aside className="col-span-1 h-full border-l border-slate-200 bg-white">
          <LogStream />
        </aside>
      </div>
    </div>
  );
};

const StatusBadge = ({ info }: { info?: TaskInfoResp }) => {
  if (!info) {
    return <span className="text-xs text-slate-400">未执行</span>;
  }
  const map: Record<TaskInfoResp["status"], string> = {
    pending: "bg-slate-100 text-slate-600",
    running: "bg-blue-100 text-blue-700",
    success: "bg-emerald-100 text-emerald-700",
    failed: "bg-rose-100 text-rose-700",
  };
  const label: Record<TaskInfoResp["status"], string> = {
    pending: "等待中",
    running: "运行中",
    success: "✅ 完成",
    failed: "❌ 失败",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[info.status]}`}>
      {label[info.status]}
    </span>
  );
};

export default Home;
