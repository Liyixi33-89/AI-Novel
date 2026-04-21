import { Loader2 } from "lucide-react";
import { ProjectInfo } from "@/lib/api";
import { cn } from "@/lib/api";

type ProjectSwitcherProps = {
  projects: ProjectInfo[];
  value: string | null;
  onChange: (id: string) => void;
  loading?: boolean;
  label?: string;
  size?: "sm" | "md";
  showBadge?: boolean;
};

const ProjectSwitcher = ({
  projects,
  value,
  onChange,
  loading,
  label = "当前项目",
  size = "md",
  showBadge = true,
}: ProjectSwitcherProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const id = e.target.value;
    if (id && id !== value) onChange(id);
  };

  const current = projects.find((p) => p.id === value) ?? null;

  const selectClass = cn(
    "input !w-auto min-w-[180px]",
    size === "sm" ? "!py-1 text-sm" : "",
    loading && "opacity-60",
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        htmlFor="project-switcher"
        className="text-xs font-medium text-slate-600 dark:text-slate-400"
      >
        {label}
      </label>
      <select
        id="project-switcher"
        className={selectClass}
        value={value ?? ""}
        onChange={handleChange}
        disabled={loading || projects.length === 0}
        aria-label="切换项目"
        tabIndex={0}
      >
        {projects.length === 0 ? <option value="">（无项目）</option> : null}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.is_active ? "★ " : ""}
            {p.name}
            {p.stats.chapter_count > 0 ? `（${p.stats.chapter_count}章）` : ""}
          </option>
        ))}
      </select>
      {loading ? <Loader2 className="h-4 w-4 animate-spin text-brand-500" /> : null}
      {showBadge && current ? (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          路径：{current.meta.filepath || "（未设置）"}
        </span>
      ) : null}
    </div>
  );
};

export default ProjectSwitcher;
