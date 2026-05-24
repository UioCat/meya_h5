import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Check, Copy, ImagePlus, Loader2, RefreshCw, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';

type PhotoLibraryProps = {
  notify?: (message: string) => void;
};

type PhotoValue = {
  filename: string;
  contentType: string;
  data: string;
  size: number;
  createdAt: number;
};

type PhotoItem = {
  key: string;
  value: PhotoValue;
  updated_at?: number;
};

type GuideLineLlmResult = {
  taskId?: string;
  imageDataUrl: string;
  lineCount?: number;
  selectedIds: number[];
  selectedOptionIds: number[];
  selectedConstructionIds: number[];
  selectedGuideLineIds: number[];
  constructionOptions: SelectionOption[];
  selectionOptions: SelectionOption[];
  convergePointOptions: SelectionOption[];
  selectedConvergePoints: Array<Record<string, unknown>>;
  selectedMlsdPoints: Array<Record<string, unknown>>;
  includeConstructionLines?: boolean;
  includeConvergePoints?: boolean;
  includeMlsd?: boolean;
  statusCode?: number;
  statusMessage?: string;
  llm?: Record<string, unknown>;
};

type SelectionOption = {
  id: number;
  source?: string;
  type?: string;
  label?: string;
  guideLineId?: number;
};

type PreparedPhotoUpload = {
  filename: string;
  contentType: string;
  data: string;
  size: number;
  compressed: boolean;
};

const CONFIG_SERVER_BASE_URL = 'https://www.uiofield.top/config_server';
const WEB_SERVER = 'https://www.uiofield.top/meya/push';
const WS_SERVER = 'wss://www.uiofield.top/meya/ws';
const PHOTO_LIBRARY_TYPE = 'photo_library';
const MAX_PHOTO_COUNT = 10;
const PHOTO_UPLOAD_MAX_EDGE = 1280;
const PHOTO_UPLOAD_TARGET_BYTES = 900 * 1024;
const PHOTO_UPLOAD_JPEG_QUALITY = 0.72;
const PHOTO_UPLOAD_MIN_JPEG_QUALITY = 0.5;

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
  return trimmed.length > 160 ? `${trimmed.slice(0, 160)}...` : trimmed;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const translateStatusMessage = (message: string) => {
  const normalized = message.trim();
  if (normalized === 'llm selected candidate(s); selected candidates marked green and other candidates marked blue') {
    return 'LLM 已选择候选项；选中候选已标绿';
  }
  return message;
};

const copyTextToClipboard = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const normalizePhotoValue = (
  value: unknown,
  fallbackKey: string,
  fallbackUpdatedAt?: number
): PhotoValue | null => {
  const parsedValue = typeof value === 'string' ? parseJsonSafely(value) : value;
  if (!parsedValue || typeof parsedValue !== 'object') return null;
  const obj = parsedValue as Record<string, unknown>;
  const rawData = typeof obj.data === 'string' ? obj.data : '';
  if (!rawData) return null;
  const contentType = typeof obj.contentType === 'string'
    ? obj.contentType
    : typeof obj.content_type === 'string'
      ? obj.content_type
      : 'image/*';
  const data = rawData.startsWith('data:')
    ? rawData
    : `data:${contentType};base64,${rawData}`;
  const filename = typeof obj.filename === 'string' && obj.filename.trim()
    ? obj.filename
    : fallbackKey;
  const size = typeof obj.size === 'number' && Number.isFinite(obj.size)
    ? obj.size
    : Math.round(rawData.length * 0.75);
  const createdAt = typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt)
    ? obj.createdAt
    : typeof obj.created_at === 'number' && Number.isFinite(obj.created_at)
      ? obj.created_at
      : fallbackUpdatedAt || Date.now();

  return {
    filename,
    contentType,
    data,
    size,
    createdAt
  };
};

const toPhotoItem = (item: { key: string; value: unknown; updated_at?: number }): PhotoItem | null => {
  const value = normalizePhotoValue(item.value, item.key, item.updated_at);
  if (!value) return null;
  return {
    key: item.key,
    value,
    updated_at: item.updated_at
  };
};

const isRawKvItem = (item: unknown): item is { key: string; value: unknown; updated_at?: number } => {
  if (!item || typeof item !== 'object') return false;
  const obj = item as Record<string, unknown>;
  return typeof obj.key === 'string';
};

const getObjectValue = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? value as Record<string, unknown> : null;

