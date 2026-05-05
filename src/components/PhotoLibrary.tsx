import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, RefreshCw, Sparkles, Trash2, UploadCloud, X } from 'lucide-react';

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
  statusCode?: number;
  statusMessage?: string;
  llm?: Record<string, unknown>;
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

const normalizeNumberArray = (value: unknown): number[] => {
  const rawItems = Array.isArray(value) ? value : [];
  const indexes = rawItems
    .map(item => {
      if (typeof item === 'number') return item;
      if (typeof item === 'string') return Number(item);
      const obj = getObjectValue(item);
      if (typeof obj?.id === 'number') return obj.id;
      if (typeof obj?.index === 'number') return obj.index;
      return NaN;
    })
    .filter(index => Number.isInteger(index) && index >= 0);
  return Array.from(new Set(indexes));
};

const parseGuideLineLiteResult = (value: unknown): GuideLineLlmResult => {
  const root = getObjectValue(value);
  const data = getObjectValue(root?.data) || root;
  if (!data) {
    throw new Error('引导线-Lite 返回内容格式不正确');
  }

  const imageDataUrl = typeof data.imageDataUrl === 'string' && data.imageDataUrl
    ? data.imageDataUrl
    : typeof data.imageBase64 === 'string' && data.imageBase64
      ? `data:${typeof data.imageContentType === 'string' ? data.imageContentType : 'image/jpeg'};base64,${getImageBase64Payload(data.imageBase64)}`
      : '';

  if (!imageDataUrl) {
    throw new Error('引导线-Lite 未返回结果图片');
  }

  const llm = getObjectValue(data.llm) || undefined;
  const selectedIds = normalizeNumberArray(data.selectedIds).length > 0
    ? normalizeNumberArray(data.selectedIds)
    : normalizeNumberArray(llm?.selectedIds);
  const guideLines = Array.isArray(data.guideLines) ? data.guideLines : [];

  return {
    taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
    imageDataUrl,
    lineCount: typeof data.lineCount === 'number' ? data.lineCount : guideLines.length || undefined,
    selectedIds,
    statusCode: typeof data.statusCode === 'number' ? data.statusCode : undefined,
    statusMessage: typeof data.statusMessage === 'string' ? data.statusMessage : undefined,
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
  const [algorithmSubmitting, setAlgorithmSubmitting] = useState(false);
  const [algorithmError, setAlgorithmError] = useState('');
  const [algorithmResult, setAlgorithmResult] = useState<GuideLineLlmResult | null>(null);

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
      const root = getObjectValue(parsed);
      const raw = getObjectValue(root?.raw);
      const resultPayload =
        root?.type === 'guide_line_lite_result'
          ? root
          : raw?.type === 'guide_line_lite_result'
            ? raw
            : null;
      if (!resultPayload) return;

      const taskId = typeof resultPayload.taskId === 'string' ? resultPayload.taskId : '';
      if (pendingTaskIdRef.current && taskId && taskId !== pendingTaskIdRef.current) return;

      try {
        setAlgorithmResult(parseGuideLineLiteResult(resultPayload));
        setAlgorithmError('');
        setIsAlgorithmModalOpen(false);
        setAlgorithmSubmitting(false);
        pendingTaskIdRef.current = '';
        if (resultTimeoutRef.current) {
          window.clearTimeout(resultTimeoutRef.current);
          resultTimeoutRef.current = null;
        }
        notifyRef.current?.('引导线-LLM 分析完成');
      } catch (err) {
        setAlgorithmError(getErrorMessage(err, '解析引导线-Lite 结果失败'));
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
    setAlgorithmError('');
  };

  const handleRunAlgorithm = () => {
    if (!selectedPhoto) {
      notify?.('请先选择照片');
      return;
    }
    setAlgorithmError('');
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
          type: 'guide_line_lite',
          taskId,
          prompt: prompt.trim(),
          imageBase64: getImageBase64Payload(selectedPhoto.value.data)
        })
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(summarizeResponseText(text) || `引导线-Lite 请求失败（HTTP ${response.status}）`);
      }

      setIsAlgorithmModalOpen(false);
      notify?.('已提交引导线-LLM，等待结果');
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
      setAlgorithmError(getErrorMessage(err, '引导线-LLM 分析失败'));
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
                  {algorithmSubmitting ? '等待结果' : '引导线-LLM'}
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
                {typeof algorithmResult.lineCount === 'number' && <span>候选线：{algorithmResult.lineCount} 条</span>}
                <span>LLM 选中：{algorithmResult.selectedIds.length > 0 ? algorithmResult.selectedIds.map(index => `L${index}`).join('、') : '--'}</span>
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
                        {algorithmSubmitting ? '任务已提交，正在等待 WebSocket 返回' : '点击“引导线-LLM”后在这里查看标注结果'}
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
                    <div>候选线：{algorithmResult.lineCount ?? '--'}</div>
                    <div>选中线：{algorithmResult.selectedIds.length > 0 ? algorithmResult.selectedIds.map(index => `L${index}`).join('、') : '--'}</div>
                  </div>
                  {algorithmResult.statusMessage && (
                    <div className="mt-2 border-t border-slate-800 pt-2 text-slate-400">
                      {algorithmResult.statusMessage}
                    </div>
                  )}
                  {algorithmResult.llm && (
                    <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">
                      {JSON.stringify(algorithmResult.llm, null, 2)}
                    </pre>
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
                <div className="text-lg font-semibold text-white">引导线-LLM</div>
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
                  placeholder="描述希望 LLM 选择哪些引导线，例如：请选择最适合作为桌面边缘的线。"
                />
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
