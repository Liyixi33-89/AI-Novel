import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";

type TextEditorProps = {
  value: string;
  onSave: (next: string) => Promise<void>;
  readOnly?: boolean;
  minRows?: number;
  placeholder?: string;
};

const TextEditor = ({ value, onSave, readOnly = false, minRows = 20, placeholder }: TextEditorProps) => {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
    setDirty(false);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setDraft(e.target.value);
    setDirty(true);
    setMessage(null);
  };

  const handleSave = async (): Promise<void> => {
    if (!dirty || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await onSave(draft);
      setDirty(false);
      setMessage("✅ 已保存");
    } catch (err) {
      const e = err as { detail?: string };
      setMessage(`❌ 保存失败：${e.detail ?? String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void handleSave();
    }
  };

  const charCount = draft.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <div className="text-xs text-slate-500">
          {charCount} 字符 {dirty ? <span className="ml-2 text-amber-600">● 未保存</span> : null}
          {message ? <span className="ml-2">{message}</span> : null}
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="btn-primary !px-3 !py-1 text-xs"
            aria-label="保存"
            tabIndex={0}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存 <span className="opacity-60">(Ctrl+S)</span>
          </button>
        ) : null}
      </div>
      <textarea
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        readOnly={readOnly}
        rows={minRows}
        spellCheck={false}
        placeholder={placeholder ?? "（空）"}
        className="flex-1 resize-none border-0 bg-white p-4 font-mono text-sm leading-relaxed text-slate-800 focus:outline-none"
        tabIndex={0}
      />
    </div>
  );
};

export default TextEditor;