const getMessageObject = (value: unknown): Record<string, unknown> | null => {
  const objectValue = getObjectValue(value);
  if (objectValue) return objectValue;
  return typeof value === 'string' ? getObjectValue(parseJsonSafely(value)) : null;
};

const resolveGuideLineLiteResultPayload = (value: unknown): Record<string, unknown> | null => {
  const root = getMessageObject(value);
  const raw = getMessageObject(root?.raw);
  const data = getMessageObject(root?.data);
  const rawData = getMessageObject(raw?.data);
  const dataRaw = getMessageObject(data?.raw);
  const candidates = [root, raw, data, rawData, dataRaw];
  return candidates.find(candidate => candidate?.type === 'guide_line_lite_result') || null;
};

const normalizeNumberArray = (value: unknown): number[] => {
  const rawItems = Array.isArray(value) ? value : [];
  const indexes = rawItems
    .map(item => {
      if (typeof item === 'number') return item;
      if (typeof item === 'string') return Number(item);
      const obj = getObjectValue(item);
      if (typeof obj?.id === 'number') return obj.id;
      if (typeof obj?.index === 'number') return obj.index;
      if (typeof obj?.selectionId === 'number') return obj.selectionId;
      if (typeof obj?.constructionId === 'number') return obj.constructionId;
      if (typeof obj?.guideLineId === 'number') return obj.guideLineId;
      return NaN;
    })
    .filter(index => Number.isInteger(index) && index >= 0);
  return Array.from(new Set(indexes));
};

const normalizePointArray = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return [];
  return value.reduce<Array<Record<string, unknown>>>((points, item) => {
    if (typeof item === 'number' || typeof item === 'string') {
      const selectionId = Number(item);
      if (Number.isInteger(selectionId) && selectionId >= 0) {
        points.push({ selectionId });
      }
      return points;
    }

    const obj = getObjectValue(item);
    if (obj) points.push(obj);
    return points;
  }, []);
};

const normalizeSelectionOptions = (value: unknown): SelectionOption[] => {
  if (!Array.isArray(value)) return [];
  return value.reduce<SelectionOption[]>((options, item) => {
    const obj = getObjectValue(item);
    const rawId = obj?.id ?? obj?.selectionId ?? obj?.constructionId ?? obj?.guideLineId;
    const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' ? Number(rawId) : NaN;
    if (!Number.isInteger(id) || id < 0) return options;

    const rawGuideLineId = obj?.guideLineId ?? obj?.constructionId;
    const guideLineId =
      typeof rawGuideLineId === 'number'
        ? rawGuideLineId
        : typeof rawGuideLineId === 'string'
          ? Number(rawGuideLineId)
          : undefined;
    const option: SelectionOption = { id };
    if (typeof obj?.source === 'string') option.source = obj.source;
    if (typeof obj?.type === 'string') option.type = obj.type;
    if (typeof obj?.label === 'string') option.label = obj.label;
    if (typeof guideLineId === 'number' && Number.isInteger(guideLineId) && guideLineId >= 0) {
      option.guideLineId = guideLineId;
    }

    options.push(option);
    return options;
  }, []);
};

const formatSelectionId = (id: number, options: SelectionOption[]) => {
  if (options.length === 0) return `L${id}`;
  const option = options.find(item => item.id === id);
  if (option?.source === 'mlsd' || option?.type === 'converge_point' || option?.type === 'convergence_point') {
    return `P${id} 汇聚点`;
  }
  if (typeof option?.guideLineId === 'number') return `#${id}/L${option.guideLineId}`;
  return `#${id}`;
};

const formatSelectedIds = (ids: number[], options: SelectionOption[]) =>
  ids.length > 0 ? ids.map(id => formatSelectionId(id, options)).join('、') : '--';

const formatConstructionIds = (ids: number[]) =>
  ids.length > 0 ? ids.map(id => `L${id}`).join('、') : '--';

const getPointDisplayId = (point: Record<string, unknown>) => {
  const rawId = point.selectionId ?? point.id ?? point.pointId ?? point.index;
  if (typeof rawId === 'number' || typeof rawId === 'string') return String(rawId);
  return '--';
};

const formatConvergePoints = (points: Array<Record<string, unknown>>) =>
  points.length > 0 ? points.map(point => `P${getPointDisplayId(point)}`).join('、') : '--';

