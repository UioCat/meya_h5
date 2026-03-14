import { useEffect, useState } from 'react';

type TemplateFields = {
  person_ratio_percent: number;
  person_ratio_percent_offset: number;
  center_position: string;
  center_position_offset_percent: number;
  face_center_offset_deg: number;
};

type TemplateDraft = {
  person_ratio_percent: string;
  person_ratio_percent_offset: string;
  center_position: string;
  center_position_offset_percent: string;
  face_center_offset_deg: string;
};

type KvItem = {
  type: string;
  key: string;
  value: unknown;
  created_at?: number;
  updated_at?: number;
};

type TemplateItem = KvItem & {
  parsedValue: TemplateFields | null;
};

const TEMPLATE_TYPE = 'alignment_person_template';
const DEFAULT_FIELDS: TemplateFields = {
  person_ratio_percent: 30,
  person_ratio_percent_offset: 5,
  center_position: '眼睛',
  center_position_offset_percent: 3,
  face_center_offset_deg: 3
};

const toDraft = (value: TemplateFields): TemplateDraft => ({
  person_ratio_percent: String(value.person_ratio_percent),
  person_ratio_percent_offset: String(value.person_ratio_percent_offset),
  center_position: value.center_position,
  center_position_offset_percent: String(value.center_position_offset_percent),
  face_center_offset_deg: String(value.face_center_offset_deg)
});

const DEFAULT_DRAFT: TemplateDraft = toDraft(DEFAULT_FIELDS);

const toNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parseTemplateValue = (value: unknown): TemplateFields | null => {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }
  if (!source || typeof source !== 'object') {
    return null;
  }

  const obj = source as Record<string, unknown>;
  const centerPosition = typeof obj.center_position === 'string' ? obj.center_position : '';
  if (!centerPosition) {
    return null;
  }

  return {
    person_ratio_percent: toNumber(obj.person_ratio_percent, DEFAULT_FIELDS.person_ratio_percent),
    person_ratio_percent_offset: toNumber(
        obj.person_ratio_percent_offset,
        DEFAULT_FIELDS.person_ratio_percent_offset
    ),
    center_position: centerPosition,
    center_position_offset_percent: toNumber(
        obj.center_position_offset_percent,
        DEFAULT_FIELDS.center_position_offset_percent
    ),
    face_center_offset_deg: toNumber(
        obj.face_center_offset_deg,
        DEFAULT_FIELDS.face_center_offset_deg
    )
  };
};

const formatTime = (ts?: number) => {
  if (!ts) return '--';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
};

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

const parseTemplateDraft = (draft: TemplateDraft): { value: TemplateFields | null; error: string } => {
  const parseRequiredNumber = (raw: string, fieldName: string) => {
    const text = raw.trim();
    if (!text) return { value: null as number | null, error: `${fieldName}不能为空` };
    const n = Number(text);
    if (!Number.isFinite(n)) return { value: null as number | null, error: `${fieldName}必须是数字` };
    return { value: n, error: '' };
  };

  const ratio = parseRequiredNumber(draft.person_ratio_percent, '人体占比百分比');
  if (ratio.error) return { value: null, error: ratio.error };
  const ratioOffset = parseRequiredNumber(draft.person_ratio_percent_offset, '人体占比百分比偏差');
  if (ratioOffset.error) return { value: null, error: ratioOffset.error };
  const centerOffset = parseRequiredNumber(draft.center_position_offset_percent, '居中位置偏差百分比');
  if (centerOffset.error) return { value: null, error: centerOffset.error };
  const faceOffset = parseRequiredNumber(draft.face_center_offset_deg, '人脸居中偏差度数');
  if (faceOffset.error) return { value: null, error: faceOffset.error };

  if (!draft.center_position.trim()) {
    return { value: null, error: '居中位置不能为空' };
  }

  return {
    value: {
      person_ratio_percent: ratio.value!,
      person_ratio_percent_offset: ratioOffset.value!,
      center_position: draft.center_position,
      center_position_offset_percent: centerOffset.value!,
      face_center_offset_deg: faceOffset.value!
    },
    error: ''
  };
};

