import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import FormField from "@/components/FormField";
import { api, type FullConfig, type OtherParams } from "@/lib/api";

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

const Params = () => {
  const [cfg, setCfg] = useState<FullConfig | null>(null);
  const [params, setParams] = useState<OtherParams>(DEFAULT_PARAMS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const full = await api.getConfig();
        if (!mounted) return;
        setCfg(full);
        setParams({ ...DEFAULT_PARAMS, ...full.other_params });
      } catch (err) {
        console.error(err);
        setMessage(`❌ 读取配置失败：${(err as { detail?: string })?.detail ?? String(err)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleChange = <K extends keyof OtherParams>(key: K, value: OtherParams[K]): void => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const handleSave = async (): Promise<void> => {
    if (!cfg || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const next: FullConfig = { ...cfg, other_params: params };
      await api.saveConfig(next);
      setCfg(next);
      setMessage("✅ 已保存");
    } catch (err) {
      setMessage(`❌ 保存失败：${(err as { detail?: string })?.detail ?? String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void handleSave();
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" onKeyDown={handleKeyDown}>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">小说参数</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">主题、类型、章节数、字数与保存路径等写入 config.other_params。</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
          aria-label="保存参数"
          tabIndex={0}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存 <span className="opacity-60 text-xs">(Ctrl+S)</span>
        </button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {message ? (
          <div className="mb-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            {message}
          </div>
        ) : null}

        <section className="card mb-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">基础设定</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="主题" htmlFor="p-topic" required>
              <input
                id="p-topic"
                className="input"
                value={params.topic}
                onChange={(e) => handleChange("topic", e.target.value)}
                placeholder="例如：天启轮回 × 宿命终结"
                tabIndex={0}
              />
            </FormField>
            <FormField label="类型" htmlFor="p-genre" required>
              <input
                id="p-genre"
                className="input"
                value={params.genre}
                onChange={(e) => handleChange("genre", e.target.value)}
                placeholder="例如：玄幻 / 悬疑 / 科幻"
                tabIndex={0}
              />
            </FormField>
            <FormField label="章节总数" htmlFor="p-nchap" required hint="用于生成目录时的总章数">
              <input
                id="p-nchap"
                type="number"
                min={0}
                className="input"
                value={params.num_chapters}
                onChange={(e) => handleChange("num_chapters", parseInt(e.target.value || "0", 10))}
                tabIndex={0}
              />
            </FormField>
            <FormField label="每章字数" htmlFor="p-wnum" required>
              <input
                id="p-wnum"
                type="number"
                min={0}
                step={100}
                className="input"
                value={params.word_number}
                onChange={(e) => handleChange("word_number", parseInt(e.target.value || "0", 10))}
                tabIndex={0}
              />
            </FormField>
            <FormField label="保存路径" htmlFor="p-fp" required hint="所有生成文件将保存到此目录" className="md:col-span-2">
              <input
                id="p-fp"
                className="input font-mono"
                value={params.filepath}
                onChange={(e) => handleChange("filepath", e.target.value)}
                placeholder="C:\\novels\\my_novel"
                tabIndex={0}
              />
            </FormField>
            <FormField label="当前章节号" htmlFor="p-cnum" hint="生成章节草稿/定稿时使用的默认章节号">
              <input
                id="p-cnum"
                className="input"
                value={params.chapter_num}
                onChange={(e) => handleChange("chapter_num", e.target.value)}
                tabIndex={0}
              />
            </FormField>
          </div>
        </section>

        <section className="card">
          <h3 className="mb-4 text-sm font-semibold text-slate-800 dark:text-slate-100">章节级引导（可选）</h3>
          <div className="grid grid-cols-1 gap-4">
            <FormField label="内容指导" htmlFor="p-guide" hint="会贯穿整本小说的写作指导">
              <textarea
                id="p-guide"
                rows={3}
                className="input resize-y"
                value={params.user_guidance}
                onChange={(e) => handleChange("user_guidance", e.target.value)}
                tabIndex={0}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="本章涉及角色" htmlFor="p-chars">
                <input
                  id="p-chars"
                  className="input"
                  value={params.characters_involved}
                  onChange={(e) => handleChange("characters_involved", e.target.value)}
                  tabIndex={0}
                />
              </FormField>
              <FormField label="关键道具" htmlFor="p-items">
                <input
                  id="p-items"
                  className="input"
                  value={params.key_items}
                  onChange={(e) => handleChange("key_items", e.target.value)}
                  tabIndex={0}
                />
              </FormField>
              <FormField label="场景地点" htmlFor="p-scene">
                <input
                  id="p-scene"
                  className="input"
                  value={params.scene_location}
                  onChange={(e) => handleChange("scene_location", e.target.value)}
                  tabIndex={0}
                />
              </FormField>
              <FormField label="时间约束" htmlFor="p-time">
                <input
                  id="p-time"
                  className="input"
                  value={params.time_constraint}
                  onChange={(e) => handleChange("time_constraint", e.target.value)}
                  tabIndex={0}
                />
              </FormField>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Params;