const parseGuideLineLiteResult = (value: unknown): GuideLineLlmResult => {
  const root = getObjectValue(value);
  const data = getObjectValue(root?.data) || root;
  if (!data) {
    throw new Error('点线构图Lite 返回内容格式不正确');
  }

  const imageDataUrl = typeof data.imageDataUrl === 'string' && data.imageDataUrl ? data.imageDataUrl : '';

  if (!imageDataUrl) {
    throw new Error('点线构图Lite 未返回结果图片');
  }

  const llm = getObjectValue(data.llm) || undefined;
  const selectionOptions = normalizeSelectionOptions(data.selectionOptions);
  const explicitConstructionOptions = normalizeSelectionOptions(data.constructionOptions);
  const explicitConvergePointOptions = normalizeSelectionOptions(data.convergePointOptions);
  const constructionOptions = explicitConstructionOptions.length > 0
    ? explicitConstructionOptions
    : selectionOptions.filter(option => option.source === 'guide_line' || option.type === 'construction_line');
  const convergePointOptions = explicitConvergePointOptions.length > 0
    ? explicitConvergePointOptions
    : selectionOptions.filter(option =>
        option.source === 'mlsd' || option.type === 'converge_point' || option.type === 'convergence_point'
      );
  const selectedOptionIds = normalizeNumberArray(data.selectedOptionIds).length > 0
    ? normalizeNumberArray(data.selectedOptionIds)
    : normalizeNumberArray(data.selectedIds).length > 0
      ? normalizeNumberArray(data.selectedIds)
      : normalizeNumberArray(llm?.selectedIds);
  const explicitSelectedConstructionIds = normalizeNumberArray(data.selectedConstructionIds).length > 0
    ? normalizeNumberArray(data.selectedConstructionIds)
    : normalizeNumberArray(llm?.selectedConstructionIds);
  const explicitSelectedGuideLineIds = normalizeNumberArray(data.selectedGuideLineIds);
  const selectedConstructionIds = explicitSelectedConstructionIds.length > 0
    ? explicitSelectedConstructionIds
    : explicitSelectedGuideLineIds.length > 0
      ? explicitSelectedGuideLineIds
      : selectionOptions.length > 0
        ? selectedOptionIds
            .map(optionId => selectionOptions.find(option => option.id === optionId))
            .filter((option): option is SelectionOption => option?.source === 'guide_line' || option?.type === 'construction_line')
            .map(option => option.guideLineId ?? option.id)
        : selectedOptionIds;
  const selectedGuideLineIds = selectedConstructionIds;
  const guideLines = Array.isArray(data.guideLines) ? data.guideLines : [];
  const explicitSelectedConvergePoints = normalizePointArray(data.selectedConvergePoints);
  const selectedConvergePointAlias = normalizePointArray(data.selectConvergePoints);
  const llmSelectedConvergePoints = normalizePointArray(llm?.selectedConvergePoints);
  const llmSelectConvergePoints = normalizePointArray(llm?.selectConvergePoints);
  const selectedConvergePoints =
    explicitSelectedConvergePoints.length > 0
      ? explicitSelectedConvergePoints
      : selectedConvergePointAlias.length > 0
        ? selectedConvergePointAlias
        : llmSelectedConvergePoints.length > 0
          ? llmSelectedConvergePoints
          : llmSelectConvergePoints.length > 0
            ? llmSelectConvergePoints
            : normalizePointArray(data.selectedMlsdPoints);
  const selectedMlsdPoints = selectedConvergePoints;

  return {
    taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
    imageDataUrl,
    lineCount: typeof data.lineCount === 'number' ? data.lineCount : constructionOptions.length || guideLines.length || undefined,
    selectedIds: selectedOptionIds,
    selectedOptionIds,
    selectedConstructionIds,
    selectedGuideLineIds,
    constructionOptions,
    selectionOptions,
    convergePointOptions,
    selectedConvergePoints,
    selectedMlsdPoints,
    includeConstructionLines: typeof data.includeConstructionLines === 'boolean' ? data.includeConstructionLines : undefined,
    includeConvergePoints: typeof data.includeConvergePoints === 'boolean' ? data.includeConvergePoints : undefined,
    includeMlsd: typeof data.includeMlsd === 'boolean' ? data.includeMlsd : undefined,
    statusCode: typeof data.statusCode === 'number' ? data.statusCode : undefined,
    statusMessage: typeof data.statusMessage === 'string' ? translateStatusMessage(data.statusMessage) : undefined,
    llm
  };
};

