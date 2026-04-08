import { ArrowLeft, Eye, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { intentTemplateOptions, normalizeCompositionObjectValue, normalizeOptionValue } from '../shared/intentTemplateOptions';

type IntentTemplateFields = {
  bodyRange: string;
  shotType: string;
  orientation: string;
  compositionMethod: string;
  compositionObject: string;
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

type TemplateManagerProps = {
  embedded?: boolean;
  bodyRangeOptions?: readonly string[];
  shotTypeOptions?: readonly string[];
};

type TemplatePageMode = 'list' | 'detail';
type TemplateDetailMode = 'create' | 'view' | 'edit';

const TEMPLATE_TYPE = 'intent_template';

type FieldConfigItem = {
  key: keyof IntentTemplateFields;
  label: string;
  options: readonly string[];
};

const createDefaultFields = (
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[]
): IntentTemplateFields => ({
  bodyRange: bodyRangeOptions[0] ?? '',
  shotType: shotTypeOptions[0] ?? '',
  orientation: intentTemplateOptions.orientation[0] ?? '',
  compositionMethod: intentTemplateOptions.compositionMethod[0] ?? '',
  compositionObject: intentTemplateOptions.compositionObject[1] ?? intentTemplateOptions.compositionObject[0] ?? '',
  cameraHeight: intentTemplateOptions.cameraHeight[0] ?? '',
  eyeStatus: intentTemplateOptions.eyeStatus[0] ?? '',
  mouthStatus: intentTemplateOptions.mouthStatus[0] ?? ''
});

const createFieldConfig = (
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[]
): FieldConfigItem[] => [
  { key: 'bodyRange', label: '身体范围（A）', options: bodyRangeOptions },
  { key: 'shotType', label: '景别类型（B）', options: shotTypeOptions },
  { key: 'orientation', label: '方位角（C）', options: intentTemplateOptions.orientation },
  { key: 'compositionMethod', label: '构图方法（D）', options: intentTemplateOptions.compositionMethod },
  { key: 'compositionObject', label: '构图对象', options: intentTemplateOptions.compositionObject },
  { key: 'cameraHeight', label: '机位高度（E）', options: intentTemplateOptions.cameraHeight },
  { key: 'eyeStatus', label: '眼睛状态', options: intentTemplateOptions.eyeStatus },
  { key: 'mouthStatus', label: '嘴巴状态', options: intentTemplateOptions.mouthStatus }
];

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

const parseTemplateValue = (
  value: unknown,
  fieldConfig: readonly FieldConfigItem[],
  defaultFields: IntentTemplateFields
): IntentTemplateFields | null => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }
  if (!source || typeof source !== 'object') {
    return null;
  }

  const obj = source as Record<string, unknown>;
  const next: IntentTemplateFields = { ...defaultFields };

  for (const field of fieldConfig) {
    const rawValue =
      obj[field.key] ??
      obj[
        field.key
          .replace(/[A-Z]/g, match => `_${match.toLowerCase()}`)
      ];
    if (typeof rawValue !== 'string') {
      if (field.key === 'cameraHeight' || field.key === 'compositionObject') {
        next[field.key] = defaultFields[field.key];
        continue;
      }
      return null;
    }
    const normalizedValue =
      field.key === 'compositionObject'
        ? normalizeCompositionObjectValue(rawValue)
        : normalizeOptionValue(rawValue);
    const isKnownValue = (field.options as readonly string[]).includes(normalizedValue);
    if (!isKnownValue) {
      return null;
    }
    next[field.key] = normalizedValue;
  }

  return next;
};

