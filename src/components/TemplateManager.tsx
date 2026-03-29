import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { intentTemplateOptions, normalizeOptionValue } from '../shared/intentTemplateOptions';

type IntentTemplateFields = {
  bodyRange: string;
  shotType: string;
  orientation: string;
  compositionMethod: string;
  cameraHeight: string;
  eyeStatus: string;
  mouthStatus: string;
};

type IntentTemplateDraft = IntentTemplateFields;

type KvItem = {
  type: string;
  key: string;
  value: unknown;
  created_at?: number;
  updated_at?: number;
};

type TemplateItem = KvItem & {
  parsedValue: IntentTemplateFields | null;
};

type TemplateManagerProps = {
  embedded?: boolean;
};

const TEMPLATE_TYPE = 'intent_template';

const DEFAULT_FIELDS: IntentTemplateFields = {
  bodyRange: intentTemplateOptions.bodyRange[0] ?? '',
  shotType: intentTemplateOptions.shotType[0] ?? '',
  orientation: intentTemplateOptions.orientation[0] ?? '',
  compositionMethod: intentTemplateOptions.compositionMethod[0] ?? '',
  cameraHeight: intentTemplateOptions.cameraHeight[0] ?? '',
  eyeStatus: intentTemplateOptions.eyeStatus[0] ?? '',
  mouthStatus: intentTemplateOptions.mouthStatus[0] ?? ''
};

const FIELD_CONFIG = [
  { key: 'bodyRange', label: '身体范围（A）', options: intentTemplateOptions.bodyRange },
  { key: 'shotType', label: '景别类型（B）', options: intentTemplateOptions.shotType },
  { key: 'orientation', label: '方位角（C）', options: intentTemplateOptions.orientation },
  { key: 'compositionMethod', label: '构图方法（D）', options: intentTemplateOptions.compositionMethod },
  { key: 'cameraHeight', label: '机位高度（E）', options: intentTemplateOptions.cameraHeight },
  { key: 'eyeStatus', label: '眼睛状态', options: intentTemplateOptions.eyeStatus },
  { key: 'mouthStatus', label: '嘴巴状态', options: intentTemplateOptions.mouthStatus }
] as const satisfies ReadonlyArray<{
  key: keyof IntentTemplateFields;
  label: string;
  options: readonly string[];
}>;

const DEFAULT_DRAFT: IntentTemplateDraft = { ...DEFAULT_FIELDS };

const parseJsonSafely = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const summarizeResponseText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('<')) return '服务返回了 HTML，而不是 JSON';
  return trimmed;
};

const formatTime = (ts?: number) => {
  if (!ts) return '--';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
};

const parseTemplateValue = (value: unknown): IntentTemplateFields | null => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }
  if (!source || typeof source !== 'object') {
    return null;
  }

  const obj = source as Record<string, unknown>;
  const next: IntentTemplateFields = { ...DEFAULT_FIELDS };

  for (const field of FIELD_CONFIG) {
    const rawValue =
      obj[field.key] ??
      obj[
        field.key
          .replace(/[A-Z]/g, match => `_${match.toLowerCase()}`)
      ];
    if (typeof rawValue !== 'string') {
      if (field.key === 'cameraHeight') {
        next[field.key] = DEFAULT_FIELDS.cameraHeight;
        continue;
      }
      return null;
    }
    const normalizedValue = normalizeOptionValue(rawValue);
    const isKnownValue = (field.options as readonly string[]).includes(normalizedValue);
    if (!isKnownValue) {
      return null;
    }
    next[field.key] = normalizedValue;
  }

  return next;
};

const validateTemplateDraft = (draft: IntentTemplateDraft): { value: IntentTemplateFields | null; error: string } => {
  const next: IntentTemplateFields = { ...DEFAULT_FIELDS };

  for (const field of FIELD_CONFIG) {
    const rawValue = normalizeOptionValue(draft[field.key]);
    if (!rawValue.trim()) {
      return { value: null, error: `${field.label}不能为空` };
    }
    if (!(field.options as readonly string[]).includes(rawValue)) {
      return { value: null, error: `${field.label} 的值不在可选范围内` };
    }
    next[field.key] = rawValue;
  }

  return { value: next, error: '' };
};

