import { useEffect, useState } from "react";
import { Cloud, Globe, Loader2, Save, ShieldAlert } from "lucide-react";
import FormField from "@/components/FormField";
import { api, type FullConfig } from "@/lib/api";

type ProxySetting = FullConfig["proxy_setting"];
type WebDavConfig = FullConfig["webdav_config"];

const DEFAULT_PROXY: ProxySetting = {
  proxy_url: "127.0.0.1",
  proxy_port: "",
  enabled: false,
};

const DEFAULT_WEBDAV: WebDavConfig = {
  webdav_url: "",
  webdav_username: "",
  webdav_password: "",
};

const Settings = () => {
  const [cfg, setCfg] = useState<FullConfig | null>(null);
  const [proxy, setProxy] = useState<ProxySetting>(DEFAULT_PROXY);
  const [webdav, setWebdav] = useState<WebDavConfig>(DEFAULT_WEBDAV);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const full = await api.getConfig();
        if (!mounted) return;
        setCfg(full);
        setProxy({ ...DEFAULT_PROXY, ...full.proxy_setting });
        setWebdav({ ...DEFAULT_WEBDAV, ...full.webdav_config });
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

  const handleSave = async (): Promise<void> => {
    if (!cfg || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const next: FullConfig = { ...cfg, proxy_setting: proxy, webdav_config: webdav };
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

  const handleProxyChange = <K extends keyof ProxySetting>(key: K, value: ProxySetting[K]): void => {
    setProxy((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const handleWebdavChange = <K extends keyof WebDavConfig>(key: K, value: WebDavConfig[K]): void => {
    setWebdav((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
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
      <header className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">系统设置</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            代理、WebDAV 备份等杂项配置。
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
          aria-label="保存设置"
          tabIndex={0}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          保存 <span className="text-xs opacity-60">(Ctrl+S)</span>
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {message ? (
          <div className="mb-4 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            {message}
          </div>
        ) : null}

        {/* 代理设置 */}
        <section className="card mb-5">
          <header className="mb-4 flex items-center gap-3">
            <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">代理设置</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                通过 HTTP 代理访问海外 LLM / Embedding 服务（当前由后端进程读取环境变量生效）。
              </p>
            </div>
          </header>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FormField label="代理地址" htmlFor="px-url">
              <input
                id="px-url"
                className="input"
                value={proxy.proxy_url}
                onChange={(e) => handleProxyChange("proxy_url", e.target.value)}
                placeholder="127.0.0.1"
                tabIndex={0}
              />
            </FormField>
            <FormField label="代理端口" htmlFor="px-port">
              <input
                id="px-port"
                className="input"
                value={proxy.proxy_port}
                onChange={(e) => handleProxyChange("proxy_port", e.target.value)}
                placeholder="7890"
                tabIndex={0}
              />
            </FormField>
            <FormField label="是否启用">
              <label
                className="mt-1 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300"
                htmlFor="px-enabled"
                tabIndex={0}
              >
                <input
                  id="px-enabled"
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
                  checked={proxy.enabled}
                  onChange={(e) => handleProxyChange("enabled", e.target.checked)}
                  tabIndex={0}
                />
                启用代理
              </label>
            </FormField>
          </div>
        </section>

        {/* WebDAV 备份 */}
        <section className="card mb-5">
          <header className="mb-4 flex items-center gap-3">
            <div className="rounded-md border border-purple-200 bg-purple-50 p-2 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300">
              <Cloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">WebDAV 备份</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                把生成的 config.json / 小说文件备份到 WebDAV 服务器（Nextcloud / Seafile / 坚果云）。
              </p>
            </div>
          </header>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="WebDAV URL" htmlFor="wd-url" className="md:col-span-2">
              <input
                id="wd-url"
                className="input font-mono"
                value={webdav.webdav_url}
                onChange={(e) => handleWebdavChange("webdav_url", e.target.value)}
                placeholder="https://dav.jianguoyun.com/dav/"
                tabIndex={0}
              />
            </FormField>
            <FormField label="用户名" htmlFor="wd-user">
              <input
                id="wd-user"
                className="input"
                value={webdav.webdav_username}
                onChange={(e) => handleWebdavChange("webdav_username", e.target.value)}
                tabIndex={0}
              />
            </FormField>
            <FormField label="密码 / Token" htmlFor="wd-pass">
              <input
                id="wd-pass"
                type="password"
                className="input"
                value={webdav.webdav_password}
                onChange={(e) => handleWebdavChange("webdav_password", e.target.value)}
                tabIndex={0}
              />
            </FormField>
          </div>
          <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              当前仅保存配置。实际备份/恢复的一键按钮需要后端扩展（可在下一次迭代中加入 <code>/api/backup</code>
              接口）。
            </span>
          </p>
        </section>
      </div>
    </div>
  );
};

export default Settings;
