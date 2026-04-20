import { useCallback, useEffect, useState } from "react";
import { BookOpen, FileText, Loader2, RefreshCw, Users } from "lucide-react";
import TextEditor from "@/components/TextEditor";
import { api, cn, type ChapterInfoResp } from "@/lib/api";

type MetaKey = "architecture" | "directory" | "summary" | "character";

type ActiveFile =
  | { type: "meta"; key: MetaKey }
  | { type: "chapter"; number: number };

const META_ITEMS: Array<{ key: MetaKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "architecture", label: "小说架构", icon: BookOpen },
  { key: "directory", label: "章节目录", icon: FileText },
  { key: "summary", label: "全局摘要", icon: FileText },
  { key: "character", label: "角色状态", icon: Users },
];

const Files = () => {
  const [active, setActive] = useState<ActiveFile>({ type: "meta", key: "architecture" });
  const [content, setContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [chapters, setChapters] = useState<ChapterInfoResp[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChapters = useCallback(async (): Promise<void> => {
    setLoadingChapters(true);
    try {
      const list = await api.listChapters();
      setChapters(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingChapters(false);
    }
  }, []);

  const loadContent = useCallback(async (target: ActiveFile): Promise<void> => {
    setLoadingContent(true);
    setError(null);
    try {
      const res =
        target.type === "meta"
          ? await api.readFile(target.key)
          : await api.readChapter(target.number);
      setContent(res.content ?? "");
    } catch (err) {
      const detail = (err as { detail?: string })?.detail ?? String(err);
      setError(detail);
      setContent("");
    } finally {
      setLoadingContent(false);
    }
  }, []);

  useEffect(() => {
    void loadChapters();
  }, [loadChapters]);

  useEffect(() => {
    void loadContent(active);
  }, [active, loadContent]);

  const handleSave = async (next: string): Promise<void> => {
    if (active.type === "meta") {
      await api.saveFile(active.key, next);
    } else {
      await api.saveChapter(active.number, next);
      // 保存章节后刷新列表（可能大小变化）
      void loadChapters();
    }
  };

  const activeTitle =
    active.type === "meta"
      ? META_ITEMS.find((m) => m.key === active.key)?.label ?? active.key
      : `第 ${active.number} 章`;

  const isActiveMeta = (k: MetaKey): boolean => active.type === "meta" && active.key === k;
  const isActiveChapter = (n: number): boolean => active.type === "chapter" && active.number === n;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">文件预览</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">查看或编辑生成的小说文本。保存后会写回磁盘。</p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧文件树 */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">元数据</div>
          <ul className="space-y-0.5 px-2 py-2">
            {META_ITEMS.map(({ key, label, icon: Icon }) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setActive({ type: "meta", key })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition",
                    isActiveMeta(key)
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-100",
                  )}
                  aria-label={label}
                  tabIndex={0}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-y border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>章节（{chapters.length}）</span>
            <button
              type="button"
              onClick={() => void loadChapters()}
              className="text-brand-600 hover:text-brand-700"
              aria-label="刷新章节列表"
              tabIndex={0}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loadingChapters && "animate-spin")} />
            </button>
          </div>
          <ul className="flex-1 space-y-0.5 overflow-auto px-2 py-2">
            {chapters.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-slate-400">
                {loadingChapters ? "加载中..." : "暂无章节"}
              </li>
            ) : (
              chapters.map((c) => (
                <li key={c.number}>
                  <button
                    type="button"
                    onClick={() => setActive({ type: "chapter", number: c.number })}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition",
                      isActiveChapter(c.number)
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-600 hover:bg-slate-100",
                    )}
                    aria-label={`第${c.number}章`}
                    tabIndex={0}
                  >
                    <span>第 {c.number} 章</span>
                    <span className="text-xs text-slate-400">{(c.size / 1024).toFixed(1)}k</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        {/* 右侧编辑器 */}
        <section className="flex flex-1 flex-col bg-white dark:bg-slate-900">
          <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            {activeTitle}
          </div>
          {loadingContent ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
            </div>
          ) : error ? (
            <div className="p-6 text-sm text-rose-600">❌ {error}</div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <TextEditor value={content} onSave={handleSave} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Files;