function TemplateManager({ embedded = false }: TemplateManagerProps) {
  const configBaseUrl = 'https://www.uiofield.top/config_server';

  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [newKey, setNewKey] = useState('');
  const [newForm, setNewForm] = useState<IntentTemplateDraft>(DEFAULT_DRAFT);
  const [editForm, setEditForm] = useState<IntentTemplateDraft>(DEFAULT_DRAFT);

  const loadTemplates = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${configBaseUrl}/kvs?type=${encodeURIComponent(TEMPLATE_TYPE)}`);
      const text = await resp.text();
      const data = parseJsonSafely(text) as { items?: KvItem[]; error?: string } | null;
      if (resp.status === 404) {
        setItems([]);
        return;
      }
      if (!resp.ok) {
        const detail = (data && typeof data.error === 'string' ? data.error : '') || summarizeResponseText(text);
        throw new Error(detail || `HTTP ${resp.status}`);
      }
      const nextItems: TemplateItem[] = Array.isArray(data?.items)
        ? data.items.map((item: KvItem) => ({
            ...item,
            parsedValue: parseTemplateValue(item.value)
          }))
        : [];
      nextItems.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
      setItems(nextItems);
    } catch (err: any) {
      setError(err.message || '查询模版列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const postJson = async (path: string, body: Record<string, unknown>) => {
    const resp = await fetch(`${configBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const text = await resp.text();
    const data = parseJsonSafely(text) as { error?: string } | null;
    if (!resp.ok) {
      const detail = (data && typeof data.error === 'string' ? data.error : '') || summarizeResponseText(text);
      throw new Error(detail || `HTTP ${resp.status}`);
    }
  };

  const createTemplate = async () => {
    const key = newKey.trim();
    if (!key) {
      setError('请先输入模版名称（key）');
      return;
    }
    const parsed = validateTemplateDraft(newForm);
    if (!parsed.value) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await postJson('/kv/create', {
        type: TEMPLATE_TYPE,
        key,
        value: parsed.value
      });
      setNewKey('');
      setNewForm({ ...DEFAULT_DRAFT });
      await loadTemplates();
    } catch (err: any) {
      setError(err.message || '新增模版失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (key: string) => {
    if (!window.confirm(`确认删除模版 "${key}" 吗？`)) return;
    setSaving(true);
    setError('');
    try {
      await postJson('/kv/delete', {
        type: TEMPLATE_TYPE,
        key
      });
      if (expandedKey === key) setExpandedKey(null);
      if (editingKey === key) setEditingKey(null);
      await loadTemplates();
    } catch (err: any) {
      setError(err.message || '删除模版失败');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: TemplateItem) => {
    setEditingKey(item.key);
    setExpandedKey(item.key);
    setEditForm({ ...(item.parsedValue || DEFAULT_FIELDS) });
  };

  const updateTemplate = async (key: string) => {
    const parsed = validateTemplateDraft(editForm);
    if (!parsed.value) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await postJson('/kv/update', {
        type: TEMPLATE_TYPE,
        key,
        value: parsed.value
      });
      setEditingKey(null);
      await loadTemplates();
    } catch (err: any) {
      setError(err.message || '更新模版失败');
    } finally {
      setSaving(false);
    }
  };

  const renderForm = (form: IntentTemplateDraft, setForm: (next: IntentTemplateDraft) => void) => {
    const setField = <K extends keyof IntentTemplateDraft>(key: K, value: IntentTemplateDraft[K]) => {
      setForm({ ...form, [key]: value });
    };

    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {FIELD_CONFIG.map(field => (
          <div key={field.key}>
            <label className="text-sm text-slate-300">{field.label}</label>
            <select
              value={form[field.key]}
              onChange={event => setField(field.key, event.target.value)}
              className="mt-1 w-full rounded bg-slate-900 p-2 text-white outline-none"
            >
              {field.options.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`${embedded ? '' : 'min-h-screen bg-slate-900 px-4 pb-32 pt-4 sm:px-6 lg:pb-40 lg:pt-6'}`}>
      <div className={`mx-auto space-y-6 ${embedded ? 'max-w-none' : 'max-w-4xl'}`}>
        <div className="rounded-xl bg-slate-800 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">意图模版</h1>
              <p className="mt-1 text-sm text-slate-400">管理意图模版配置</p>
            </div>
            <button
              onClick={() => void loadTemplates()}
              disabled={loading}
              className={`inline-flex items-center gap-2 rounded px-3 py-2 text-sm text-white ${
                loading ? 'bg-slate-600' : 'bg-blue-600'
              }`}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              刷新列表
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-slate-800 p-4 space-y-3">
          <div className="text-slate-300">模版列表（{items.length}）</div>
          {loading && <div className="text-sm text-slate-400">加载中...</div>}
          {!loading && items.length === 0 && <div className="text-sm text-slate-400">暂无模版</div>}

          {items.map(item => {
            const expanded = expandedKey === item.key;
            const editing = editingKey === item.key;
            return (
              <div key={item.key} className="rounded bg-slate-900 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-white">{item.key}</div>
                    <div className="text-xs text-slate-400">updated_at: {formatTime(item.updated_at)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExpandedKey(expanded ? null : item.key)}
                      className="rounded bg-slate-700 px-2 py-1 text-sm text-white"
                    >
                      {expanded ? '收起' : '展开'}
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      className="rounded bg-blue-700 px-2 py-1 text-sm text-white"
                    >
                      修改
                    </button>
                    <button
                      onClick={() => void deleteTemplate(item.key)}
                      disabled={saving}
                      className={`rounded px-2 py-1 text-sm text-white ${
                        saving ? 'bg-slate-600' : 'bg-rose-700'
                      }`}
                    >
                      删除
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="rounded border border-slate-700 p-3">
                    {editing ? (
                      <div className="space-y-3">
                        {renderForm(editForm, setEditForm)}
                        <div className="flex gap-2">
                          <button
                            onClick={() => void updateTemplate(item.key)}
                            disabled={saving}
                            className={`rounded px-3 py-2 text-sm text-white ${
                              saving ? 'bg-slate-600' : 'bg-emerald-700'
                            }`}
                          >
                            保存修改
                          </button>
                          <button
                            onClick={() => setEditingKey(null)}
                            className="rounded bg-slate-700 px-3 py-2 text-sm text-white"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : item.parsedValue ? (
                      <div className="grid grid-cols-1 gap-2 text-sm text-white md:grid-cols-2">
                        <div>身体范围（A）：{item.parsedValue.bodyRange}</div>
                        <div>景别类型（B）：{item.parsedValue.shotType}</div>
                        <div>方位角（C）：{item.parsedValue.orientation}</div>
                        <div>构图方法（D）：{item.parsedValue.compositionMethod}</div>
                        <div>机位高度（E）：{item.parsedValue.cameraHeight}</div>
                        <div>眼睛状态：{item.parsedValue.eyeStatus}</div>
                        <div>嘴巴状态：{item.parsedValue.mouthStatus}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-amber-300">
                        当前 value 无法解析为意图模版结构，请点击“修改”后重存。
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded-xl bg-slate-800 p-4 space-y-3">
          <div className="text-slate-300">新增模版</div>
          <div>
            <label className="text-sm text-slate-300">模版名称（key）</label>
            <input
              type="text"
              value={newKey}
              onChange={event => setNewKey(event.target.value)}
              className="mt-1 w-full rounded bg-slate-900 p-2 text-white outline-none"
              placeholder="例如：portrait_intent_default"
            />
          </div>
          {renderForm(newForm, setNewForm)}
          <button
            onClick={() => void createTemplate()}
            disabled={saving}
            className={`w-full rounded py-2 text-white ${saving ? 'bg-slate-600' : 'bg-emerald-600'}`}
          >
            新增
          </button>
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}
      </div>
    </div>
  );
}

export default TemplateManager;
