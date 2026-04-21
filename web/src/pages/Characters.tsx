import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Type,
  UserPlus,
  Users,
} from "lucide-react";
import FormField from "@/components/FormField";
import ProjectSwitcher from "@/components/ProjectSwitcher";
import TextEditor from "@/components/TextEditor";
import {
  api,
  CHARACTER_SECTION_ORDER,
  cn,
  emptyCharacterSections,
  type Character,
  type CharacterItem,
  type CharacterListItem,
  type CharacterSectionKey,
} from "@/lib/api";
import { useLocalProject } from "@/lib/projectContext";

type Mode = "structured" | "raw";

const SECTION_LABELS: Record<CharacterSectionKey, string> = {
  物品: "物品",
  能力: "能力",
  状态: "状态",
  主要角色间关系网: "关系网",
  触发或加深的事件: "事件",
};

const SECTION_HINT: Record<CharacterSectionKey, string> = {
  物品: "武器 / 防具 / 秘宝 / 道具 / 工具 …（括号内为子类型）",
  能力: "特殊技能、招式、天赋",
  状态: "一般填：身体状态 / 心理状态",
  主要角色间关系网: "与其他角色的关系（name 填其他角色名，desc 填关系描述）",
  触发或加深的事件: "事件名：描述",
};

const createEmptyItem = (): CharacterItem => ({ name: "", desc: "", subtype: null });
const createEmptyCharacter = (name: string): Character => ({
  name,
  sections: emptyCharacterSections(),
});

