import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  CheckCircle2,
  FolderOpen,
  Loader2,
  PackageOpen,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import Modal from "@/components/Modal";
import { api, cn, OtherParams, ProjectInfo } from "@/lib/api";
import { useProjects } from "@/lib/projectContext";

const DEFAULT_META = (): OtherParams => ({
  topic: "",
  genre: "玄幻",
  num_chapters: 50,
  word_number: 3000,
  filepath: "",
  chapter_num: "1",
  user_guidance: "",
  characters_involved: "",
  key_items: "",
  scene_location: "",
  time_constraint: "",
});

const formatDate = (ts: number | null): string => {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

type CreateFormState = {
  name: string;
  topic: string;
  genre: string;
  num_chapters: number;
  word_number: number;
  filepath: string;
  copy_from: string;
};

const initialCreateState = (): CreateFormState => ({
  name: "",
  topic: "",
  genre: "玄幻",
  num_chapters: 50,
  word_number: 3000,
  filepath: "",
  copy_from: "",
});

const Projects = () => {
  const navigate = useNavigate();
  const { projects, loading, error, refresh, activateProject, setCurrentProjectId } = useProjects();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [form, setForm] = useState<CreateFormState>(initialCreateState());
  const [creating, setCreating] = useState<boolean>(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const guard = async (id: string | null, fn: () => Promise<unknown>): Promise<void> => {
    setBusyId(id);
    try {
      await fn();
      await refresh();
    } catch (err) {
      const e = err as { detail?: string };
      window.alert(`操作失败：${e.detail ?? String(err)}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleActivate = (p: ProjectInfo): void => {
    void guard(p.id, async () => {
      await activateProject(p.id);
    });
  };

  const handleOpen = (p: ProjectInfo): void => {
    void guard(p.id, async () => {
      // 保证 Home / Params 等"全局模式"页面打开的正是此项目
      if (!p.is_active) {
        await activateProject(p.id);
      } else {
        setCurrentProjectId(p.id);
      }
      navigate("/");
    });
  };

  const handleOpenFolder = (p: ProjectInfo): void => {
    void guard(p.id, async () => {
      const r = await api.openFolder(p.id);
      if (!r.ok) window.alert(`打开失败：${r.path}`);
    });
  };

  const handleDelete = (p: ProjectInfo): void => {
    if (projects.length <= 1) {
      window.alert("至少要保留一个项目");
      return;
    }
    const base = `确定删除项目 "${p.name}"？`;
    const deleteFiles = window.confirm(`${base}\n\n确定 = 仅删除配置（保留磁盘文件）\n取消 = 再问一次是否连磁盘一起删`);
    const realDeleteFiles = !deleteFiles
      ? window.confirm(`⚠️ 连同磁盘目录一起删除？\n路径：${p.meta.filepath}\n（无法撤销！）`)
      : false;
    const finalConfirm = deleteFiles || realDeleteFiles;
    if (!finalConfirm) return;
    void guard(p.id, async () => {
      await api.deleteProject(p.id, realDeleteFiles);
    });
  };

  const handleCreate = async (): Promise<void> => {
    const name = form.name.trim();
    if (!name) {
      setCreateErr("名称不能为空");
      return;
    }
    if (name.startsWith("_")) {
      setCreateErr("名称不能以下划线开头");
      return;
    }
    if (projects.some((p) => p.id === name)) {
      setCreateErr("已存在同名项目");
      return;
    }
    setCreating(true);
    setCreateErr(null);
    try {
      const meta = DEFAULT_META();
      meta.topic = form.topic;
      meta.genre = form.genre;
      meta.num_chapters = form.num_chapters;
      meta.word_number = form.word_number;
      meta.filepath = form.filepath;
      await api.createProject({
        name,
        meta,
        copy_from: form.copy_from || null,
      });
      await refresh();
      setCurrentProjectId(name);
      setCreateOpen(false);
      setForm(initialCreateState());
    } catch (err) {
      const e = err as { detail?: string };
      setCreateErr(e.detail ?? String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleOpenCreate = (): void => {
    setForm(initialCreateState());
    setCreateErr(null);
    setCreateOpen(true);
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-slate-50 p-4 dark:bg-slate-950 lg:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
            <BookOpen className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            我的小说
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            每部小说是一个独立项目，拥有自己的保存路径、参数、章节和角色。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="btn-secondary !px-3 !py-1.5 text-sm"
            aria-label="刷新"
            tabIndex={0}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="btn-primary !px-3 !py-1.5 text-sm"
            aria-label="新建项目"
            tabIndex={0}
          >
            <Plus className="h-4 w-4" />
            新建小说
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          加载失败：{error}
        </div>
      ) : null}

      {loading && projects.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          加载项目列表...
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
          <Sparkles className="h-10 w-10 text-slate-300" />
          <div>还没有任何小说项目</div>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="btn-primary !px-4 !py-2 text-sm"
            tabIndex={0}
          >
            <Plus className="h-4 w-4" />
            创建第一部
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              busy={busyId === p.id}
              onActivate={() => handleActivate(p)}
              onOpen={() => handleOpen(p)}
              onOpenFolder={() => handleOpenFolder(p)}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        title="新建小说项目"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="btn-secondary"
              tabIndex={0}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="btn-primary"
              disabled={creating}
              tabIndex={0}
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              创建
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {createErr ? (
            <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {createErr}
            </div>
          ) : null}
          <FormRow label="项目名称 *">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="例如：宿命轮回 / 赛博朋克 2099"
              tabIndex={0}
            />
          </FormRow>
          <FormRow label="主题">
            <input
              className="input"
              value={form.topic}
              onChange={(e) => setForm((s) => ({ ...s, topic: e.target.value }))}
              placeholder="例如：宿命+天道玩弄"
              tabIndex={0}
            />
          </FormRow>
          <div className="grid grid-cols-3 gap-3">
            <FormRow label="体裁">
              <input
                className="input"
                value={form.genre}
                onChange={(e) => setForm((s) => ({ ...s, genre: e.target.value }))}
                tabIndex={0}
              />
            </FormRow>
            <FormRow label="章节数">
              <input
                type="number"
                className="input"
                value={form.num_chapters}
                onChange={(e) => setForm((s) => ({ ...s, num_chapters: Number(e.target.value) || 0 }))}
                tabIndex={0}
              />
            </FormRow>
            <FormRow label="每章字数">
              <input
                type="number"
                className="input"
                value={form.word_number}
                onChange={(e) => setForm((s) => ({ ...s, word_number: Number(e.target.value) || 0 }))}
                tabIndex={0}
              />
            </FormRow>
          </div>
          <FormRow label="保存路径（留空自动生成）">
            <input
              className="input"
              value={form.filepath}
              onChange={(e) => setForm((s) => ({ ...s, filepath: e.target.value }))}
              placeholder="c:\\path\\to\\novel_folder"
              tabIndex={0}
            />
          </FormRow>
          <FormRow label="基于已有项目复制（可选）">
            <select
              className="input"
              value={form.copy_from}
              onChange={(e) => setForm((s) => ({ ...s, copy_from: e.target.value }))}
              tabIndex={0}
            >
              <option value="">— 不复制，从空白开始 —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormRow>
        </div>
      </Modal>
    </div>
  );
};

// ---------- 子组件 ----------
type CardProps = {
  project: ProjectInfo;
  busy: boolean;
  onActivate: () => void;
  onOpen: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
};

const ProjectCard = ({ project, busy, onActivate, onOpen, onOpenFolder, onDelete }: CardProps) => {
  const s = project.stats;
  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-lg border bg-white p-4 shadow-sm transition",
        "hover:shadow-md",
        project.is_active
          ? "border-brand-400 ring-1 ring-brand-300 dark:border-brand-500 dark:ring-brand-600"
          : "border-slate-200 dark:border-slate-800",
        "dark:bg-slate-900",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
            {project.name}
          </h3>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            {project.meta.genre ? <span>{project.meta.genre}</span> : null}
            {project.meta.genre && project.meta.topic ? <span>·</span> : null}
            <span className="truncate">{project.meta.topic || "（未设主题）"}</span>
          </div>
        </div>
        {project.is_active ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            <Star className="h-3 w-3 fill-current" />
            默认
          </span>
        ) : null}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
        <Stat icon={BookOpen} label="章节" value={`${s.chapter_count} / ${project.meta.num_chapters || 0}`} />
        <Stat icon={Users} label="角色" value={s.character_count} />
        <Stat
          icon={CheckCircle2}
          label="架构"
          value={s.has_architecture ? "有" : "缺"}
          highlight={!s.has_architecture}
        />
        <Stat
          icon={CheckCircle2}
          label="目录"
          value={s.has_directory ? "有" : "缺"}
          highlight={!s.has_directory}
        />
      </div>

      <div className="mb-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
        <div className="truncate" title={project.meta.filepath}>
          <FolderOpen className="mr-1 inline h-3 w-3" />
          {project.meta.filepath || "（未设置）"}
        </div>
        <div>最后修改：{formatDate(s.last_modified)}</div>
        <div>
          累计 {s.total_chars.toLocaleString()} 字
          {!s.filepath_exists ? (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
              路径不存在
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onOpen}
          className="btn-primary !px-2.5 !py-1 text-xs"
          aria-label="打开项目"
          tabIndex={0}
          disabled={busy}
        >
          <BookOpen className="h-3.5 w-3.5" />
          打开
        </button>
        {!project.is_active ? (
          <button
            type="button"
            onClick={onActivate}
            className="btn-secondary !px-2.5 !py-1 text-xs"
            aria-label="设为默认"
            tabIndex={0}
            disabled={busy}
          >
            <Star className="h-3.5 w-3.5" />
            设为默认
          </button>
        ) : null}
        <button
          type="button"
          onClick={onOpenFolder}
          className="btn-secondary !px-2.5 !py-1 text-xs"
          aria-label="打开文件夹"
          tabIndex={0}
          disabled={busy}
        >
          <PackageOpen className="h-3.5 w-3.5" />
          文件夹
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="btn-danger !px-2.5 !py-1 text-xs"
          aria-label="删除项目"
          tabIndex={0}
          disabled={busy}
        >
          <Trash2 className="h-3.5 w-3.5" />
          删除
        </button>
      </div>

      {busy ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60 backdrop-blur-sm dark:bg-slate-900/60">
          <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
        </div>
      ) : null}
    </article>
  );
};

type StatProps = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
};
const Stat = ({ icon: Icon, label, value, highlight }: StatProps) => (
  <div className="flex items-center gap-1.5">
    <Icon className={cn("h-3.5 w-3.5", highlight ? "text-amber-500" : "text-slate-400")} />
    <span>{label}：</span>
    <span className={cn("font-medium", highlight ? "text-amber-600" : "text-slate-800 dark:text-slate-200")}>
      {value}
    </span>
  </div>
);

type FormRowProps = { label: string; children: React.ReactNode };
const FormRow = ({ label, children }: FormRowProps) => (
  <div className="space-y-1">
    <div className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</div>
    {children}
  </div>
);

export default Projects;
