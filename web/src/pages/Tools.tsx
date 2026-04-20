import { useCallback, useEffect, useState } from "react";
import {
  Database,
  FileUp,
  Loader2,
  PlayCircle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import LogStream from "@/components/LogStream";
import FormField from "@/components/FormField";
import {
  api,
  fetchTask,
  type TaskCreatedResp,
  type TaskInfoResp,
} from "@/lib/api";

type ToolKey = "consistency" | "import" | "clear";

type ToolState = {
  running: boolean;
  lastTask?: TaskInfoResp;
  message?: string;
};

const pollTask = (
  taskId: string,
  onUpdate: (info: TaskInfoResp) => void,
): (() => void) => {
  const timer = window.setInterval(async () => {
    try {
      const info = await fetchTask(taskId);
      onUpdate(info);
      if (info.status === "success" || info.status === "failed") {
        window.clearInterval(timer);
      }
    } catch (err) {
      console.error(err);
      window.clearInterval(timer);
    }
  }, 1500);
  return () => window.clearInterval(timer);
};

const Tools = () => {
  const [states, setStates] = useState<Record<ToolKey, ToolState>>({
    consistency: { running: false },
    import: { running: false },
    clear: { running: false },
  });
  const [knowledgeFile, setKnowledgeFile] = useState<string>("");

  const updateState = useCallback((key: ToolKey, patch: Partial<ToolState>): void => {
    setStates((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  // 启动时读 config 提示当前保存路径（给用户填文件路径做参考）
  const [filepath, setFilepath] = useState<string>("");
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await api.getConfig();
        if (mounted) setFilepath(cfg.other_params?.filepath ?? "");
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleConsistency = async (): Promise<void> => {
    if (states.consistency.running) return;
    updateState("consistency", { running: true, message: undefined, lastTask: undefined });
    try {
      const resp: TaskCreatedResp = await api.consistencyCheck();
      pollTask(resp.task_id, (info) => {
        updateState("consistency", {
          running: info.status === "pending" || info.status === "running",
          lastTask: info,
        });
      });
    } catch (err) {
      const detail = (err as { detail?: string })?.detail ?? String(err);
      updateState("consistency", { running: false, message: `❌ ${detail}` });
    }
  };

  const handleImport = async (): Promise<void> => {
    if (!knowledgeFile.trim()) {
      updateState("import", { message: "❌ 请先填写知识文件路径" });
      return;
    }
    if (states.import.running) return;
    updateState("import", { running: true, message: undefined, lastTask: undefined });
    try {
      const resp: TaskCreatedResp = await api.importKnowledge(knowledgeFile.trim());
      pollTask(resp.task_id, (info) => {
        updateState("import", {
          running: info.status === "pending" || info.status === "running",
          lastTask: info,
        });
      });
    } catch (err) {
      const detail = (err as { detail?: string })?.detail ?? String(err);
      updateState("import", { running: false, message: `❌ ${detail}` });
    }
  };

  const handleClear = async (): Promise<void> => {
    if (states.clear.running) return;
    if (!window.confirm("确定要清空向量库吗？此操作不可撤销。")) return;
    updateState("clear", { running: true, message: undefined });
    try {
      const resp = await api.clearVectorStore();
      updateState("clear", {
        running: false,
        message: resp.ok ? "✅ 向量库已清空" : "⚠️ 向量库不存在或清空失败",
      });
    } catch (err) {
      const detail = (err as { detail?: string })?.detail ?? String(err);
      updateState("clear", { running: false, message: `❌ ${detail}` });
    }
  };

  const renderBadge = (s: ToolState): React.ReactNode => {
    if (s.running) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          <Loader2 className="h-3 w-3 animate-spin" /> 运行中
        </span>
      );
    }
    if (s.lastTask?.status === "success") {
      return (
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
          ✅ 完成
        </span>
      );
    }
    if (s.lastTask?.status === "failed") {
      return (
        <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
          ❌ 失败
        </span>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-slate-900">工具箱</h1>
        <p className="mt-1 text-sm text-slate-500">
          一致性检查、知识库管理。所有异步任务的执行日志将同步显示在右侧。
        </p>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-3">
        <div className="col-span-2 space-y-4 overflow-auto p-6">
          {/* 一致性检查 */}
          <section className="card">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-md border border-indigo-200 bg-indigo-50 p-2 text-indigo-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-800">一致性检查</h3>
                <p className="text-xs text-slate-500">
                  使用「一致性审校 LLM」对当前章节（取自配置 <code>other_params.chapter_num</code>）做冲突检查。
                </p>
              </div>
              {renderBadge(states.consistency)}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {states.consistency.lastTask?.error ?? states.consistency.message ?? ""}
              </span>
              <button
                type="button"
                onClick={handleConsistency}
                disabled={states.consistency.running}
                className="btn-primary"
                aria-label="执行一致性检查"
                tabIndex={0}
              >
                {states.consistency.running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4" />
                )}
                执行
              </button>
            </div>
          </section>

          {/* 导入知识文件 */}
          <section className="card">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-700">
                <FileUp className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-800">导入知识文件</h3>
                <p className="text-xs text-slate-500">
                  将 .txt 文本文件切分后追加到当前保存路径的向量库中。
                </p>
              </div>
              {renderBadge(states.import)}
            </div>
            <div className="space-y-3">
              <FormField
                label="知识文件路径（绝对路径）"
                htmlFor="kf"
                hint={filepath ? `当前向量库位于：${filepath}\\vectorstore` : undefined}
              >
                <input
                  id="kf"
                  className="input font-mono"
                  value={knowledgeFile}
                  onChange={(e) => setKnowledgeFile(e.target.value)}
                  placeholder="C:\\path\\to\\knowledge.txt"
                  tabIndex={0}
                />
              </FormField>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {states.import.lastTask?.error ?? states.import.message ?? ""}
                </span>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={states.import.running}
                  className="btn-primary"
                  aria-label="导入知识文件"
                  tabIndex={0}
                >
                  {states.import.running ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileUp className="h-4 w-4" />
                  )}
                  导入
                </button>
              </div>
            </div>
          </section>

          {/* 清空向量库 */}
          <section className="card">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-rose-700">
                <Database className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-800">清空向量库</h3>
                <p className="text-xs text-slate-500">
                  删除当前保存路径下的整个 <code>vectorstore</code> 目录。注意：不可恢复。
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">{states.clear.message ?? ""}</span>
              <button
                type="button"
                onClick={handleClear}
                disabled={states.clear.running}
                className="btn-danger"
                aria-label="清空向量库"
                tabIndex={0}
              >
                {states.clear.running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                清空
              </button>
            </div>
          </section>
        </div>

        <aside className="col-span-1 border-l border-slate-200 bg-white">
          <LogStream />
        </aside>
      </div>
    </div>
  );
};

export default Tools;