function TemplateManager() {
  const configBaseUrl = 'https://www.uiofield.top/config_server';

  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [newKey, setNewKey] = useState('');
  const [newForm, setNewForm] = useState<TemplateDraft>(DEFAULT_DRAFT);
  const [editForm, setEditForm] = useState<TemplateDraft>(DEFAULT_DRAFT);

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
    const createParsed = parseTemplateDraft(newForm);
    if (!createParsed.value) {
      setError(createParsed.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await postJson('/kv/create', {
        type: TEMPLATE_TYPE,
        key,
        value: createParsed.value
      });
      setNewKey('');
      setNewForm(DEFAULT_DRAFT);
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
    setEditForm(toDraft(item.parsedValue || DEFAULT_FIELDS));
  };

  const updateTemplate = async (key: string) => {
    const updateParsed = parseTemplateDraft(editForm);
    if (!updateParsed.value) {
      setError(updateParsed.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await postJson('/kv/update', {
        type: TEMPLATE_TYPE,
        key,
        value: updateParsed.value
      });
      setEditingKey(null);
      await loadTemplates();
    } catch (err: any) {
      setError(err.message || '更新模版失败');
    } finally {
      setSaving(false);
    }
  };

  const renderForm = (
      form: TemplateDraft,
      setForm: (next: TemplateDraft) => void
  ) => {
    const setField = <K extends keyof TemplateDraft>(key: K, value: TemplateDraft[K]) => {
      setForm({ ...form, [key]: value });
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-slate-300 text-sm">人体占比百分比</label>
            <input
                type="number"
                value={form.person_ratio_percent}
                onChange={e => setField('person_ratio_percent', e.target.value)}
                className="w-full mt-1 bg-slate-900 text-white p-2 rounded"
            />
          </div>
          <div>
            <label className="text-slate-300 text-sm">人体占比百分比偏差</label>
            <input
                type="number"
                value={form.person_ratio_percent_offset}
                onChange={e => setField('person_ratio_percent_offset', e.target.value)}
                className="w-full mt-1 bg-slate-900 text-white p-2 rounded"
            />
          </div>
          <div>
            <label className="text-slate-300 text-sm">居中位置</label>
            <select
                value={form.center_position}
                onChange={e => setField('center_position', e.target.value)}
                className="w-full mt-1 bg-slate-900 text-white p-2 rounded"
            >
              <option value="眼睛">眼睛</option>
              <option value="肩膀">肩膀</option>
              <option value="髋部">髋部</option>
              <option value="膝盖">膝盖</option>
            </select>
          </div>
          <div>
            <label className="text-slate-300 text-sm">居中位置偏差百分比</label>
            <input
                type="number"
                value={form.center_position_offset_percent}
                onChange={e => setField('center_position_offset_percent', e.target.value)}
                className="w-full mt-1 bg-slate-900 text-white p-2 rounded"
            />
          </div>
          <div>
            <label className="text-slate-300 text-sm">人脸居中偏差度数</label>
            <input
                type="number"
                value={form.face_center_offset_deg}
                onChange={e => setField('face_center_offset_deg', e.target.value)}
                className="w-full mt-1 bg-slate-900 text-white p-2 rounded"
            />
          </div>
        </div>
    );
  };

  return (
      <div className="p-6 bg-slate-900 min-h-screen text-white">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">模版管理</h1>
              <button
                  onClick={() => void loadTemplates()}
                  disabled={loading}
                  className={`px-3 py-2 rounded ${loading ? 'bg-slate-600' : 'bg-blue-600'}`}
              >
                刷新列表
              </button>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-slate-300">模版列表（{items.length}）</div>
            {loading && <div className="text-slate-400 text-sm">加载中...</div>}
            {!loading && items.length === 0 && (
                <div className="text-slate-400 text-sm">暂无模版</div>
            )}

            {items.map(item => {
              const expanded = expandedKey === item.key;
              const editing = editingKey === item.key;
              return (
                  <div key={item.key} className="bg-slate-900 rounded p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{item.key}</div>
                        <div className="text-xs text-slate-400">
                          updated_at: {formatTime(item.updated_at)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                            onClick={() => setExpandedKey(expanded ? null : item.key)}
                            className="px-2 py-1 rounded bg-slate-700 text-sm"
                        >
                          {expanded ? '收起' : '展开'}
                        </button>
                        <button
                            onClick={() => startEdit(item)}
                            className="px-2 py-1 rounded bg-blue-700 text-sm"
                        >
                          修改
                        </button>
                        <button
                            onClick={() => void deleteTemplate(item.key)}
                            disabled={saving}
                            className={`px-2 py-1 rounded text-sm ${saving ? 'bg-slate-600' : 'bg-rose-700'}`}
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    {expanded && (
                        <div className="border border-slate-700 rounded p-3">
                          {editing ? (
                              <div className="space-y-3">
                                {renderForm(editForm, setEditForm)}
                                <div className="flex gap-2">
                                  <button
                                      onClick={() => void updateTemplate(item.key)}
                                      disabled={saving}
                                      className={`px-3 py-2 rounded ${saving ? 'bg-slate-600' : 'bg-emerald-700'}`}
                                  >
                                    保存修改
                                  </button>
                                  <button
                                      onClick={() => setEditingKey(null)}
                                      className="px-3 py-2 rounded bg-slate-700"
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                          ) : item.parsedValue ? (
                              <div className="text-sm space-y-1">
                                <div>人体占比百分比：{item.parsedValue.person_ratio_percent}</div>
                                <div>人体占比百分比偏差：{item.parsedValue.person_ratio_percent_offset}</div>
                                <div>居中位置：{item.parsedValue.center_position}</div>
                                <div>居中位置偏差百分比：{item.parsedValue.center_position_offset_percent}</div>
                                <div>人脸居中偏差度数：{item.parsedValue.face_center_offset_deg}</div>
                              </div>
                          ) : (
                              <div className="text-amber-300 text-sm">
                                当前 value 无法解析为“对准-人”模版结构，请点击“修改”后重存。
                              </div>
                          )}
                        </div>
                    )}
                  </div>
              );
            })}
          </div>

          <div className="bg-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-slate-300">新增模版</div>
            <div>
              <label className="text-slate-300 text-sm">模版名称（key）</label>
              <input
                  type="text"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  className="w-full mt-1 bg-slate-900 text-white p-2 rounded"
                  placeholder="例如：human_center_default"
              />
            </div>
            {renderForm(newForm, setNewForm)}
            <button
                onClick={() => void createTemplate()}
                disabled={saving}
                className={`w-full py-2 rounded ${saving ? 'bg-slate-600' : 'bg-emerald-600'}`}
            >
              新增
            </button>
          </div>

          {error && (
              <div className="text-red-400 text-sm">{error}</div>
          )}
        </div>
      </div>
  );
}

export default TemplateManager;