const getImageBase64Payload = (dataUrl: string) => {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const loadImageFromDataUrl = (dataUrl: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片读取失败，请换一张图片后重试'));
    image.src = dataUrl;
  });

const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('图片压缩失败，请换一张图片后重试'));
        return;
      }
      resolve(blob);
    }, 'image/jpeg', quality);
  });

const getScaledImageSize = (width: number, height: number, maxEdge: number) => {
  const largestEdge = Math.max(width, height);
  if (largestEdge <= maxEdge) {
    return { width, height };
  }

  const ratio = maxEdge / largestEdge;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio))
  };
};

const toJpegFilename = (filename: string) => {
  const normalized = filename.trim() || `photo-${Date.now()}`;
  return /\.[^./\\]+$/.test(normalized)
    ? normalized.replace(/\.[^./\\]+$/, '.jpg')
    : `${normalized}.jpg`;
};

const compressPhotoUpload = async (file: File): Promise<PreparedPhotoUpload> => {
  const originalData = await readFileAsDataUrl(file);

  let image: HTMLImageElement;
  try {
    image = await loadImageFromDataUrl(originalData);
  } catch (error) {
    if (file.size <= PHOTO_UPLOAD_TARGET_BYTES) {
      return {
        filename: file.name,
        contentType: file.type || 'image/*',
        data: originalData,
        size: file.size,
        compressed: false
      };
    }
    throw error;
  }

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('无法读取图片尺寸，请换一张图片后重试');
  }

  const shouldCompress =
    file.size > PHOTO_UPLOAD_TARGET_BYTES ||
    sourceWidth > PHOTO_UPLOAD_MAX_EDGE ||
    sourceHeight > PHOTO_UPLOAD_MAX_EDGE;

  if (!shouldCompress) {
    return {
      filename: file.name,
      contentType: file.type || 'image/*',
      data: originalData,
      size: file.size,
      compressed: false
    };
  }

  const { width, height } = getScaledImageSize(sourceWidth, sourceHeight, PHOTO_UPLOAD_MAX_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('当前浏览器不支持图片压缩');
  }

  ctx.drawImage(image, 0, 0, width, height);

  let quality = PHOTO_UPLOAD_JPEG_QUALITY;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob.size > PHOTO_UPLOAD_TARGET_BYTES && quality > PHOTO_UPLOAD_MIN_JPEG_QUALITY) {
    quality = Math.max(PHOTO_UPLOAD_MIN_JPEG_QUALITY, quality - 0.08);
    blob = await canvasToJpegBlob(canvas, quality);
  }

  return {
    filename: toJpegFilename(file.name),
    contentType: 'image/jpeg',
    data: await readBlobAsDataUrl(blob),
    size: blob.size,
    compressed: true
  };
};

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const formatDateTime = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp);
};