const Characters = () => {
  const { localProjectId, setLocalProjectId, projects } = useLocalProject();
  const [mode, setMode] = useState<Mode>("structured");
  const [list, setList] = useState<CharacterListItem[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<Character | null>(null);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dirty, setDirty] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  const [rawText, setRawText] = useState<string>("");
  const [loadingRaw, setLoadingRaw] = useState<boolean>(false);

  const [expanded, setExpanded] = useState<Record<CharacterSectionKey, boolean>>({
    物品: true,
    能力: true,
    状态: true,
    主要角色间关系网: true,
    触发或加深的事件: true,
  });

  // ---- 列表加载 ----
  const loadList = useCallback(async (): Promise<void> => {
    setLoadingList(true);
    try {
      const items = await api.listCharacters(localProjectId);
      setList(items);
    } catch (err) {
      setMessage(`❌ 加载角色列表失败：${(err as { detail?: string })?.detail ?? String(err)}`);
    } finally {
      setLoadingList(false);
    }
  }, [localProjectId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // 切项目后清除详情选中状态
  useEffect(() => {
    setSelectedName(null);
    setDetail(null);
    setDirty(false);
    setIsCreating(false);
  }, [localProjectId]);

  // ---- 详情加载 ----
  useEffect(() => {
    if (!selectedName || isCreating) return;
    let mounted = true;
    (async () => {
      setLoadingDetail(true);
      setMessage(null);
      try {
        const c = await api.getCharacter(selectedName, localProjectId);
        if (!mounted) return;
        setDetail(c);
        setDirty(false);
      } catch (err) {
        if (!mounted) return;
        setMessage(`❌ ${(err as { detail?: string })?.detail ?? String(err)}`);
      } finally {
        if (mounted) setLoadingDetail(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedName, isCreating, localProjectId]);

  // ---- raw 模式 ----
  useEffect(() => {
    if (mode !== "raw") return;
    let mounted = true;
    (async () => {
      setLoadingRaw(true);
      try {
        const r = await api.readRawCharacters(localProjectId);
        if (mounted) setRawText(r.content ?? "");
      } catch (err) {
        setMessage(`❌ ${(err as { detail?: string })?.detail ?? String(err)}`);
      } finally {
        if (mounted) setLoadingRaw(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [mode, localProjectId]);

  // ---- 动作 ----
  const handleNew = (): void => {
    if (dirty && !window.confirm("当前有未保存的修改，确定放弃？")) return;
    setSelectedName(null);
    setIsCreating(true);
    setDetail(createEmptyCharacter("新角色"));
    setDirty(true);
    setMessage(null);
  };

  const handleSelect = (name: string): void => {
    if (dirty && !window.confirm("当前有未保存的修改，确定放弃？")) return;
    setIsCreating(false);
    setSelectedName(name);
    setDirty(false);
    setMessage(null);
  };

  const handleDelete = async (): Promise<void> => {
    if (!selectedName || isCreating) return;
    if (!window.confirm(`确定删除角色 "${selectedName}"？`)) return;
    try {
      await api.deleteCharacter(selectedName, localProjectId);
      setSelectedName(null);
      setDetail(null);
      setDirty(false);
      setMessage(`✅ 已删除：${selectedName}`);
      await loadList();
    } catch (err) {
      setMessage(`❌ ${(err as { detail?: string })?.detail ?? String(err)}`);
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!detail || saving) return;
    const name = detail.name.trim();
    if (!name) {
      setMessage("❌ 角色名不能为空");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      if (isCreating) {
        const created = await api.createCharacter(detail, localProjectId);
        setIsCreating(false);
        setSelectedName(created.name);
        setDetail(created);
        setMessage(`✅ 已创建：${created.name}`);
      } else if (selectedName) {
        const updated = await api.updateCharacter(selectedName, detail, localProjectId);
        setSelectedName(updated.name);
        setDetail(updated);
        setMessage(`✅ 已保存：${updated.name}`);
      }
      setDirty(false);
      await loadList();
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

  // ---- 更新 detail 的辅助函数 ----
  const updateName = (value: string): void => {
    if (!detail) return;
    setDetail({ ...detail, name: value });
    setDirty(true);
  };

  const updateItem = (
    section: CharacterSectionKey,
    index: number,
    patch: Partial<CharacterItem>,
  ): void => {
    if (!detail) return;
    const items = [...detail.sections[section]];
    items[index] = { ...items[index], ...patch };
    setDetail({
      ...detail,
      sections: { ...detail.sections, [section]: items },
    });
    setDirty(true);
  };

  const addItem = (section: CharacterSectionKey): void => {
    if (!detail) return;
    const items = [...detail.sections[section], createEmptyItem()];
    setDetail({
      ...detail,
      sections: { ...detail.sections, [section]: items },
    });
    setDirty(true);
    setExpanded((prev) => ({ ...prev, [section]: true }));
  };

  const removeItem = (section: CharacterSectionKey, index: number): void => {
    if (!detail) return;
    const items = detail.sections[section].filter((_, i) => i !== index);
    setDetail({
      ...detail,
      sections: { ...detail.sections, [section]: items },
    });
    setDirty(true);
  };

  const toggleSection = (section: CharacterSectionKey): void => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // ---- Raw 模式保存 ----
  const handleSaveRaw = async (next: string): Promise<void> => {
    await api.saveRawCharacters(next, localProjectId);
    await loadList();
  };

  // ---- 搜索过滤 ----
  const filtered = list.filter((c) =>
    search.trim() ? c.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  return (
    <div className="flex h-full flex-col" onKeyDown={handleKeyDown}>
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="rounded-md border border-brand-200 bg-brand-50 p-2 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">角色库</h1>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              解析自 <code>character_state.txt</code>，支持 5 类元素（物品 / 能力 / 状态 / 关系网 / 事件）的增删改查
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectSwitcher
            projects={projects}
            value={localProjectId}
            onChange={setLocalProjectId}
            size="sm"
            label="查看项目"
            showBadge={false}
          />
          <div className="flex rounded-md border border-slate-300 bg-white p-0.5 text-xs dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode("structured")}
              className={cn(
                "rounded px-3 py-1 transition",
                mode === "structured"
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700",
              )}
              aria-label="结构化编辑"
              tabIndex={0}
            >
              <Users className="mr-1 inline h-3.5 w-3.5" />
              结构化
            </button>
            <button
              type="button"
              onClick={() => setMode("raw")}
              className={cn(
                "rounded px-3 py-1 transition",
                mode === "raw"
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700",
              )}
              aria-label="原文编辑"
              tabIndex={0}
            >
              <Type className="mr-1 inline h-3.5 w-3.5" />
              原文
            </button>
          </div>
        </div>
      </header>

      {message ? (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 sm:px-6 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
          {message}
        </div>
      ) : null}

      {mode === "raw" ? (
        <section className="flex-1 overflow-hidden bg-white dark:bg-slate-900">
          {loadingRaw ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
            </div>
          ) : (
            <TextEditor value={rawText} onSave={handleSaveRaw} />
          )}
        </section>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧：列表 */}
          <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  className="input !py-1 pl-7 text-xs"
                  placeholder="搜索角色..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  tabIndex={0}
                  aria-label="搜索角色"
                />
              </div>
              <button
                type="button"
                onClick={() => void loadList()}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="刷新"
                tabIndex={0}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loadingList && "animate-spin")} />
              </button>
            </div>
            <div className="px-3 py-2">
              <button
                type="button"
                onClick={handleNew}
                className="btn-primary w-full !py-1.5 text-xs"
                aria-label="新建角色"
                tabIndex={0}
              >
                <UserPlus className="h-3.5 w-3.5" />
                新建角色
              </button>
            </div>
            <ul className="flex-1 space-y-0.5 overflow-auto px-2 pb-2">
              {filtered.length === 0 && !loadingList ? (
                <li className="px-2 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                  {search ? "无匹配结果" : "暂无角色"}
                </li>
              ) : (
                filtered.map((c) => {
                  const active = !isCreating && selectedName === c.name;
                  return (
                    <li key={c.name}>
                      <button
                        type="button"
                        onClick={() => handleSelect(c.name)}
                        className={cn(
                          "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition",
                          active
                            ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                        )}
                        aria-label={`选择 ${c.name}`}
                        tabIndex={0}
                      >
                        <span className="truncate text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          物{c.item_count} · 能{c.ability_count} · 关系{c.relation_count}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </aside>

          {/* 右侧：详情编辑器 */}
          <section className="flex flex-1 flex-col overflow-hidden bg-white dark:bg-slate-900">
            {loadingDetail ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
              </div>
            ) : !detail ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <Users className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p>请在左侧选择一个角色，或点击"新建角色"开始</p>
              </div>
            ) : (
              <>
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <FormField label="角色名" htmlFor="char-name" className="min-w-0 flex-1">
                      <input
                        id="char-name"
                        className="input"
                        value={detail.name}
                        onChange={(e) => updateName(e.target.value)}
                        placeholder="输入角色名"
                        tabIndex={0}
                      />
                    </FormField>
                  </div>
                  <div className="flex gap-2 self-end">
                    {!isCreating && selectedName ? (
                      <button
                        type="button"
                        onClick={handleDelete}
                        className="btn-danger !px-3 !py-1.5 text-xs"
                        aria-label="删除角色"
                        tabIndex={0}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving || !dirty}
                      className="btn-primary !px-3 !py-1.5 text-xs"
                      aria-label="保存角色"
                      tabIndex={0}
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      保存 <span className="opacity-60">(Ctrl+S)</span>
                    </button>
                  </div>
                </header>

                <div className="flex-1 overflow-auto p-4 sm:p-6">
                  {dirty ? (
                    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                      ● 当前有未保存的修改
                    </div>
                  ) : null}

                  {CHARACTER_SECTION_ORDER.map((sec) => {
                    const items = detail.sections[sec];
                    const open = expanded[sec];
                    const isRelation = sec === "主要角色间关系网";
                    const isItems = sec === "物品";
                    return (
                      <section
                        key={sec}
                        className="card mb-4 !p-0 overflow-hidden"
                      >
                        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => toggleSection(sec)}
                            className="flex items-center gap-2 text-left text-sm font-semibold text-slate-800 dark:text-slate-100"
                            aria-label={`展开/收起 ${sec}`}
                            tabIndex={0}
                          >
                            {open ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            {SECTION_LABELS[sec]}
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              {items.length}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => addItem(sec)}
                            className="btn-secondary !px-2 !py-1 text-xs"
                            aria-label={`添加 ${sec} 条目`}
                            tabIndex={0}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            添加
                          </button>
                        </header>
                        {open ? (
                          <div className="space-y-3 p-4">
                            <p className="text-xs text-slate-400 dark:text-slate-500">{SECTION_HINT[sec]}</p>
                            {items.length === 0 ? (
                              <p className="rounded-md border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
                                暂无条目，点击右上角"添加"
                              </p>
                            ) : (
                              items.map((it, idx) => (
                                <div
                                  key={`${sec}-${idx}`}
                                  className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[180px_120px_1fr_auto] dark:border-slate-700"
                                >
                                  <input
                                    className="input"
                                    value={it.name}
                                    onChange={(e) => updateItem(sec, idx, { name: e.target.value })}
                                    placeholder={isRelation ? "其他角色名" : "名称"}
                                    aria-label="条目名称"
                                    tabIndex={0}
                                  />
                                  {isItems ? (
                                    <input
                                      className="input"
                                      value={it.subtype ?? ""}
                                      onChange={(e) =>
                                        updateItem(sec, idx, {
                                          subtype: e.target.value.trim() ? e.target.value : null,
                                        })
                                      }
                                      placeholder="武器/防具/秘宝..."
                                      aria-label="子类型"
                                      tabIndex={0}
                                    />
                                  ) : (
                                    <div className="hidden md:block" />
                                  )}
                                  <textarea
                                    className="input min-h-[2.5rem] resize-y"
                                    rows={1}
                                    value={it.desc}
                                    onChange={(e) => updateItem(sec, idx, { desc: e.target.value })}
                                    placeholder="描述"
                                    aria-label="描述"
                                    tabIndex={0}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeItem(sec, idx)}
                                    className="self-start rounded-md p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                                    aria-label="删除条目"
                                    tabIndex={0}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default Characters;