const validateTemplateDraftWithConfig = (
  draft: IntentTemplateDraft,
  fieldConfig: readonly FieldConfigItem[],
  defaultFields: IntentTemplateFields
): { value: IntentTemplateFields | null; error: string } => {
  const next: IntentTemplateFields = { ...defaultFields };

  for (const field of fieldConfig) {
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

function TemplateManager({ embedded = false, bodyRangeOptions, shotTypeOptions }: TemplateManagerProps) {
  const configBaseUrl = 'https://www.uiofield.top/config_server';
  const resolvedBodyRangeOptions =
    bodyRangeOptions && bodyRangeOptions.length > 0 ? [...bodyRangeOptions] : [...intentTemplateOptions.bodyRange];
  const resolvedShotTypeOptions =
    shotTypeOptions && shotTypeOptions.length > 0 ? [...shotTypeOptions] : [...intentTemplateOptions.shotType];
  const resolvedBodyRangeKey = resolvedBodyRangeOptions.join('|');
  const resolvedShotTypeKey = resolvedShotTypeOptions.join('|');
  const defaultFields = createDefaultFields(resolvedBodyRangeOptions, resolvedShotTypeOptions);
  const fieldConfig = createFieldConfig(resolvedBodyRangeOptions, resolvedShotTypeOptions);

  const [items, setItems] = useState<KvItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pageMode, setPageMode] = useState<TemplatePageMode>('list');
  const [detailMode, setDetailMode] = useState<TemplateDetailMode>('create');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [draftForm, setDraftForm] = useState<IntentTemplateDraft>(defaultFields);

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
      const nextItems: KvItem[] = Array.isArray(data?.items) ? data.items : [];
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

  const selectedItem = selectedKey ? items.find(item => item.key === selectedKey) ?? null : null;
  const selectedParsedValue = selectedItem ? parseTemplateValue(selectedItem.value, fieldConfig, defaultFields) : null;

  useEffect(() => {
    setDraftForm(prev => {
      const normalizedBodyRange = normalizeOptionValue(prev.bodyRange);
      const nextBodyRange = resolvedBodyRangeOptions.includes(normalizedBodyRange)
        ? normalizedBodyRange
        : defaultFields.bodyRange;
      const normalizedShotType = normalizeOptionValue(prev.shotType);
      const nextShotType = resolvedShotTypeOptions.includes(normalizedShotType)
        ? normalizedShotType
        : defaultFields.shotType;
      return {
        ...prev,
        bodyRange: nextBodyRange,
        shotType: nextShotType
      };
    });
  }, [defaultFields.bodyRange, defaultFields.shotType, resolvedBodyRangeKey, resolvedShotTypeKey]);

  const backToList = () => {
    setPageMode('list');
    setDetailMode('create');
    setSelectedKey(null);
    setDraftKey('');
    setDraftForm({ ...defaultFields });
    setError('');
  };

  const openCreate = () => {
    setPageMode('detail');
    setDetailMode('create');
    setSelectedKey(null);
    setDraftKey('');
    setDraftForm({ ...defaultFields });
    setError('');
  };

  const openView = (item: KvItem) => {
    const parsedValue = parseTemplateValue(item.value, fieldConfig, defaultFields);
    setPageMode('detail');
    setDetailMode('view');
    setSelectedKey(item.key);
    setDraftKey(item.key);
    setDraftForm({ ...(parsedValue || defaultFields) });
    setError('');
  };

  const openEdit = (item: KvItem) => {
    const parsedValue = parseTemplateValue(item.value, fieldConfig, defaultFields);
    setPageMode('detail');
    setDetailMode('edit');
    setSelectedKey(item.key);
    setDraftKey(item.key);
    setDraftForm({ ...(parsedValue || defaultFields) });
    setError(parsedValue ? '' : '当前 value 无法解析为意图模版结构，请重新选择后保存。');
  };

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
    const key = draftKey.trim();
    if (!key) {
      setError('请先输入模版名称（key）');
      return;
    }
    const parsed = validateTemplateDraftWithConfig(draftForm, fieldConfig, defaultFields);
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
      await loadTemplates();
      backToList();
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
      await loadTemplates();
      if (selectedKey === key) {
        backToList();
      }
    } catch (err: any) {
      setError(err.message || '删除模版失败');
    } finally {
      setSaving(false);
    }
  };

  const updateTemplate = async (key: string) => {
    const parsed = validateTemplateDraftWithConfig(draftForm, fieldConfig, defaultFields);
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
      await loadTemplates();
      backToList();
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
        {fieldConfig.map(field => (
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

  const isViewMode = detailMode === 'view';
  const isCreateMode = detailMode === 'create';
  const detailTitle =
    detailMode === 'create' ? '新增模版' : detailMode === 'edit' ? '修改模版' : '查看模版';
  const detailDescription =
    detailMode === 'create'
      ? '填写模版名称和参数后保存'
      : detailMode === 'edit'
        ? '更新当前模版参数'
        : '查看当前模版详情';
  const actionButtonClass =
    'inline-flex h-10 w-10 items-center justify-center rounded-xl border text-slate-200 transition disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div className={`${embedded ? '' : 'min-h-screen bg-slate-900 px-4 pb-32 pt-4 sm:px-6 lg:pb-40 lg:pt-6'}`}>
      <div className={`mx-auto space-y-6 ${embedded ? 'max-w-none' : 'max-w-4xl'}`}>
        {pageMode === 'list' ? (
          <>
            <div className="rounded-2xl bg-slate-800 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-white">意图模版列表</h2>
                  <p className="mt-1 text-sm text-slate-400">先查看列表，再进入新增、查看或修改页面</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void loadTemplates()}
                    disabled={loading}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-white transition ${
                      loading
                        ? 'border-slate-600 bg-slate-700'
                        : 'border-slate-600 bg-slate-900 hover:bg-slate-700'
                    }`}
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    刷新
                  </button>
                  <button
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm text-white transition hover:bg-emerald-500"
                  >
                    <Plus className="h-4 w-4" />
                    新增
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-800 p-4 sm:p-5">
              <div className="mb-4 text-sm text-slate-300">模版数量：{items.length}</div>
              {error && (
                <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}
              {loading && <div className="rounded-xl bg-slate-900 px-4 py-6 text-sm text-slate-400">加载中...</div>}
              {!loading && items.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900 px-4 py-10 text-center">
                  <div className="text-base font-medium text-white">暂无模版</div>
                  <div className="mt-2 text-sm text-slate-400">可以先点击右上角“新增”创建第一条意图模版</div>
                </div>
              )}

              {!loading && items.length > 0 && (
                <div className="space-y-3">
                  {items.map(item => {
                    const parsedValue = parseTemplateValue(item.value, fieldConfig, defaultFields);
                    return (
                      <div
                        key={item.key}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-medium text-white">{item.key}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span>更新时间：{formatTime(item.updated_at)}</span>
                            {!parsedValue && (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">待修复</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openView(item)}
                            title="查看"
                            aria-label={`查看模版 ${item.key}`}
                            className={`${actionButtonClass} border-slate-600 bg-slate-800 hover:bg-slate-700`}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openEdit(item)}
                            title="修改"
                            aria-label={`修改模版 ${item.key}`}
                            className={`${actionButtonClass} border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => void deleteTemplate(item.key)}
                            title="删除"
                            aria-label={`删除模版 ${item.key}`}
                            disabled={saving}
                            className={`${actionButtonClass} border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-2xl bg-slate-800 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={backToList}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-600 bg-slate-900 text-slate-200 transition hover:bg-slate-700"
                  aria-label="返回列表"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-white">{detailTitle}</h2>
                  <p className="mt-1 text-sm text-slate-400">{detailDescription}</p>
                </div>
              </div>

              {detailMode === 'view' && selectedItem && (
                <button
                  onClick={() => openEdit(selectedItem)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm text-white transition hover:bg-blue-500"
                >
                  <Pencil className="h-4 w-4" />
                  修改
                </button>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {detailMode !== 'create' && !selectedItem ? (
              <div className="mt-4 rounded-xl bg-slate-900 px-4 py-8 text-center text-sm text-slate-400">
                当前模版不存在或已被删除，请返回列表刷新后重试。
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="rounded-xl bg-slate-900 p-4">
                  <label className="text-sm text-slate-300">模版名称（key）</label>
                  <input
                    type="text"
                    value={draftKey}
                    onChange={event => setDraftKey(event.target.value)}
                    readOnly={!isCreateMode}
                    className={`mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ${
                      isCreateMode ? 'focus:border-emerald-400' : 'cursor-not-allowed opacity-80'
                    }`}
                    placeholder="例如：portrait_intent_default"
                  />
                  {!isCreateMode && selectedItem && (
                    <div className="mt-2 text-xs text-slate-400">更新时间：{formatTime(selectedItem.updated_at)}</div>
                  )}
                </div>

                {isViewMode ? (
                  <div className="rounded-xl bg-slate-900 p-4">
                    {selectedParsedValue ? (
                      <div className="grid grid-cols-1 gap-3 text-sm text-white md:grid-cols-2">
                        <div>身体范围（A）：{selectedParsedValue.bodyRange}</div>
                        <div>景别类型（B）：{selectedParsedValue.shotType}</div>
                        <div>方位角（C）：{selectedParsedValue.orientation}</div>
                        <div>构图方法（D）：{selectedParsedValue.compositionMethod}</div>
                        <div>构图对象：{selectedParsedValue.compositionObject}</div>
                        <div>机位高度（E）：{selectedParsedValue.cameraHeight}</div>
                        <div>眼睛状态：{selectedParsedValue.eyeStatus}</div>
                        <div>嘴巴状态：{selectedParsedValue.mouthStatus}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-amber-300">
                        当前 value 无法解析为意图模版结构，请点击右上角“修改”后重新保存。
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-900 p-4">{renderForm(draftForm, setDraftForm)}</div>
                )}

                {!isViewMode && (
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={backToList}
                      className="rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-700"
                    >
                      返回列表
                    </button>
                    <button
                      onClick={() =>
                        void (isCreateMode ? createTemplate() : selectedItem ? updateTemplate(selectedItem.key) : Promise.resolve())
                      }
                      disabled={saving}
                      className={`rounded-xl px-4 py-2 text-sm text-white transition ${
                        saving ? 'bg-slate-600' : 'bg-emerald-600 hover:bg-emerald-500'
                      }`}
                    >
                      {saving ? '保存中...' : isCreateMode ? '确认新增' : '保存修改'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TemplateManager;
