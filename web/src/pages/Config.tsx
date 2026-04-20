import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Plug, Plus, Save, Trash2 } from "lucide-react";
import FormField from "@/components/FormField";
import {
  api,
  cn,
  type EmbeddingConfigItem,
  type FullConfig,
  type LLMConfigItem,
} from "@/lib/api";

type TabKey = "llm" | "embedding" | "choose";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "llm", label: "LLM 配置" },
  { key: "embedding", label: "Embedding 配置" },
  { key: "choose", label: "角色选择" },
];

const INTERFACE_FORMATS = ["OpenAI", "Ollama", "Azure", "Gemini", "Anthropic"];

const DEFAULT_LLM: LLMConfigItem = {
  api_key: "",
  base_url: "https://api.openai.com/v1",
  model_name: "",
  temperature: 0.7,
  max_tokens: 8192,
  timeout: 600,
  interface_format: "OpenAI",
};

const DEFAULT_EMBEDDING: EmbeddingConfigItem = {
  api_key: "",
  base_url: "https://api.openai.com/v1",
  model_name: "",
  retrieval_k: 4,
  interface_format: "OpenAI",
};

const CHOOSE_KEYS: Array<{ key: keyof FullConfig["choose_configs"]; label: string }> = [
  { key: "architecture_llm", label: "架构生成 LLM" },
  { key: "chapter_outline_llm", label: "章节目录 LLM" },
  { key: "prompt_draft_llm", label: "章节草稿 LLM" },
  { key: "final_chapter_llm", label: "章节定稿 LLM" },
  { key: "consistency_review_llm", label: "一致性审校 LLM" },
];