function PhotoLibrary({ notify }: PhotoLibraryProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const resultTimeoutRef = useRef<number | null>(null);
  const pendingTaskIdRef = useRef('');
  const notifyRef = useRef(notify);
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isAlgorithmModalOpen, setIsAlgorithmModalOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [includeConstructionLines, setIncludeConstructionLines] = useState(true);
  const [includeConvergePoints, setIncludeConvergePoints] = useState(true);
  const [algorithmSubmitting, setAlgorithmSubmitting] = useState(false);
  const [algorithmError, setAlgorithmError] = useState('');
  const [algorithmResult, setAlgorithmResult] = useState<GuideLineLlmResult | null>(null);
  const [llmCopied, setLlmCopied] = useState(false);

  const selectedPhoto = items.find(item => item.key === selectedKey) || items[0] || null;
  const canUpload = items.length < MAX_PHOTO_COUNT;

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  useEffect(() => {
    const ws = new WebSocket(WS_SERVER);
    wsRef.current = ws;

    ws.onopen = () => {
      heartbeatRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
      }, 5000);
    };

    ws.onmessage = event => {
      if (typeof event.data !== 'string') return;
      const parsed = parseJsonSafely(event.data);
      const resultPayload = resolveGuideLineLiteResultPayload(parsed);
      if (!resultPayload) return;

      const taskId = typeof resultPayload.taskId === 'string' ? resultPayload.taskId : '';
      if (pendingTaskIdRef.current && taskId && taskId !== pendingTaskIdRef.current) return;

      try {
        setAlgorithmResult(parseGuideLineLiteResult(resultPayload));
        setLlmCopied(false);
        setAlgorithmError('');
        setIsAlgorithmModalOpen(false);
        setAlgorithmSubmitting(false);
        pendingTaskIdRef.current = '';
        if (resultTimeoutRef.current) {
          window.clearTimeout(resultTimeoutRef.current);
          resultTimeoutRef.current = null;
        }
        notifyRef.current?.('点线构图-LLM 分析完成');
      } catch (err) {
        setAlgorithmError(getErrorMessage(err, '解析点线构图Lite 结果失败'));
        setAlgorithmSubmitting(false);
      }
    };

    ws.onerror = () => {
      if (pendingTaskIdRef.current) {
        pendingTaskIdRef.current = '';
        setAlgorithmError('WebSocket 连接异常，暂时无法接收算法结果');
        setAlgorithmSubmitting(false);
      }
    };

    return () => {
      if (heartbeatRef.current) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      if (resultTimeoutRef.current) {
        window.clearTimeout(resultTimeoutRef.current);
        resultTimeoutRef.current = null;
      }
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, []);

  const postJson = async (path: string, body: Record<string, unknown>) => {
    const resp = await fetch(`${CONFIG_SERVER_BASE_URL}${path}`, {
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

  const loadPhotos = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${CONFIG_SERVER_BASE_URL}/kvs?type=${encodeURIComponent(PHOTO_LIBRARY_TYPE)}&t=${Date.now()}`);
      const text = await resp.text();
      const data = parseJsonSafely(text) as { items?: Array<{ key: string; value: unknown; updated_at?: number }>; error?: string } | null;
      if (resp.status === 404) {
        setItems([]);
        setSelectedKey('');
        return;
      }
      if (!resp.ok) {
        const detail = (data && typeof data.error === 'string' ? data.error : '') || summarizeResponseText(text);
        throw new Error(detail || `HTTP ${resp.status}`);
      }
      const nextItems = (Array.isArray(data?.items) ? data.items : [])
        .filter(isRawKvItem)
        .map(toPhotoItem)
        .filter((item): item is PhotoItem => Boolean(item))
        .sort((a, b) => (b.updated_at || b.value.createdAt) - (a.updated_at || a.value.createdAt));
      setItems(nextItems);
      setSelectedKey(prev => (nextItems.some(item => item.key === prev) ? prev : nextItems[0]?.key || ''));
      setAlgorithmResult(null);
      setAlgorithmError('');
    } catch (err) {
      setError(getErrorMessage(err, '加载照片失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPhotos();
  }, []);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!canUpload) {
      setError(`照片最多保存 ${MAX_PHOTO_COUNT} 张，请先删除旧照片后再上传`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const preparedPhoto = await compressPhotoUpload(file);
      const safeName = preparedPhoto.filename.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_');
      const key = `${Date.now()}_${safeName}`;
      await postJson('/kv/create', {
        type: PHOTO_LIBRARY_TYPE,
        key,
        value: {
          filename: preparedPhoto.filename,
          contentType: preparedPhoto.contentType,
          data: preparedPhoto.data,
          size: preparedPhoto.size,
          createdAt: Date.now()
        }
      });
      await loadPhotos();
      setSelectedKey(key);
      notify?.(
        preparedPhoto.compressed && preparedPhoto.size < file.size
          ? `照片已压缩上传：${formatFileSize(file.size)} -> ${formatFileSize(preparedPhoto.size)}`
          : preparedPhoto.compressed
            ? `照片已压缩上传：最长边 ${PHOTO_UPLOAD_MAX_EDGE}px`
            : '照片已上传'
      );
    } catch (err) {
      setError(getErrorMessage(err, '上传照片失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: PhotoItem) => {
    if (!window.confirm(`确认删除照片 "${item.value.filename}" 吗？`)) return;
    setSaving(true);
    setError('');
    try {
      await postJson('/kv/delete', {
        type: PHOTO_LIBRARY_TYPE,
        key: item.key
      });
      await loadPhotos();
      notify?.('照片已删除');
    } catch (err) {
      setError(getErrorMessage(err, '删除照片失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectPhoto = (key: string) => {
    setSelectedKey(key);
    setAlgorithmResult(null);
    setLlmCopied(false);
    setAlgorithmError('');
  };

  const handleRunAlgorithm = () => {
    if (!selectedPhoto) {
      notify?.('请先选择照片');
      return;
    }
    setAlgorithmError('');
    setIncludeConstructionLines(true);
    setIncludeConvergePoints(true);
    setIsAlgorithmModalOpen(true);
  };

  const handleSubmitGuideLineLlm = async () => {
    if (!selectedPhoto) {
      setAlgorithmError('请先选择照片');
      return;
    }
    if (!prompt.trim()) {
      setAlgorithmError('请填写 Prompt');
      return;
    }
    if (!includeConstructionLines && !includeConvergePoints) {
      setAlgorithmError('请至少选择传递结构线或传递汇聚点');
      return;
    }

    setAlgorithmResult(null);
    setLlmCopied(false);
    setAlgorithmSubmitting(true);
    setAlgorithmError('');
    try {
      const taskId = selectedPhoto.key;
      pendingTaskIdRef.current = taskId;
      const response = await fetch(WEB_SERVER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: '点线构图Lite',
          taskId,
          prompt: prompt.trim(),
          includeConstructionLines,
          includeConvergePoints,
          includeMlsd: includeConvergePoints,
          imageBase64: getImageBase64Payload(selectedPhoto.value.data)
        })
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(summarizeResponseText(text) || `点线构图Lite 请求失败（HTTP ${response.status}）`);
      }

      setIsAlgorithmModalOpen(false);
      notify?.('已提交点线构图-LLM，等待结果');
      if (resultTimeoutRef.current) {
        window.clearTimeout(resultTimeoutRef.current);
      }
      resultTimeoutRef.current = window.setTimeout(() => {
        if (!pendingTaskIdRef.current) return;
        pendingTaskIdRef.current = '';
        setAlgorithmSubmitting(false);
        setAlgorithmError('已提交任务，但暂未收到 WebSocket 返回结果');
      }, 60000);
    } catch (err) {
      pendingTaskIdRef.current = '';
      setAlgorithmSubmitting(false);
      setAlgorithmError(getErrorMessage(err, '点线构图-LLM 分析失败'));
    }
  };

  const handleCopyLlmResult = async () => {
    if (!algorithmResult?.llm) return;
    try {
      await copyTextToClipboard(JSON.stringify(algorithmResult.llm, null, 2));
      setLlmCopied(true);
      window.setTimeout(() => setLlmCopied(false), 1600);
      notify?.('LLM 结果已复制');
    } catch (err) {
      notify?.(getErrorMessage(err, '复制失败'));
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 px-4 pb-28 pt-4 text-white sm:px-6 lg:pb-32 lg:pt-6">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-normal sm:text-3xl">照片库</h1>
          <div className="mt-1 text-sm text-slate-400">选择照片后，准备发起算法操作。</div>
        </div>

        <div className="rounded-xl bg-slate-800 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm text-slate-300">已上传照片</div>
              <div className="mt-1 text-xs text-slate-500">已保存 {items.length}/{MAX_PHOTO_COUNT}</div>
            </div>
            <button
              type="button"
              onClick={() => void loadPhotos()}
              disabled={loading || saving}
              className="flex items-center gap-1 rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>

          {error && <div className="mb-3 rounded bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>}

          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center rounded-xl bg-slate-900 text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载中
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900 px-4 text-center text-slate-400">
              <ImagePlus className="mb-3 h-10 w-10" />
              <span className="text-sm font-medium text-slate-200">暂无照片</span>
              <span className="mt-1 text-xs">请在下方上传一张图片到照片库</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {items.map(item => {
                const active = item.key === selectedPhoto?.key;
                return (
                  <button
                    type="button"
                    key={item.key}
                    onClick={() => handleSelectPhoto(item.key)}
                    className={`group overflow-hidden rounded-xl border bg-slate-900 text-left transition ${
                      active ? 'border-sky-400 shadow-[0_0_0_2px_rgba(56,189,248,0.18)]' : 'border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    <div className="aspect-[4/3] w-full overflow-hidden bg-slate-950">
                      <img
                        src={item.value.data}
                        alt={item.value.filename}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="space-y-1 px-2 py-2">
                      <div className="truncate text-sm font-medium text-white">{item.value.filename}</div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span>{formatFileSize(item.value.size)}</span>
                        <span>{formatDateTime(item.updated_at || item.value.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-slate-800 p-4">
          <div className="mb-3 text-sm text-slate-300">当前选择</div>
          {selectedPhoto ? (
            <div className="space-y-3">
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-slate-950 sm:aspect-[16/10]">
                <img
                  src={selectedPhoto.value.data}
                  alt={selectedPhoto.value.filename}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="rounded-xl bg-slate-900 px-3 py-3 text-sm">
                <div className="break-all font-medium text-white">{selectedPhoto.value.filename}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-400">
                  <div>大小：{formatFileSize(selectedPhoto.value.size)}</div>
                  <div>上传：{formatDateTime(selectedPhoto.updated_at || selectedPhoto.value.createdAt)}</div>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={handleRunAlgorithm}
                  disabled={algorithmSubmitting}
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  {algorithmSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {algorithmSubmitting ? '等待结果' : '点线构图-LLM'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(selectedPhoto)}
                  disabled={saving}
                  className="flex items-center justify-center rounded-xl bg-red-500 px-3 py-2 text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                  aria-label="删除照片"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl bg-slate-900 px-4 text-center text-slate-400">
              <ImagePlus className="mb-3 h-10 w-10" />
              <div className="text-sm text-slate-200">选择一张照片</div>
              <div className="mt-1 text-xs">上传后可在这里预览并选择算法</div>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-slate-800 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm text-slate-300">算法结果</div>
            {algorithmResult && (
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-slate-400">
                {typeof algorithmResult.lineCount === 'number' && <span>候选结构线：{algorithmResult.lineCount} 条</span>}
                <span>LLM 选中结构线：{formatConstructionIds(algorithmResult.selectedConstructionIds)}</span>
                <span>LLM 选中汇聚点：{formatConvergePoints(algorithmResult.selectedConvergePoints)}</span>
              </div>
            )}
          </div>
          {selectedPhoto ? (
            <div className="space-y-3">
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-slate-950 sm:aspect-[16/10]">
                {algorithmResult ? (
                  <img
                    src={algorithmResult.imageDataUrl}
                    alt={`${selectedPhoto.value.filename} 算法结果`}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <>
                    <img
                      src={selectedPhoto.value.data}
                      alt={`${selectedPhoto.value.filename} 算法结果占位`}
                      className="max-h-full max-w-full object-contain opacity-40"
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/45 px-4 text-center">
                      {algorithmSubmitting ? (
                        <Loader2 className="mb-3 h-9 w-9 animate-spin text-slate-300" />
                      ) : (
                        <Sparkles className="mb-3 h-9 w-9 text-slate-400" />
                      )}
                      <div className="text-sm font-medium text-slate-200">
                        {algorithmSubmitting ? '等待算法结果' : '暂无算法结果'}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {algorithmSubmitting ? '任务已提交，正在等待 WebSocket 返回' : '点击“点线构图-LLM”后在这里查看标注结果'}
                      </div>
                    </div>
                  </>
                )}
              </div>
              {algorithmResult && (
                <div className="rounded-xl bg-slate-900 px-3 py-3 text-xs text-slate-300">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>状态：{algorithmResult.statusCode ?? '--'}</div>
                    <div>任务：{algorithmResult.taskId || '--'}</div>
                    <div>候选结构线：{algorithmResult.constructionOptions.length || algorithmResult.lineCount || '--'}</div>
                    <div>候选汇聚点：{algorithmResult.convergePointOptions.length || '--'}</div>
                    <div>选中结构线：{formatConstructionIds(algorithmResult.selectedConstructionIds)}</div>
                    <div>选中汇聚点：{formatConvergePoints(algorithmResult.selectedConvergePoints)}</div>
                    <div>候选项：{algorithmResult.selectionOptions.length || algorithmResult.lineCount || '--'}</div>
                    <div>兼容编号：{formatSelectedIds(algorithmResult.selectedOptionIds, algorithmResult.selectionOptions)}</div>
                  </div>
                  {algorithmResult.statusMessage && (
                    <div className="mt-2 border-t border-slate-800 pt-2 text-slate-400">
                      {algorithmResult.statusMessage}
                    </div>
                  )}
                  {algorithmResult.llm && (
                    <div className="mt-2 overflow-hidden rounded-lg bg-slate-950">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
                        <span className="text-[11px] text-slate-500">LLM JSON</span>
                        <button
                          type="button"
                          onClick={() => void handleCopyLlmResult()}
                          className="flex h-7 items-center gap-1 rounded bg-slate-800 px-2 text-[11px] text-slate-200 transition hover:bg-slate-700"
                          aria-label="复制 LLM 结果"
                        >
                          {llmCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {llmCopied ? '已复制' : '复制'}
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={JSON.stringify(algorithmResult.llm, null, 2)}
                        className="h-44 min-h-28 w-full resize-y border-0 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-300 outline-none"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl bg-slate-900 px-4 text-center text-slate-400">
              <Sparkles className="mb-3 h-10 w-10" />
              <div className="text-sm text-slate-200">暂无算法结果</div>
              <div className="mt-1 text-xs">选择照片后可发起算法操作</div>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-slate-800 p-4">
          <div className="mb-3 text-sm text-slate-300">上传照片</div>
          <button
            type="button"
            onClick={() => canUpload && fileInputRef.current?.click()}
            disabled={saving || !canUpload}
            className={`flex min-h-[260px] w-full flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center transition ${
              canUpload
                ? 'border-slate-600 bg-slate-900 text-slate-400 hover:border-sky-500 hover:text-sky-200'
                : 'cursor-not-allowed border-slate-700 bg-slate-900/70 text-slate-500'
            }`}
          >
            {saving ? <Loader2 className="mb-3 h-10 w-10 animate-spin" /> : <UploadCloud className="mb-3 h-10 w-10" />}
            <span className="text-sm font-medium text-slate-200">
              {canUpload ? '上传照片' : '照片已达上限'}
            </span>
            <span className="mt-1 text-xs">
              {canUpload ? `还可上传 ${MAX_PHOTO_COUNT - items.length} 张` : `最多保存 ${MAX_PHOTO_COUNT} 张，请先删除旧照片`}
            </span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleUpload}
        />
      </div>

      {isAlgorithmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 py-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-slate-800 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">点线构图-LLM</div>
                <div className="mt-1 text-xs text-slate-400">提交 Prompt 和当前图片，由后端 Lite 流程返回标注结果。</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!algorithmSubmitting) setIsAlgorithmModalOpen(false);
                }}
                disabled={algorithmSubmitting}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-700 text-slate-200 transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:text-slate-500"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm text-slate-300">Prompt</span>
                <textarea
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                  disabled={algorithmSubmitting}
                  rows={6}
                  className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:text-slate-500"
                  placeholder="示例：场景=室内办公；目标=选择最适合作为桌沿或透视汇聚参考的结构线/汇聚点；优先级=稳定桌沿结构线优先，若结构线不稳定则选择汇聚点；排除=画面边缘、物体纹理、主体遮挡严重；只返回 JSON selectedConstructionIds 和 selectConvergePoints。"
                />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3">
                <span>
                  <span className="block text-sm text-slate-200">传递结构线</span>
                  <span className="mt-0.5 block text-xs text-slate-500">开启后，结构线候选会交给 LLM。</span>
                </span>
                <input
                  type="checkbox"
                  checked={includeConstructionLines}
                  onChange={event => setIncludeConstructionLines(event.target.checked)}
                  disabled={algorithmSubmitting}
                  className="sr-only"
                />
                <span
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    includeConstructionLines ? 'bg-emerald-500' : 'bg-slate-700'
                  } ${algorithmSubmitting ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${
                      includeConstructionLines ? 'translate-x-5' : ''
                    }`}
                  />
                </span>
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900 px-3 py-3">
                <span>
                  <span className="block text-sm text-slate-200">传递汇聚点</span>
                  <span className="mt-0.5 block text-xs text-slate-500">开启后，汇聚点候选会交给 LLM。</span>
                </span>
                <input
                  type="checkbox"
                  checked={includeConvergePoints}
                  onChange={event => setIncludeConvergePoints(event.target.checked)}
                  disabled={algorithmSubmitting}
                  className="sr-only"
                />
                <span
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                    includeConvergePoints ? 'bg-emerald-500' : 'bg-slate-700'
                  } ${algorithmSubmitting ? 'opacity-50' : ''}`}
                >
                  <span
                    className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition ${
                      includeConvergePoints ? 'translate-x-5' : ''
                    }`}
                  />
                </span>
              </label>
            </div>

            {algorithmError && (
              <div className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {algorithmError}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAlgorithmModalOpen(false)}
                disabled={algorithmSubmitting}
                className="rounded-xl bg-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitGuideLineLlm()}
                disabled={algorithmSubmitting}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                {algorithmSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                提交
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PhotoLibrary;
