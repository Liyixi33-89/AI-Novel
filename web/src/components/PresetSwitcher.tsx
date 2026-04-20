import { useState } from "react";
import { Copy, Loader2, PackageOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { api, cn } from "@/lib/api";

type PresetSwitcherProps = {
  active: string;
  names: string[];
  onChanged: () => Promise<void> | void;
  loading?: boolean;
};

const ACTION_STYLE = "btn-secondary !px-2 !py-1 text-xs";

const PresetSwitcher = ({ active, names, onChanged, loading }: PresetSwitcherProps) => {
  const [busy, setBusy] = useState<boolean>(false);

  const guard = async (fn: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (err) {
      const e = err as { detail?: string };
      window.alert(`操作失败：${e.detail ?? String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const name = e.target.value;
    if (!name || name === active) return;
    void guard(async () => {
      await api.activatePreset(name);
    });
  };

  const handleNew = (): void => {
    const name = window.prompt("新预设的名称（不能以下划线开头）");
    if (!name?.trim()) return;
    if (name.trim().startsWith("_")) {
      window.alert("预设名不能以下划线开头");
      return;
    }
    if (names.includes(name.trim())) {
      window.alert("预设已存在");
      return;
    }
    void guard(async () => {
      // 以当前激活预设为模板复制
      await api.copyPreset(active, name.trim());
      await api.activatePreset(name.trim());
    });
  };

  const handleRename = (): void => {
    const newName = window.prompt("新名称", active);
    if (!newName?.trim() || newName.trim() === active) return;
    if (newName.trim().startsWith("_")) {
      window.alert("预设名不能以下划线开头");
      return;
    }
    void guard(async () => {
      await api.renamePreset(active, newName.trim());
    });
  };

  const handleCopy = (): void => {
    const target = window.prompt(`复制 "${active}" 到新预设，输入新名称`);
    if (!target?.trim()) return;
    if (target.trim().startsWith("_")) {
      window.alert("预设名不能以下划线开头");
      return;
    }
    void guard(async () => {
      await api.copyPreset(active, target.trim());
    });
  };

  const handleDelete = (): void => {
    if (names.length <= 1) {
      window.alert("至少要保留一个预设");
      return;
    }
    if (!window.confirm(`确定删除预设 "${active}"？此操作无法撤销。`)) return;
    void guard(async () => {
      await api.deletePreset(active);
    });
  };

  const handleOpenFolder = (): void => {
    void guard(async () => {
      const r = await api.openFolder();
      if (!r.ok) window.alert(`打开失败：${r.path}`);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, action: () => void): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  const busyOrLoading = busy || loading;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        className="text-xs font-medium text-slate-600 dark:text-slate-400"
        htmlFor="preset-select"
      >
        小说预设
      </label>
      <select
        id="preset-select"
        className={cn("input !py-1 !w-auto min-w-[160px] text-sm", busyOrLoading && "opacity-70")}
        value={active}
        onChange={handleActivate}
        disabled={busyOrLoading}
        aria-label="切换小说预设"
        tabIndex={0}
      >
        {names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      {busyOrLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
      ) : null}

      <div className="ml-1 flex items-center gap-1">
        <button
          type="button"
          onClick={handleNew}
          onKeyDown={(e) => handleKeyDown(e, handleNew)}
          className={ACTION_STYLE}
          aria-label="新建预设"
          title="新建预设（复制当前）"
          tabIndex={0}
          disabled={busyOrLoading}
        >
          <Plus className="h-3.5 w-3.5" />
          新建
        </button>
        <button
          type="button"
          onClick={handleCopy}
          onKeyDown={(e) => handleKeyDown(e, handleCopy)}
          className={ACTION_STYLE}
          aria-label="复制预设"
          title="复制当前预设"
          tabIndex={0}
          disabled={busyOrLoading}
        >
          <Copy className="h-3.5 w-3.5" />
          复制
        </button>
        <button
          type="button"
          onClick={handleRename}
          onKeyDown={(e) => handleKeyDown(e, handleRename)}
          className={ACTION_STYLE}
          aria-label="重命名预设"
          title="重命名"
          tabIndex={0}
          disabled={busyOrLoading}
        >
          <Pencil className="h-3.5 w-3.5" />
          改名
        </button>
        <button
          type="button"
          onClick={handleOpenFolder}
          onKeyDown={(e) => handleKeyDown(e, handleOpenFolder)}
          className={ACTION_STYLE}
          aria-label="打开保存文件夹"
          title="打开保存文件夹"
          tabIndex={0}
          disabled={busyOrLoading}
        >
          <PackageOpen className="h-3.5 w-3.5" />
          文件夹
        </button>
        <button
          type="button"
          onClick={handleDelete}
          onKeyDown={(e) => handleKeyDown(e, handleDelete)}
          className="btn-danger !px-2 !py-1 text-xs"
          aria-label="删除当前预设"
          title="删除当前预设"
          tabIndex={0}
          disabled={busyOrLoading}
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </button>
      </div>
    </div>
  );
};

export default PresetSwitcher;