const Config = () => {
  const [cfg, setCfg] = useState<FullConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("llm");
  const [selectedLLM, setSelectedLLM] = useState<string>("");
  const [selectedEmbedding, setSelectedEmbedding] = useState<string>("");
  const [testing, setTesting] = useState<boolean>(false);
  const [fetchingModels, setFetchingModels] = useState<boolean>(false);
  const [modelCandidates, setModelCandidates] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const full = await api.getConfig();
        if (!mounted) return;
        setCfg(full);
        const llmKeys = Object.keys(full.llm_configs);
        const embKeys = Object.keys(full.embedding_configs);
        if (llmKeys.length > 0) setSelectedLLM(llmKeys[0]);
        if (embKeys.length > 0) setSelectedEmbedding(embKeys[0]);
      } catch (err) {
        setMessage(`❌ 读取配置失败：${(err as { detail?: string })?.detail ?? String(err)}`);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const llmNames = useMemo(() => (cfg ? Object.keys(cfg.llm_configs) : []), [cfg]);
  const embNames = useMemo(() => (cfg ? Object.keys(cfg.embedding_configs) : []), [cfg]);

  const handleSave = async (): Promise<void> => {
    if (!cfg || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.saveConfig(cfg);
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

  // -------- LLM 操作 --------
  const handleUpdateLLM = <K extends keyof LLMConfigItem>(field: K, value: LLMConfigItem[K]): void => {
    if (!cfg || !selectedLLM) return;
    setCfg({
      ...cfg,
      llm_configs: {
        ...cfg.llm_configs,
        [selectedLLM]: { ...cfg.llm_configs[selectedLLM], [field]: value },
      },
    });
    setMessage(null);
  };

  const handleAddLLM = (): void => {
    if (!cfg) return;
    const name = window.prompt("输入新 LLM 配置名称（例如 DeepSeek V3）");
    if (!name) return;
    if (cfg.llm_configs[name]) {
      window.alert("该名称已存在");
      return;
    }
    setCfg({ ...cfg, llm_configs: { ...cfg.llm_configs, [name]: { ...DEFAULT_LLM } } });
    setSelectedLLM(name);
    setMessage(null);
  };

  const handleRemoveLLM = (): void => {
    if (!cfg || !selectedLLM) return;
    if (!window.confirm(`确定删除 LLM 配置 "${selectedLLM}"？`)) return;
    const next = { ...cfg.llm_configs };
    delete next[selectedLLM];
    setCfg({ ...cfg, llm_configs: next });
    const remain = Object.keys(next);
    setSelectedLLM(remain[0] ?? "");
    setMessage(null);
  };

  const handleRenameLLM = (): void => {
    if (!cfg || !selectedLLM) return;
    const newName = window.prompt("输入新名称", selectedLLM);
    if (!newName || newName === selectedLLM) return;
    if (cfg.llm_configs[newName]) {
      window.alert("该名称已存在");
      return;
    }
    const block = cfg.llm_configs[selectedLLM];
    const next = { ...cfg.llm_configs };
    delete next[selectedLLM];
    next[newName] = block;
    // 同步 choose_configs 引用
    const chooseNext = { ...cfg.choose_configs };
    (Object.keys(chooseNext) as Array<keyof FullConfig["choose_configs"]>).forEach((k) => {
      if (chooseNext[k] === selectedLLM) chooseNext[k] = newName;
    });
    setCfg({ ...cfg, llm_configs: next, choose_configs: chooseNext });
    setSelectedLLM(newName);
  };

  // -------- Embedding 操作 --------
  const handleUpdateEmbedding = <K extends keyof EmbeddingConfigItem>(
    field: K,
    value: EmbeddingConfigItem[K],
  ): void => {
    if (!cfg || !selectedEmbedding) return;
    setCfg({
      ...cfg,
      embedding_configs: {
        ...cfg.embedding_configs,
        [selectedEmbedding]: { ...cfg.embedding_configs[selectedEmbedding], [field]: value },
      },
    });
    setMessage(null);
  };

  const handleAddEmbedding = (): void => {
    if (!cfg) return;
    const name = window.prompt("输入新 Embedding 配置名称（例如 OpenAI / Ollama）");
    if (!name) return;
    if (cfg.embedding_configs[name]) {
      window.alert("该名称已存在");
      return;
    }
    setCfg({
      ...cfg,
      embedding_configs: { ...cfg.embedding_configs, [name]: { ...DEFAULT_EMBEDDING } },
    });
    setSelectedEmbedding(name);
  };

  const handleRemoveEmbedding = (): void => {
    if (!cfg || !selectedEmbedding) return;
    if (!window.confirm(`确定删除 Embedding 配置 "${selectedEmbedding}"？`)) return;
    const next = { ...cfg.embedding_configs };
    delete next[selectedEmbedding];
    setCfg({ ...cfg, embedding_configs: next });
    const remain = Object.keys(next);
    setSelectedEmbedding(remain[0] ?? "");
  };

  // -------- Choose 操作 --------
  const handleUpdateChoose = (key: keyof FullConfig["choose_configs"], value: string): void => {
    if (!cfg) return;
    setCfg({ ...cfg, choose_configs: { ...cfg.choose_configs, [key]: value } });
    setMessage(null);
  };

  const handleUpdateLastEmbedding = (value: string): void => {
    if (!cfg) return;
    setCfg({ ...cfg, last_embedding_interface_format: value });
    setMessage(null);
  };

  // -------- Test & list-models --------
  const handleTestLLM = async (): Promise<void> => {
    if (!selectedLLM || testing) return;
    setTesting(true);
    setMessage("🔄 正在测试 LLM 连接...");
    try {
      // 先保存一次，确保后端读的是最新值
      if (cfg) await api.saveConfig(cfg);
      const res = await api.testLLM(selectedLLM);
      setMessage(
        res.ok
          ? `✅ 连接成功，响应：${(res.response ?? "").slice(0, 120)}`
          : `❌ ${res.error ?? "未知错误"}`,
      );
    } catch (err) {
      setMessage(`❌ ${(err as { detail?: string })?.detail ?? String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  const handleTestEmbedding = async (): Promise<void> => {
    if (!selectedEmbedding || testing) return;
    setTesting(true);
    setMessage("🔄 正在测试 Embedding 连接...");
    try {
      if (cfg) await api.saveConfig(cfg);
      const res = await api.testEmbedding(selectedEmbedding);
      setMessage(
        res.ok
          ? `✅ 连接成功，向量维度：${res.dim}`
          : `❌ ${res.error ?? "未知错误"}`,
      );
    } catch (err) {
      setMessage(`❌ ${(err as { detail?: string })?.detail ?? String(err)}`);
    } finally {
      setTesting(false);
    }
  };

  const handleListLLMModels = async (): Promise<void> => {
    if (!cfg || !selectedLLM || fetchingModels) return;
    const block = cfg.llm_configs[selectedLLM];
    setFetchingModels(true);
    setMessage("🔄 正在拉取模型列表...");
    try {
      const res = await api.listModels({
        interface_format: block.interface_format,
        base_url: block.base_url,
        api_key: block.api_key,
      });
      setModelCandidates(res.models);
      setMessage(`✅ 共拉取到 ${res.models.length} 个模型，已显示在下方下拉`);
    } catch (err) {
      setModelCandidates([]);
      setMessage(`❌ ${(err as { detail?: string })?.detail ?? String(err)}`);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleListEmbeddingModels = async (): Promise<void> => {
    if (!cfg || !selectedEmbedding || fetchingModels) return;
    const block = cfg.embedding_configs[selectedEmbedding];
    setFetchingModels(true);
    setMessage("🔄 正在拉取模型列表...");
    try {
      const res = await api.listModels({
        interface_format: block.interface_format,
        base_url: block.base_url,
        api_key: block.api_key,
      });
      setModelCandidates(res.models);
      setMessage(`✅ 共拉取到 ${res.models.length} 个模型，已显示在下方下拉`);
    } catch (err) {
      setModelCandidates([]);
      setMessage(`❌ ${(err as { detail?: string })?.detail ?? String(err)}`);
    } finally {
      setFetchingModels(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!cfg) {
    return <div className="p-6 text-rose-600">配置加载失败</div>;
  }

  const currentLLM: LLMConfigItem | undefined = selectedLLM ? cfg.llm_configs[selectedLLM] : undefined;
  const currentEmb: EmbeddingConfigItem | undefined = selectedEmbedding
    ? cfg.embedding_configs[selectedEmbedding]
    : undefined;

  return (
    <div className="flex h-full flex-col" onKeyDown={handleKeyDown}>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">模型配置</h1>
          <p className="mt-1 text-sm text-slate-500">
            管理 LLM / Embedding provider，并为每个生成步骤选择使用的 LLM。
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
          aria-label="保存配置"
          tabIndex={0}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存 <span className="text-xs opacity-60">(Ctrl+S)</span>
        </button>
      </header>

      <nav className="flex gap-1 border-b border-slate-200 bg-white px-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "relative px-4 py-2 text-sm font-medium transition",
              tab === t.key
                ? "text-brand-700"
                : "text-slate-500 hover:text-slate-800",
            )}
            aria-label={t.label}
            tabIndex={0}
          >
            {t.label}
            {tab === t.key ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-600" />
            ) : null}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-auto p-6">
        {message ? (
          <div className="mb-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
            {message}
          </div>
        ) : null}

        {tab === "llm" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
            <aside className="card !p-2">
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-xs font-medium text-slate-500">Provider</span>
                <button
                  type="button"
                  onClick={handleAddLLM}
                  className="text-brand-600 hover:text-brand-700"
                  aria-label="新增 LLM 配置"
                  tabIndex={0}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <ul className="space-y-1">
                {llmNames.length === 0 ? (
                  <li className="px-2 py-4 text-center text-xs text-slate-400">暂无，点击 + 新增</li>
                ) : (
                  llmNames.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => setSelectedLLM(name)}
                        className={cn(
                          "w-full truncate rounded-md px-3 py-2 text-left text-sm transition",
                          selectedLLM === name
                            ? "bg-brand-50 text-brand-700"
                            : "text-slate-600 hover:bg-slate-100",
                        )}
                        aria-label={`选择 ${name}`}
                        tabIndex={0}
                      >
                        {name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </aside>

            <section className="card">
              {currentLLM ? (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">{selectedLLM}</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleTestLLM}
                        disabled={testing}
                        className="btn-secondary !px-2 !py-1 text-xs"
                        aria-label="测试连接"
                        tabIndex={0}
                      >
                        {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                        测试连接
                      </button>
                      <button
                        type="button"
                        onClick={handleRenameLLM}
                        className="btn-secondary !px-2 !py-1 text-xs"
                        aria-label="重命名"
                        tabIndex={0}
                      >
                        重命名
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveLLM}
                        className="btn-danger !px-2 !py-1 text-xs"
                        aria-label="删除"
                        tabIndex={0}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField label="接口类型" htmlFor="l-if">
                      <select
                        id="l-if"
                        className="input"
                        value={currentLLM.interface_format}
                        onChange={(e) => handleUpdateLLM("interface_format", e.target.value)}
                        tabIndex={0}
                      >
                        {INTERFACE_FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="模型名称" htmlFor="l-mn">
                      <div className="flex gap-2">
                        <input
                          id="l-mn"
                          className="input"
                          value={currentLLM.model_name}
                          list="llm-model-options"
                          onChange={(e) => handleUpdateLLM("model_name", e.target.value)}
                          tabIndex={0}
                        />
                        <button
                          type="button"
                          onClick={handleListLLMModels}
                          disabled={fetchingModels}
                          className="btn-secondary shrink-0 !px-2 !py-1 text-xs"
                          aria-label="拉取模型列表"
                          tabIndex={0}
                        >
                          {fetchingModels ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          拉取
                        </button>
                      </div>
                      <datalist id="llm-model-options">
                        {modelCandidates.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </FormField>
                    <FormField label="API Key" htmlFor="l-ak" className="md:col-span-2">
                      <input
                        id="l-ak"
                        type="password"
                        className="input font-mono"
                        value={currentLLM.api_key}
                        onChange={(e) => handleUpdateLLM("api_key", e.target.value)}
                        tabIndex={0}
                      />
                    </FormField>
                    <FormField label="Base URL" htmlFor="l-bu" className="md:col-span-2">
                      <input
                        id="l-bu"
                        className="input font-mono"
                        value={currentLLM.base_url}
                        onChange={(e) => handleUpdateLLM("base_url", e.target.value)}
                        tabIndex={0}
                      />
                    </FormField>
                    <FormField label="Temperature" htmlFor="l-tp">
                      <input
                        id="l-tp"
                        type="number"
                        step={0.1}
                        min={0}
                        max={2}
                        className="input"
                        value={currentLLM.temperature}
                        onChange={(e) => handleUpdateLLM("temperature", parseFloat(e.target.value || "0"))}
                        tabIndex={0}
                      />
                    </FormField>
                    <FormField label="Max Tokens" htmlFor="l-mx">
                      <input
                        id="l-mx"
                        type="number"
                        min={1}
                        className="input"
                        value={currentLLM.max_tokens}
                        onChange={(e) => handleUpdateLLM("max_tokens", parseInt(e.target.value || "0", 10))}
                        tabIndex={0}
                      />
                    </FormField>
                    <FormField label="Timeout(秒)" htmlFor="l-to">
                      <input
                        id="l-to"
                        type="number"
                        min={1}
                        className="input"
                        value={currentLLM.timeout}
                        onChange={(e) => handleUpdateLLM("timeout", parseInt(e.target.value || "0", 10))}
                        tabIndex={0}
                      />
                    </FormField>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400">请在左侧选择或新增 provider</div>
              )}
            </section>
          </div>
        ) : null}

        {tab === "embedding" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
            <aside className="card !p-2">
              <div className="mb-2 flex items-center justify-between px-2">
                <span className="text-xs font-medium text-slate-500">Provider</span>
                <button
                  type="button"
                  onClick={handleAddEmbedding}
                  className="text-brand-600 hover:text-brand-700"
                  aria-label="新增 Embedding 配置"
                  tabIndex={0}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <ul className="space-y-1">
                {embNames.length === 0 ? (
                  <li className="px-2 py-4 text-center text-xs text-slate-400">暂无，点击 + 新增</li>
                ) : (
                  embNames.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => setSelectedEmbedding(name)}
                        className={cn(
                          "w-full truncate rounded-md px-3 py-2 text-left text-sm transition",
                          selectedEmbedding === name
                            ? "bg-brand-50 text-brand-700"
                            : "text-slate-600 hover:bg-slate-100",
                        )}
                        aria-label={`选择 ${name}`}
                        tabIndex={0}
                      >
                        {name}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </aside>

            <section className="card">
              {currentEmb ? (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">{selectedEmbedding}</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleTestEmbedding}
                        disabled={testing}
                        className="btn-secondary !px-2 !py-1 text-xs"
                        aria-label="测试连接"
                        tabIndex={0}
                      >
                        {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
                        测试连接
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveEmbedding}
                        className="btn-danger !px-2 !py-1 text-xs"
                        aria-label="删除"
                        tabIndex={0}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField label="接口类型" htmlFor="e-if">
                      <select
                        id="e-if"
                        className="input"
                        value={currentEmb.interface_format}
                        onChange={(e) => handleUpdateEmbedding("interface_format", e.target.value)}
                        tabIndex={0}
                      >
                        {INTERFACE_FORMATS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="模型名称" htmlFor="e-mn">
                      <div className="flex gap-2">
                        <input
                          id="e-mn"
                          className="input"
                          list="emb-model-options"
                          value={currentEmb.model_name}
                          onChange={(e) => handleUpdateEmbedding("model_name", e.target.value)}
                          tabIndex={0}
                        />
                        <button
                          type="button"
                          onClick={handleListEmbeddingModels}
                          disabled={fetchingModels}
                          className="btn-secondary shrink-0 !px-2 !py-1 text-xs"
                          aria-label="拉取模型列表"
                          tabIndex={0}
                        >
                          {fetchingModels ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          拉取
                        </button>
                      </div>
                      <datalist id="emb-model-options">
                        {modelCandidates.map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </FormField>
                    <FormField label="API Key" htmlFor="e-ak" className="md:col-span-2">
                      <input
                        id="e-ak"
                        type="password"
                        className="input font-mono"
                        value={currentEmb.api_key}
                        onChange={(e) => handleUpdateEmbedding("api_key", e.target.value)}
                        tabIndex={0}
                      />
                    </FormField>
                    <FormField label="Base URL" htmlFor="e-bu" className="md:col-span-2">
                      <input
                        id="e-bu"
                        className="input font-mono"
                        value={currentEmb.base_url}
                        onChange={(e) => handleUpdateEmbedding("base_url", e.target.value)}
                        tabIndex={0}
                      />
                    </FormField>
                    <FormField label="检索 K 值" htmlFor="e-k" hint="向量检索返回的 top-K">
                      <input
                        id="e-k"
                        type="number"
                        min={1}
                        className="input"
                        value={currentEmb.retrieval_k}
                        onChange={(e) => handleUpdateEmbedding("retrieval_k", parseInt(e.target.value || "1", 10))}
                        tabIndex={0}
                      />
                    </FormField>
                  </div>

                  <div className="mt-6 border-t border-slate-200 pt-4">
                    <FormField label="当前启用的 Embedding" htmlFor="e-last" hint="生成章节时使用此 Embedding 进行向量检索">
                      <select
                        id="e-last"
                        className="input"
                        value={cfg.last_embedding_interface_format}
                        onChange={(e) => handleUpdateLastEmbedding(e.target.value)}
                        tabIndex={0}
                      >
                        {embNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-400">请在左侧选择或新增 provider</div>
              )}
            </section>
          </div>
        ) : null}

        {tab === "choose" ? (
          <section className="card max-w-3xl">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">为每个生成步骤选择 LLM</h3>
            <p className="mb-4 text-xs text-slate-500">选项来自上方 LLM 配置中定义的 provider 名称。</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {CHOOSE_KEYS.map(({ key, label }) => (
                <FormField key={key} label={label} htmlFor={`c-${key}`}>
                  <select
                    id={`c-${key}`}
                    className="input"
                    value={cfg.choose_configs[key] ?? ""}
                    onChange={(e) => handleUpdateChoose(key, e.target.value)}
                    tabIndex={0}
                  >
                    <option value="">（未选择）</option>
                    {llmNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </FormField>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};

export default Config;
