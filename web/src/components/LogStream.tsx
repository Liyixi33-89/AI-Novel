import { useEffect, useRef, useState } from "react";
import { Circle, Trash2 } from "lucide-react";
import { subscribeLogs } from "@/lib/api";

type LogLine = {
  id: number;
  text: string;
};

const MAX_LINES = 500;

const LogStream = () => {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [connected, setConnected] = useState(false);
  const idRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    const close = subscribeLogs({
      onOpen: () => setConnected(true),
      onError: () => setConnected(false),
      onMessage: (msg) => {
        idRef.current += 1;
        const next: LogLine = { id: idRef.current, text: msg };
        setLines((prev) => {
          const merged = [...prev, next];
          if (merged.length > MAX_LINES) merged.splice(0, merged.length - MAX_LINES);
          return merged;
        });
      },
    });
    return close;
  }, []);

  useEffect(() => {
    if (!autoScrollRef.current || !containerRef.current) return;
    containerRef.current.scrollTop = containerRef.current.scrollHeight;
  }, [lines]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = nearBottom;
  };

  const handleClear = () => setLines([]);

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Circle
            className={`h-3 w-3 ${connected ? "fill-emerald-500 text-emerald-500" : "fill-slate-300 text-slate-300"}`}
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            实时日志 {connected ? "（已连接）" : "（未连接）"}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{lines.length} 条</span>
        </div>
        <button
          type="button"
          onClick={handleClear}
          className="btn-secondary !px-2 !py-1 text-xs"
          aria-label="清空日志"
          tabIndex={0}
        >
          <Trash2 className="h-3.5 w-3.5" />
          清空
        </button>
      </header>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-slate-950 px-4 py-3 font-mono text-xs leading-relaxed text-slate-100"
      >
        {lines.length === 0 ? (
          <div className="text-slate-500">等待日志输出…</div>
        ) : (
          lines.map((l) => (
            <div key={l.id} className="whitespace-pre-wrap break-all">
              {l.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
};

export default LogStream;
