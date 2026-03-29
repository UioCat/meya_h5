import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import TemplateManager from './TemplateManager';
import { compositionParams, intentTemplateOptions, normalizeOptionValue } from '../shared/intentTemplateOptions';

type ConfigPanelProps = {
  notify: (message: string) => void;
};

type ConfigTab = 'basic' | 'template';

const basicConfigSections = [
  '一、构图关键参数',
  '二、景别与主体占比',
  '三、主体占比评价标准',
  '四、主体偏离度评分标准',
  '五、引导线配置',
  '六、笑容检测参数',
  '七、拍照阈值设置',
  '八、拍摄终端设置'
] as const;

const PENDING_CONTROL_MESSAGE = '数据还未接入到主控';
const pendingCompositionParamKeys = new Set(['A', 'K']);
const pendingConfigSections = new Set([
  '三、主体占比评价标准',
  '五、引导线配置',
  '七、拍照阈值设置'
]);

function PendingInfoHint() {
  return (
    <span className="group relative inline-flex items-center" title={PENDING_CONTROL_MESSAGE}>
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-slate-500 text-[10px] font-semibold text-slate-300">
        i
      </span>
      <span className="pointer-events-none absolute right-0 top-full z-10 mt-2 hidden whitespace-nowrap rounded-md border border-slate-600 bg-slate-950 px-2 py-1 text-xs text-slate-100 shadow-lg group-hover:block">
        {PENDING_CONTROL_MESSAGE}
      </span>
    </span>
  );
}

const formatSmileDecimal = (value: number, digits = 2) => value.toFixed(digits);

const getSliderPercent = (value: number, min: number, max: number, invert = false) => {
  if (max <= min) return 0;
  const safeValue = clamp(value, min, max);
  const normalized = ((safeValue - min) / (max - min)) * 100;
  return invert ? 100 - normalized : normalized;
};

const toSliderValue = (value: number, max: number, invert = false) => {
  if (!invert) return value;
  return max - value;
};

const fromSliderValue = (value: number, max: number, invert = false) => {
  if (!invert) return value;
  return max - value;
};

const CONFIG_SERVER_BASE_URL = 'https://www.uiofield.top/config_server';
const SHOT_RATIO_CONFIG_TYPE = 'basic_config';
const SHOT_RATIO_CONFIG_KEY = 'shot_subject_ratio_table';
const SUBJECT_OFFSET_SCORE_CONFIG_TYPE = 'basic_config';
const SUBJECT_OFFSET_SCORE_CONFIG_KEY = 'subject_offset_score_table';
const PHOTO_THRESHOLD_CONFIG_TYPE = 'basic_config';
const PHOTO_THRESHOLD_CONFIG_KEY = 'photo_threshold_settings';
const SMILE_CONFIG_TYPE = 'basic_config';
const SMILE_CONFIG_KEY = 'smile_detection_settings';

const shotRatioRanges = intentTemplateOptions.bodyRange.map(option => ({
  key: option.match(/^A\d+/)?.[0] || option,
  value: option
})) as ReadonlyArray<{ key: string; value: string }>;

const shotRatioRows = [
  { key: 'B1', scene: 'B1特写' },
  { key: 'B2', scene: 'B2近景' },
  { key: 'B3', scene: 'B3中近景' },
  { key: 'B4', scene: 'B4中景' },
  { key: 'B6', scene: 'B6远景' }
] as const;

type ShotRatioRangeValue = (typeof shotRatioRanges)[number]['value'];
type ShotRatioSceneValue = (typeof shotRatioRows)[number]['scene'];
type ShotRatioItem = {
  scene: ShotRatioSceneValue;
  range: ShotRatioRangeValue;
  ratioMin: string;
  ratioMax: string;
};
type ShotRatioList = ShotRatioItem[];

const createDefaultShotRatioList = (): ShotRatioList => [
  { scene: 'B1特写', range: 'A1头部', ratioMin: '50', ratioMax: '60' },
  { scene: 'B2近景', range: 'A2肩部及以上', ratioMin: '45', ratioMax: '60' },
  { scene: 'B3中近景', range: 'A3髋部及以上', ratioMin: '32', ratioMax: '45' },
  { scene: 'B4中景', range: 'A4膝部及以上', ratioMin: '22', ratioMax: '32' },
  { scene: 'B6远景', range: 'A5全身', ratioMin: '1', ratioMax: '8' }
];

const cloneShotRatioList = (items: ShotRatioList): ShotRatioList =>
  items.map(item => ({ ...item }));

const parseJsonSafely = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const matchShotRatioRow = (value: string) => {
  const normalizedValue = normalizeOptionValue(value);
  return shotRatioRows.find(row => {
    const normalizedScene = normalizeOptionValue(row.scene);
    return normalizedScene === normalizedValue || normalizedScene.replace(/^B\d/, '') === normalizedValue;
  });
};

const matchShotRatioRange = (value: string) => {
  const normalizedValue = normalizeOptionValue(value);
  return shotRatioRanges.find(option => {
    const normalizedRange = normalizeOptionValue(option.value);
    return normalizedRange === normalizedValue || normalizedRange.replace(/^A\d/, '') === normalizedValue;
  });
};

const parseShotRatioList = (value: unknown): ShotRatioList | null => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }
  const next = createDefaultShotRatioList();

  if (Array.isArray(source)) {
    source.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const entry = item as Record<string, unknown>;
      if (
        (typeof entry.scene === 'string' || typeof entry.scene === 'number') &&
        (typeof entry.range === 'string' || typeof entry.range === 'number')
      ) {
        const matchedRow = matchShotRatioRow(String(entry.scene));
        const matchedRange = matchShotRatioRange(String(entry.range));
        if (!matchedRow || !matchedRange) return;
        const targetIndex = next.findIndex(config => config.scene === matchedRow.scene);
        if (targetIndex < 0) return;
        next[targetIndex] = {
          scene: matchedRow.scene,
          range: matchedRange.value as ShotRatioRangeValue,
          ratioMin:
            typeof entry.ratioMin === 'number' || typeof entry.ratioMin === 'string'
              ? String(entry.ratioMin)
              : next[targetIndex].ratioMin,
          ratioMax:
            typeof entry.ratioMax === 'number' || typeof entry.ratioMax === 'string'
              ? String(entry.ratioMax)
              : next[targetIndex].ratioMax
        };
        return;
      }

      const [sceneName, configValue] = Object.entries(entry)[0] || [];
      if (!sceneName || !configValue || typeof configValue !== 'object') return;
      const matchedRow = matchShotRatioRow(sceneName);
      if (!matchedRow) return;
      const targetIndex = next.findIndex(config => config.scene === matchedRow.scene);
      if (targetIndex < 0) return;
      const configObj = configValue as Record<string, unknown>;
      const rangeRaw =
        typeof configObj.range === 'string'
          ? configObj.range
          : typeof configObj['范围'] === 'string'
            ? configObj['范围']
            : next[targetIndex].range;
      const matchedRange = matchShotRatioRange(rangeRaw);
      next[targetIndex] = {
        scene: matchedRow.scene,
        range: (matchedRange?.value ?? next[targetIndex].range) as ShotRatioRangeValue,
        ratioMin:
          typeof configObj.ratioMin === 'number' || typeof configObj.ratioMin === 'string'
            ? String(configObj.ratioMin)
            : typeof configObj['比例min'] === 'number' || typeof configObj['比例min'] === 'string'
              ? String(configObj['比例min'])
              : next[targetIndex].ratioMin,
        ratioMax:
          typeof configObj.ratioMax === 'number' || typeof configObj.ratioMax === 'string'
            ? String(configObj.ratioMax)
            : typeof configObj['比例max'] === 'number' || typeof configObj['比例max'] === 'string'
              ? String(configObj['比例max'])
              : next[targetIndex].ratioMax
      };
    });
    return next;
  }

  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;

  // Backward compatibility for the old matrix structure.
  for (const row of shotRatioRows) {
    const rowValue = obj[row.key];
    if (!rowValue || typeof rowValue !== 'object') continue;
    const rowObj = rowValue as Record<string, unknown>;
    const matchedRange = shotRatioRanges.find(option => {
      const cell = rowObj[option.key];
      return typeof cell === 'string' && cell !== '-';
    });
    if (!matchedRange) continue;
    const cellValue = rowObj[matchedRange.key];
    if (typeof cellValue !== 'string') continue;
    const numbers = cellValue.match(/-?\d+(\.\d+)?/g) || [];
    if (numbers.length >= 2) {
      const targetIndex = next.findIndex(config => config.scene === row.scene);
      if (targetIndex < 0) continue;
      next[targetIndex] = {
        scene: row.scene,
        range: matchedRange.value as ShotRatioRangeValue,
        ratioMin: numbers[0] ?? next[targetIndex].ratioMin,
        ratioMax: numbers[1] ?? next[targetIndex].ratioMax
      };
    }
  }

  return next;
};

const serializeShotRatioList = (items: ShotRatioList) =>
  shotRatioRows
    .map(row => items.find(item => item.scene === row.scene))
    .filter((item): item is ShotRatioItem => Boolean(item))
    .map(item => ({
      scene: item.scene,
      range: item.range,
      ratioMin: item.ratioMin,
      ratioMax: item.ratioMax
    }));

const subjectOffsetRows = [
  { key: 'B1', code: 'B1', scene: '特写' },
  { key: 'B2', code: 'B2', scene: '近景' },
  { key: 'B3', code: 'B3', scene: '中近景' },
  { key: 'B4', code: 'B4', scene: '中景' },
  { key: 'B5', code: 'B5', scene: '远景' }
] as const;

type SubjectOffsetRowKey = (typeof subjectOffsetRows)[number]['key'];
type SubjectOffsetItem = {
  scene: string;
  x1: string;
  x2: string;
};
type SubjectOffsetMap = Record<SubjectOffsetRowKey, SubjectOffsetItem>;

const createDefaultSubjectOffsetMap = (): SubjectOffsetMap => ({
  B1: { scene: '特写', x1: '12', x2: '20' },
  B2: { scene: '近景', x1: '10', x2: '16' },
  B3: { scene: '中近景', x1: '7.5', x2: '12.5' },
  B4: { scene: '中景', x1: '5.5', x2: '9.5' },
  B5: { scene: '远景', x1: '3', x2: '6' }
});

const cloneSubjectOffsetMap = (map: SubjectOffsetMap): SubjectOffsetMap => ({
  B1: { ...map.B1 },
  B2: { ...map.B2 },
  B3: { ...map.B3 },
  B4: { ...map.B4 },
  B5: { ...map.B5 }
});

const parseSubjectOffsetCellNumbers = (cell: string) => {
  const numbers = cell.match(/-?\d+(\.\d+)?/g) || [];
  return numbers.map(value => value.replace(/%/g, ''));
};

const parseSubjectOffsetMap = (value: unknown): SubjectOffsetMap | null => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }

  const next = createDefaultSubjectOffsetMap();

  if (Array.isArray(source)) {
    source.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const entry = item as Record<string, unknown>;
      const [sceneName, configValue] = Object.entries(entry)[0] || [];
      if (!sceneName || !configValue || typeof configValue !== 'object') return;
      const matchedRow = subjectOffsetRows.find(row => row.scene === sceneName);
      if (!matchedRow) return;
      const configObj = configValue as Record<string, unknown>;
      next[matchedRow.key] = {
        scene: matchedRow.scene,
        x1:
          typeof configObj['X1'] === 'number' || typeof configObj['X1'] === 'string'
            ? String(configObj['X1'])
            : next[matchedRow.key].x1,
        x2:
          typeof configObj['X2'] === 'number' || typeof configObj['X2'] === 'string'
            ? String(configObj['X2'])
            : next[matchedRow.key].x2
      };
    });
    return next;
  }

  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;

  for (const row of subjectOffsetRows) {
    const rowValue = obj[row.key];
    if (!rowValue || typeof rowValue !== 'object') continue;
    const rowObj = rowValue as Record<string, unknown>;

    if (
      (typeof rowObj['X1'] === 'string' || typeof rowObj['X1'] === 'number') &&
      (typeof rowObj['X2'] === 'string' || typeof rowObj['X2'] === 'number')
    ) {
      next[row.key] = {
        scene: row.scene,
        x1: String(rowObj['X1']),
        x2: String(rowObj['X2'])
      };
      continue;
    }

    const goodCell = typeof rowObj['good'] === 'string' ? rowObj['good'] : '';
    const normalCell = typeof rowObj['normal'] === 'string' ? rowObj['normal'] : '';
    const goodNumbers = parseSubjectOffsetCellNumbers(goodCell);
    const normalNumbers = parseSubjectOffsetCellNumbers(normalCell);

    if (goodNumbers.length >= 2 && normalNumbers.length >= 2) {
      next[row.key] = {
        scene: row.scene,
        x1: goodNumbers[1] ?? next[row.key].x1,
        x2: normalNumbers[1] ?? next[row.key].x2
      };
      continue;
    }

    const sceneRowKey = Object.keys(obj).find(key => key.includes(row.scene));
    if (sceneRowKey) {
      const sceneRowValue = obj[sceneRowKey];
      if (sceneRowValue && typeof sceneRowValue === 'object') {
        const sceneRowObj = sceneRowValue as Record<string, unknown>;
        if (
          (typeof sceneRowObj['X1'] === 'string' || typeof sceneRowObj['X1'] === 'number') &&
          (typeof sceneRowObj['X2'] === 'string' || typeof sceneRowObj['X2'] === 'number')
        ) {
          next[row.key] = {
            scene: row.scene,
            x1: String(sceneRowObj['X1']),
            x2: String(sceneRowObj['X2'])
          };
        }
      }
    }
  }

  return next;
};

const serializeSubjectOffsetMap = (map: SubjectOffsetMap) =>
  subjectOffsetRows.map(row => ({
    [row.scene]: {
      X1: Number(map[row.key].x1),
      X2: Number(map[row.key].x2)
    }
  }));

const getSubjectOffsetDescriptions = (item: SubjectOffsetItem) => [
  `[0～${item.x1}] = 好`,
  `(${item.x1}～${item.x2}) = 中`,
  `[${item.x2}～100] = 差`
];

const photoThresholdRows = [
  { key: 'body_overlap', label: '主体轮廓重合度' },
  { key: 'face_orientation', label: '脸部朝向' },
  { key: 'eye_status', label: '眼睛状态' },
  { key: 'overall_score', label: '评价总分' }
] as const;

const photoThresholdOperators = ['>', '>=', '<', '<=', '='] as const;

type PhotoThresholdRowKey = (typeof photoThresholdRows)[number]['key'];
type PhotoThresholdOperator = (typeof photoThresholdOperators)[number];
type PhotoThresholdItem = {
  enabled: boolean;
  operator: PhotoThresholdOperator;
  value: string;
};
type PhotoThresholdMap = Record<PhotoThresholdRowKey, PhotoThresholdItem>;

const createDefaultPhotoThresholdMap = (): PhotoThresholdMap => ({
  body_overlap: { enabled: true, operator: '>', value: '90' },
  face_orientation: { enabled: true, operator: '>', value: '70' },
  eye_status: { enabled: true, operator: '>', value: '95' },
  overall_score: { enabled: true, operator: '>', value: '80' }
});

const clonePhotoThresholdMap = (map: PhotoThresholdMap): PhotoThresholdMap => ({
  body_overlap: { ...map.body_overlap },
  face_orientation: { ...map.face_orientation },
  eye_status: { ...map.eye_status },
  overall_score: { ...map.overall_score }
});

const parsePhotoThresholdMap = (value: unknown): PhotoThresholdMap | null => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }
  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;
  const next = createDefaultPhotoThresholdMap();

  for (const row of photoThresholdRows) {
    const item = obj[row.key];
    if (!item || typeof item !== 'object') continue;
    const itemObj = item as Record<string, unknown>;
    if (typeof itemObj.enabled === 'boolean') {
      next[row.key].enabled = itemObj.enabled;
    }
    if (
      typeof itemObj.operator === 'string' &&
      (photoThresholdOperators as readonly string[]).includes(itemObj.operator)
    ) {
      next[row.key].operator = itemObj.operator as PhotoThresholdOperator;
    }
    if (typeof itemObj.value === 'string') {
      next[row.key].value = itemObj.value;
    } else if (typeof itemObj.value === 'number') {
      next[row.key].value = String(itemObj.value);
    }
  }

  return next;
};

type SmileDetectionConfig = {
  scoreWeightPercent: number;
  mouthWidthMicroSmile: number;
  mouthWidthBigSmile: number;
  mouthCornerMicroSmile: number;
  mouthCornerBigSmile: number;
};

const defaultSmileDetectionConfig = (): SmileDetectionConfig => ({
  scoreWeightPercent: 50,
  mouthWidthMicroSmile: 0.65,
  mouthWidthBigSmile: 0.7,
  mouthCornerMicroSmile: -0.04,
  mouthCornerBigSmile: -0.07
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const parseSmileDetectionConfig = (value: unknown): SmileDetectionConfig | null => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }
  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;
  const toNumber = (key: keyof SmileDetectionConfig, fallback: number) => {
    const n = typeof obj[key] === 'number' ? obj[key] : Number(obj[key]);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    scoreWeightPercent: clamp(toNumber('scoreWeightPercent', 50), 0, 100),
    mouthWidthMicroSmile: clamp(toNumber('mouthWidthMicroSmile', 0.65), 0, 1),
    mouthWidthBigSmile: clamp(toNumber('mouthWidthBigSmile', 0.7), 0, 1),
    mouthCornerMicroSmile: clamp(toNumber('mouthCornerMicroSmile', -0.04), -0.2, 0),
    mouthCornerBigSmile: clamp(toNumber('mouthCornerBigSmile', -0.07), -0.2, 0)
  };
};

type CaptureTerminalConfig = {
  phoneDeviceName: string;
  phoneStatus: string;
  droneModel: string;
  droneDeviceName: string;
  droneStatus: string;
};

const getLocalDeviceName = () => {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ||
    navigator.platform ||
    '本机设备';
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return `${platform} iPhone`;
  if (/iPad/i.test(ua)) return `${platform} iPad`;
  if (/Android/i.test(ua)) return `${platform} Android`;
  if (/Mac/i.test(platform)) return '本机 Mac';
  if (/Win/i.test(platform)) return '本机 Windows';
  return `本机设备 (${platform})`;
};

const defaultCaptureTerminalConfig = (): CaptureTerminalConfig => ({
  phoneDeviceName: getLocalDeviceName(),
  phoneStatus: '已连接',
  droneModel: 'DJI AIR2',
  droneDeviceName: 'DJI AIR2',
  droneStatus: '连接'
});

const droneTerminalOptions = ['DJI AIR2'] as const;

function ConfigPanel({ notify }: ConfigPanelProps) {
  const [activeTab, setActiveTab] = useState<ConfigTab>('basic');
  const [isCompositionExpanded, setIsCompositionExpanded] = useState(false);
  const [expandedParamKey, setExpandedParamKey] = useState<string | null>(null);
  const [isShotRatioExpanded, setIsShotRatioExpanded] = useState(false);
  const [shotRatioLoaded, setShotRatioLoaded] = useState(false);
  const [shotRatioExists, setShotRatioExists] = useState(false);
  const [shotRatioLoading, setShotRatioLoading] = useState(false);
  const [shotRatioSaving, setShotRatioSaving] = useState(false);
  const [shotRatioError, setShotRatioError] = useState('');
  const [isShotRatioEditing, setIsShotRatioEditing] = useState(false);
  const [shotRatioList, setShotRatioList] = useState<ShotRatioList>(createDefaultShotRatioList);
  const [shotRatioDraft, setShotRatioDraft] = useState<ShotRatioList>(createDefaultShotRatioList);
  const [isSubjectOffsetExpanded, setIsSubjectOffsetExpanded] = useState(false);
  const [subjectOffsetLoaded, setSubjectOffsetLoaded] = useState(false);
  const [subjectOffsetExists, setSubjectOffsetExists] = useState(false);
  const [subjectOffsetLoading, setSubjectOffsetLoading] = useState(false);
  const [subjectOffsetSaving, setSubjectOffsetSaving] = useState(false);
  const [subjectOffsetError, setSubjectOffsetError] = useState('');
  const [isSubjectOffsetEditing, setIsSubjectOffsetEditing] = useState(false);
  const [subjectOffsetMap, setSubjectOffsetMap] = useState<SubjectOffsetMap>(createDefaultSubjectOffsetMap);
  const [subjectOffsetDraft, setSubjectOffsetDraft] = useState<SubjectOffsetMap>(createDefaultSubjectOffsetMap);
  const [isPhotoThresholdExpanded, setIsPhotoThresholdExpanded] = useState(false);
  const [photoThresholdLoaded, setPhotoThresholdLoaded] = useState(false);
  const [photoThresholdExists, setPhotoThresholdExists] = useState(false);
  const [photoThresholdLoading, setPhotoThresholdLoading] = useState(false);
  const [photoThresholdSaving, setPhotoThresholdSaving] = useState(false);
  const [photoThresholdError, setPhotoThresholdError] = useState('');
  const [isPhotoThresholdEditing, setIsPhotoThresholdEditing] = useState(false);
  const [photoThresholdMap, setPhotoThresholdMap] = useState<PhotoThresholdMap>(createDefaultPhotoThresholdMap);
  const [photoThresholdDraft, setPhotoThresholdDraft] = useState<PhotoThresholdMap>(createDefaultPhotoThresholdMap);
  const [isSmileExpanded, setIsSmileExpanded] = useState(false);
  const [smileLoaded, setSmileLoaded] = useState(false);
  const [smileExists, setSmileExists] = useState(false);
  const [smileLoading, setSmileLoading] = useState(false);
  const [smileSaving, setSmileSaving] = useState(false);
  const [smileError, setSmileError] = useState('');
  const [smileConfig, setSmileConfig] = useState<SmileDetectionConfig>(defaultSmileDetectionConfig);
  const [smileDraft, setSmileDraft] = useState<SmileDetectionConfig>(defaultSmileDetectionConfig);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(false);
  const [terminalDraft, setTerminalDraft] = useState<CaptureTerminalConfig>(defaultCaptureTerminalConfig);

  const handleUnsupported = () => {
    notify('目前当前还未支持');
  };

  const loadShotRatioConfig = async () => {
    setShotRatioLoading(true);
    setShotRatioError('');
    try {
      const response = await fetch(
        `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(SHOT_RATIO_CONFIG_TYPE)}&key=${encodeURIComponent(SHOT_RATIO_CONFIG_KEY)}`
      );
      const text = await response.text();
      const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
      if (response.status === 404) {
        const next = createDefaultShotRatioList();
        setShotRatioList(next);
        setShotRatioDraft(cloneShotRatioList(next));
        setShotRatioExists(false);
        setShotRatioLoaded(true);
        return;
      }
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      const next = parseShotRatioList(data?.value) || createDefaultShotRatioList();
      setShotRatioList(next);
      setShotRatioDraft(cloneShotRatioList(next));
      setShotRatioExists(true);
      setShotRatioLoaded(true);
    } catch (error) {
      setShotRatioError((error as Error).message || '加载景别与主体占比失败');
    } finally {
      setShotRatioLoading(false);
    }
  };

  const toggleShotRatioSection = async () => {
    const nextExpanded = !isShotRatioExpanded;
    setIsShotRatioExpanded(nextExpanded);
    if (nextExpanded && !shotRatioLoaded && !shotRatioLoading) {
      await loadShotRatioConfig();
    }
  };

  const getShotRatioItem = (items: ShotRatioList, scene: ShotRatioSceneValue) =>
    items.find(item => item.scene === scene) || createDefaultShotRatioList().find(item => item.scene === scene)!;

  const updateShotRatioDraft = (scene: ShotRatioSceneValue, patch: Partial<ShotRatioItem>) => {
    setShotRatioDraft(prev =>
      prev.map(item => (item.scene === scene ? { ...item, ...patch } : item))
    );
  };

  const handleSaveShotRatio = async () => {
    try {
      const hasInvalidRow = shotRatioRows.some(row => {
        const item = getShotRatioItem(shotRatioDraft, row.scene);
        return !item.range.trim() || !item.ratioMin.trim() || !item.ratioMax.trim();
      });
      if (hasInvalidRow) {
        throw new Error('每个景别都需要填写范围、比例最小值和比例最大值');
      }

      for (const row of shotRatioRows) {
        const item = getShotRatioItem(shotRatioDraft, row.scene);
        const ratioMin = Number(item.ratioMin);
        const ratioMax = Number(item.ratioMax);
        if (Number.isNaN(ratioMin) || Number.isNaN(ratioMax)) {
          throw new Error(`${row.scene} 的最小比例和最大比例必须是数字`);
        }
        if (ratioMin > ratioMax) {
          throw new Error(`${row.scene} 需要满足 最小比例 <= 最大比例`);
        }
      }

      setShotRatioSaving(true);
      setShotRatioError('');

      const payload = {
        type: SHOT_RATIO_CONFIG_TYPE,
        key: SHOT_RATIO_CONFIG_KEY,
        value: serializeShotRatioList(shotRatioDraft)
      };
      const path = shotRatioExists ? '/kv/update' : '/kv/create';
      const response = await fetch(`${CONFIG_SERVER_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      const data = parseJsonSafely(text) as { error?: string } | null;
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      const next = cloneShotRatioList(shotRatioDraft);
      setShotRatioList(next);
      setShotRatioDraft(cloneShotRatioList(next));
      setShotRatioExists(true);
      setIsShotRatioEditing(false);
      notify('景别与主体占比已保存');
    } catch (error) {
      setShotRatioError((error as Error).message || '保存景别与主体占比失败');
    } finally {
      setShotRatioSaving(false);
    }
  };

  const loadSubjectOffsetConfig = async () => {
    setSubjectOffsetLoading(true);
    setSubjectOffsetError('');
    try {
      const response = await fetch(
        `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(SUBJECT_OFFSET_SCORE_CONFIG_TYPE)}&key=${encodeURIComponent(SUBJECT_OFFSET_SCORE_CONFIG_KEY)}`
      );
      const text = await response.text();
      const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
      if (response.status === 404) {
        const next = createDefaultSubjectOffsetMap();
        setSubjectOffsetMap(next);
        setSubjectOffsetDraft(cloneSubjectOffsetMap(next));
        setSubjectOffsetExists(false);
        setSubjectOffsetLoaded(true);
        return;
      }
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      const next = parseSubjectOffsetMap(data?.value) || createDefaultSubjectOffsetMap();
      setSubjectOffsetMap(next);
      setSubjectOffsetDraft(cloneSubjectOffsetMap(next));
      setSubjectOffsetExists(true);
      setSubjectOffsetLoaded(true);
    } catch (error) {
      setSubjectOffsetError((error as Error).message || '加载主体偏离度评分标准失败');
    } finally {
      setSubjectOffsetLoading(false);
    }
  };

  const toggleSubjectOffsetSection = async () => {
    const nextExpanded = !isSubjectOffsetExpanded;
    setIsSubjectOffsetExpanded(nextExpanded);
    if (nextExpanded && !subjectOffsetLoaded && !subjectOffsetLoading) {
      await loadSubjectOffsetConfig();
    }
  };

  const updateSubjectOffsetDraft = (rowKey: SubjectOffsetRowKey, patch: Partial<SubjectOffsetItem>) => {
    setSubjectOffsetDraft(prev => ({
      ...prev,
      [rowKey]: {
        ...prev[rowKey],
        ...patch
      }
    }));
  };

  const handleSaveSubjectOffset = async () => {
    setSubjectOffsetError('');
    for (const row of subjectOffsetRows) {
      const item = subjectOffsetDraft[row.key];
      const rowTitle = `${row.code} ${row.scene}`;
      if (item.x1.trim() === '' || item.x2.trim() === '') {
        setSubjectOffsetError(`${rowTitle} 的好~中 阈值和中~差 阈值不能为空`);
        return;
      }
      const x1 = Number(item.x1);
      const x2 = Number(item.x2);
      if (Number.isNaN(x1) || Number.isNaN(x2)) {
        setSubjectOffsetError(`${rowTitle} 的好~中 阈值和中~差 阈值必须是数字`);
        return;
      }
      if (x1 < 0 || x2 > 100 || x1 >= x2) {
        setSubjectOffsetError(`${rowTitle} 需要满足 好~中 阈值 < 中~差 阈值，且取值范围在 0 到 100 之间`);
        return;
      }
    }

    setSubjectOffsetSaving(true);
    try {
      const payload = {
        type: SUBJECT_OFFSET_SCORE_CONFIG_TYPE,
        key: SUBJECT_OFFSET_SCORE_CONFIG_KEY,
        value: serializeSubjectOffsetMap(subjectOffsetDraft)
      };
      const path = subjectOffsetExists ? '/kv/update' : '/kv/create';
      const response = await fetch(`${CONFIG_SERVER_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      const data = parseJsonSafely(text) as { error?: string } | null;
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      const next = cloneSubjectOffsetMap(subjectOffsetDraft);
      setSubjectOffsetMap(next);
      setSubjectOffsetDraft(cloneSubjectOffsetMap(next));
      setSubjectOffsetExists(true);
      setIsSubjectOffsetEditing(false);
      notify('主体偏离度评分标准已保存');
    } catch (error) {
      setSubjectOffsetError((error as Error).message || '保存主体偏离度评分标准失败');
    } finally {
      setSubjectOffsetSaving(false);
    }
  };

  const loadPhotoThresholdConfig = async () => {
    setPhotoThresholdLoading(true);
    setPhotoThresholdError('');
    try {
      const response = await fetch(
        `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(PHOTO_THRESHOLD_CONFIG_TYPE)}&key=${encodeURIComponent(PHOTO_THRESHOLD_CONFIG_KEY)}`
      );
      const text = await response.text();
      const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
      if (response.status === 404) {
        const next = createDefaultPhotoThresholdMap();
        setPhotoThresholdMap(next);
        setPhotoThresholdDraft(clonePhotoThresholdMap(next));
        setPhotoThresholdExists(false);
        setPhotoThresholdLoaded(true);
        return;
      }
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      const next = parsePhotoThresholdMap(data?.value) || createDefaultPhotoThresholdMap();
      setPhotoThresholdMap(next);
      setPhotoThresholdDraft(clonePhotoThresholdMap(next));
      setPhotoThresholdExists(true);
      setPhotoThresholdLoaded(true);
    } catch (error) {
      setPhotoThresholdError((error as Error).message || '加载拍照阈值设置失败');
    } finally {
      setPhotoThresholdLoading(false);
    }
  };

  const togglePhotoThresholdSection = async () => {
    const nextExpanded = !isPhotoThresholdExpanded;
    setIsPhotoThresholdExpanded(nextExpanded);
    if (nextExpanded && !photoThresholdLoaded && !photoThresholdLoading) {
      await loadPhotoThresholdConfig();
    }
  };

  const updatePhotoThresholdDraft = (
    rowKey: PhotoThresholdRowKey,
    patch: Partial<PhotoThresholdItem>
  ) => {
    setPhotoThresholdDraft(prev => ({
      ...prev,
      [rowKey]: {
        ...prev[rowKey],
        ...patch
      }
    }));
  };

  const handleSavePhotoThreshold = async () => {
    setPhotoThresholdSaving(true);
    setPhotoThresholdError('');
    try {
      const payload = {
        type: PHOTO_THRESHOLD_CONFIG_TYPE,
        key: PHOTO_THRESHOLD_CONFIG_KEY,
        value: photoThresholdDraft
      };
      const path = photoThresholdExists ? '/kv/update' : '/kv/create';
      const response = await fetch(`${CONFIG_SERVER_BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      const data = parseJsonSafely(text) as { error?: string } | null;
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      const next = clonePhotoThresholdMap(photoThresholdDraft);
      setPhotoThresholdMap(next);
      setPhotoThresholdDraft(clonePhotoThresholdMap(next));
      setPhotoThresholdExists(true);
      setIsPhotoThresholdEditing(false);
      notify('拍照阈值设置已保存');
    } catch (error) {
      setPhotoThresholdError((error as Error).message || '保存拍照阈值设置失败');
    } finally {
      setPhotoThresholdSaving(false);
    }
  };

  const loadSmileConfig = async () => {
    setSmileLoading(true);
    setSmileError('');
    try {
      const response = await fetch(
        `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(SMILE_CONFIG_TYPE)}&key=${encodeURIComponent(SMILE_CONFIG_KEY)}`
      );
      const text = await response.text();
      const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
      if (response.status === 404) {
        const next = defaultSmileDetectionConfig();
        setSmileConfig(next);
        setSmileDraft({ ...next });
        setSmileExists(false);
        setSmileLoaded(true);
        return;
      }
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      const next = parseSmileDetectionConfig(data?.value) || defaultSmileDetectionConfig();
      setSmileConfig(next);
      setSmileDraft({ ...next });
      setSmileExists(true);
      setSmileLoaded(true);
    } catch (error) {
      setSmileError((error as Error).message || '加载笑容检测参数失败');
    } finally {
      setSmileLoading(false);
    }
  };

  const toggleSmileSection = async () => {
    const nextExpanded = !isSmileExpanded;
    setIsSmileExpanded(nextExpanded);
    if (nextExpanded && !smileLoaded && !smileLoading) {
      await loadSmileConfig();
    }
  };

  const handleSaveSmileConfig = async () => {
    if (smileDraft.mouthWidthMicroSmile >= smileDraft.mouthWidthBigSmile) {
      setSmileError('嘴巴宽度阈值需要满足 微笑阈值 < 大笑阈值');
      return;
    }
    if (smileDraft.mouthCornerMicroSmile <= smileDraft.mouthCornerBigSmile) {
      setSmileError('嘴角上扬阈值需要满足 微笑阈值 > 大笑阈值');
      return;
    }

    setSmileSaving(true);
    setSmileError('');
    try {
      const payload = {
        type: SMILE_CONFIG_TYPE,
        key: SMILE_CONFIG_KEY,
        value: smileDraft
      };
      const path = smileExists ? '/kv/update' : '/kv/create';
      const response = await fetch(`${CONFIG_SERVER_BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const text = await response.text();
      const data = parseJsonSafely(text) as { error?: string } | null;
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      setSmileConfig({ ...smileDraft });
      setSmileDraft({ ...smileDraft });
      setSmileExists(true);
      notify('笑容检测参数已保存');
    } catch (error) {
      setSmileError((error as Error).message || '保存笑容检测参数失败');
    } finally {
      setSmileSaving(false);
    }
  };

  const toggleTerminalSection = () => {
    setIsTerminalExpanded(prev => !prev);
  };

  const connectTerminal = (target: 'phone' | 'drone') => {
    if (target === 'phone') {
      setTerminalDraft(prev => ({
        ...prev,
        phoneStatus: '已连接',
        droneStatus: '连接'
      }));
      notify('已切换连接到移动终端');
      return;
    }
    setTerminalDraft(prev => ({
      ...prev,
      phoneStatus: '连接',
      droneStatus: '已连接'
    }));
    notify(`已切换连接到 ${terminalDraft.droneDeviceName}`);
  };

  const terminalButtonClass = (connected: boolean) =>
    `w-32 rounded-lg border px-4 py-2 text-base transition ${
      connected
        ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
        : 'border-sky-400/60 bg-sky-500 text-white hover:bg-sky-400'
    }`;

  const tabClassName = (active: boolean) =>
    `flex min-h-[88px] flex-1 flex-col justify-end rounded-xl border px-4 pb-4 pt-4 text-left transition ${
      active
        ? 'border-blue-500 bg-slate-700 text-white'
        : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
    }`;

  return (
    <div className="min-h-screen bg-slate-900 px-4 pb-32 pt-4 sm:px-6 lg:pb-40 lg:pt-6">
      <style>{`
        .smile-slider {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }

        .smile-slider::-webkit-slider-runnable-track {
          height: 8px;
          background: transparent;
        }

        .smile-slider::-moz-range-track {
          height: 8px;
          background: transparent;
        }

        .smile-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 9999px;
          background: #ffffff;
          border: 3px solid #6d5efc;
          box-shadow: 0 4px 12px rgba(109, 94, 252, 0.25);
          margin-top: -8px;
          cursor: pointer;
        }

        .smile-slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 9999px;
          background: #ffffff;
          border: 3px solid #6d5efc;
          box-shadow: 0 4px 12px rgba(109, 94, 252, 0.25);
          cursor: pointer;
        }

        .smile-slider.dual {
          pointer-events: none;
        }

        .smile-slider.dual::-webkit-slider-thumb {
          pointer-events: auto;
        }

        .smile-slider.dual::-moz-range-thumb {
          pointer-events: auto;
        }
      `}</style>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-xl bg-slate-800 p-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('basic')}
              className={tabClassName(activeTab === 'basic')}
            >
              <span className="text-[15px] font-semibold sm:text-lg">基础配置</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('template')}
              className={tabClassName(activeTab === 'template')}
            >
              <span className="text-[15px] font-semibold sm:text-lg">意图模版</span>
            </button>
            <button
              type="button"
              onClick={handleUnsupported}
              className={tabClassName(false)}
            >
              <span className="text-[15px] font-semibold sm:text-lg">分析结果</span>
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900 p-3 sm:p-4">
            <div className={activeTab === 'basic' ? 'block' : 'hidden'}>
              <div className="space-y-4">
                {basicConfigSections.map(section => {
                  if (section === '一、构图关键参数') {
                    return (
                      <div key={section} className="rounded-xl border border-slate-700 bg-slate-800">
                        <button
                          type="button"
                          onClick={() => setIsCompositionExpanded(prev => !prev)}
                          className="flex w-full items-center justify-between px-4 py-4 text-left text-white transition hover:bg-slate-700 sm:px-5"
                        >
                          <span className="text-base font-medium leading-tight sm:text-lg">
                            {section}
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 flex-none text-slate-400 transition ${
                              isCompositionExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {isCompositionExpanded && (
                          <div className="space-y-3 border-t border-slate-700 px-3 py-3 sm:px-4">
                            {compositionParams.map(param => {
                              const isPendingParam = pendingCompositionParamKeys.has(param.key);
                              return (
                                <div
                                  key={param.key}
                                  className={`rounded-xl border border-slate-700 bg-slate-900 ${isPendingParam ? 'opacity-50' : ''}`}
                                >
                                  <button
                                    type="button"
                                    disabled={isPendingParam}
                                    onClick={() =>
                                      setExpandedParamKey(prev => (prev === param.key ? null : param.key))
                                    }
                                    className={`flex w-full items-center justify-between px-4 py-3 text-left text-white transition ${isPendingParam ? 'cursor-not-allowed' : 'hover:bg-slate-800'}`}
                                  >
                                    <span className="flex items-center gap-2 text-sm font-medium sm:text-base">
                                      <span>{param.label}</span>
                                      {isPendingParam && <PendingInfoHint />}
                                    </span>
                                    <ChevronDown
                                      className={`h-4 w-4 flex-none text-slate-400 transition ${
                                        expandedParamKey === param.key ? 'rotate-180' : ''
                                      }`}
                                    />
                                  </button>

                                  {!isPendingParam && expandedParamKey === param.key && (
                                    <div className="border-t border-slate-700 px-4 py-3 text-sm text-slate-300">
                                      <div className="grid gap-2">
                                        {param.options.map(option => (
                                          <div
                                            key={option}
                                            className="rounded-lg bg-slate-800 px-3 py-2"
                                          >
                                            {option}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (pendingConfigSections.has(section)) {
                    return (
                      <div
                        key={section}
                        className="rounded-xl border border-slate-700 bg-slate-800/70 opacity-60"
                      >
                        <div className="flex w-full items-center justify-between px-4 py-4 text-left text-white sm:px-5">
                          <span className="text-base font-medium leading-tight sm:text-lg">
                            {section}
                          </span>
                          <PendingInfoHint />
                        </div>
                      </div>
                    );
                  }

                  if (section === '二、景别与主体占比') {
                    return (
                      <div key={section} className="rounded-xl border border-slate-700 bg-slate-800">
                        <button
                          type="button"
                          onClick={toggleShotRatioSection}
                          className="flex w-full items-center justify-between px-4 py-4 text-left text-white transition hover:bg-slate-700 sm:px-5"
                        >
                          <span className="text-base font-medium leading-tight sm:text-lg">
                            {section}
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 flex-none text-slate-400 transition ${
                              isShotRatioExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {isShotRatioExpanded && (
                          <div className="border-t border-slate-700 p-3 sm:p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-sm text-slate-400">
                                  支持编辑表格后保存到后端配置服务
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {isShotRatioEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShotRatioDraft(cloneShotRatioList(shotRatioList));
                                        setIsShotRatioEditing(false);
                                        setShotRatioError('');
                                      }}
                                      className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700"
                                    >
                                      取消
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleSaveShotRatio}
                                      disabled={shotRatioSaving}
                                      className="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {shotRatioSaving ? '保存中...' : '保存'}
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShotRatioDraft(cloneShotRatioList(shotRatioList));
                                      setIsShotRatioEditing(true);
                                    }}
                                    disabled={shotRatioLoading}
                                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    编辑
                                  </button>
                                )}
                              </div>
                            </div>

                            {shotRatioError && (
                              <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {shotRatioError}
                              </div>
                            )}

                            {shotRatioLoading ? (
                              <div className="mt-4 text-sm text-slate-400">加载中...</div>
                            ) : (
                              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700">
                                <table className="min-w-[720px] w-full border-collapse text-sm text-slate-200">
                                  <thead>
                                    <tr className="bg-slate-900">
                                      <th
                                        rowSpan={2}
                                        className="border border-slate-700 px-4 py-4 text-center text-base font-medium"
                                      >
                                        景别
                                      </th>
                                      <th
                                        rowSpan={2}
                                        className="border border-slate-700 px-4 py-4 text-center text-base font-medium"
                                      >
                                        范围
                                      </th>
                                      <th
                                        colSpan={2}
                                        className="border border-slate-700 px-4 py-4 text-center text-base font-medium"
                                      >
                                        比例范围
                                      </th>
                                    </tr>
                                    <tr className="bg-slate-900">
                                      <th className="border border-slate-700 px-4 py-3 text-center text-base font-medium text-slate-300">
                                        最小比例
                                      </th>
                                      <th className="border border-slate-700 px-4 py-3 text-center text-base font-medium text-slate-300">
                                        最大比例
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shotRatioRows.map(row => {
                                      const draftItem = getShotRatioItem(shotRatioDraft, row.scene);
                                      const savedItem = getShotRatioItem(shotRatioList, row.scene);
                                      return (
                                        <tr key={row.key} className="bg-slate-800/70">
                                          <td className="border border-slate-700 px-4 py-5 text-center text-lg font-medium text-white">
                                            {row.scene}
                                          </td>
                                          <td className="border border-slate-700 px-3 py-4 text-center">
                                            {isShotRatioEditing ? (
                                              <select
                                                value={draftItem.range}
                                                onChange={event =>
                                                  updateShotRatioDraft(row.scene, {
                                                    range: event.target.value as ShotRatioRangeValue
                                                  })
                                                }
                                                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-center text-base text-white outline-none transition focus:border-blue-400"
                                              >
                                                {shotRatioRanges.map(option => (
                                                  <option key={option.key} value={option.value}>
                                                    {option.value}
                                                  </option>
                                                ))}
                                              </select>
                                            ) : (
                                              <span className="text-lg text-slate-100">{savedItem.range}</span>
                                            )}
                                          </td>
                                          <td className="border border-slate-700 px-3 py-4 text-center">
                                            {isShotRatioEditing ? (
                                              <input
                                                type="number"
                                                value={draftItem.ratioMin}
                                                onChange={event =>
                                                  updateShotRatioDraft(row.scene, { ratioMin: event.target.value })
                                                }
                                                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-center text-base text-white outline-none transition focus:border-blue-400"
                                              />
                                            ) : (
                                              <span className="text-lg text-slate-100">{savedItem.ratioMin}</span>
                                            )}
                                          </td>
                                          <td className="border border-slate-700 px-3 py-4 text-center">
                                            {isShotRatioEditing ? (
                                              <input
                                                type="number"
                                                value={draftItem.ratioMax}
                                                onChange={event =>
                                                  updateShotRatioDraft(row.scene, { ratioMax: event.target.value })
                                                }
                                                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-center text-base text-white outline-none transition focus:border-blue-400"
                                              />
                                            ) : (
                                              <span className="text-lg text-slate-100">{savedItem.ratioMax}</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (section === '四、主体偏离度评分标准') {
                    return (
                      <div key={section} className="rounded-xl border border-slate-700 bg-slate-800">
                        <button
                          type="button"
                          onClick={toggleSubjectOffsetSection}
                          className="flex w-full items-center justify-between px-4 py-4 text-left text-white transition hover:bg-slate-700 sm:px-5"
                        >
                          <span className="text-base font-medium leading-tight sm:text-lg">
                            {section}
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 flex-none text-slate-400 transition ${
                              isSubjectOffsetExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {isSubjectOffsetExpanded && (
                          <div className="border-t border-slate-700 p-3 sm:p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-sm text-slate-400">
                                  支持编辑评分区间并保存到后端配置服务
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {isSubjectOffsetEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSubjectOffsetDraft(cloneSubjectOffsetMap(subjectOffsetMap));
                                        setIsSubjectOffsetEditing(false);
                                        setSubjectOffsetError('');
                                      }}
                                      className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700"
                                    >
                                      取消
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleSaveSubjectOffset}
                                      disabled={subjectOffsetSaving}
                                      className="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {subjectOffsetSaving ? '保存中...' : '保存'}
                                    </button>
                                  </>
                                ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSubjectOffsetDraft(cloneSubjectOffsetMap(subjectOffsetMap));
                                        setIsSubjectOffsetEditing(true);
                                      }}
                                    disabled={subjectOffsetLoading}
                                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    编辑
                                  </button>
                                )}
                              </div>
                            </div>

                            {subjectOffsetError && (
                              <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {subjectOffsetError}
                              </div>
                            )}

                            {subjectOffsetLoading ? (
                              <div className="mt-4 text-sm text-slate-400">加载中...</div>
                            ) : (
                              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700">
                                <table className="min-w-[760px] w-full border-collapse text-sm text-slate-200">
                                  <thead>
                                    <tr className="bg-slate-900">
                                      <th className="border border-slate-700 px-4 py-4 text-center text-base font-medium">
                                        景别
                                      </th>
                                      <th className="border border-slate-700 px-4 py-4 text-center text-lg font-semibold text-white">
                                        好~中 阈值
                                      </th>
                                      <th className="border border-slate-700 px-4 py-4 text-center text-lg font-semibold text-white">
                                        中~差 阈值
                                      </th>
                                      <th className="border border-slate-700 px-4 py-4 text-center text-lg font-semibold text-white">
                                        评分说明
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subjectOffsetRows.map(row => (
                                      <tr key={row.key} className="bg-slate-800/70">
                                        <td className="border border-slate-700 px-4 py-5 text-center text-lg font-medium text-white">
                                          {row.code} {row.scene}
                                        </td>
                                        {(['x1', 'x2'] as const).map(field => {
                                          const value = isSubjectOffsetEditing
                                            ? subjectOffsetDraft[row.key][field]
                                            : subjectOffsetMap[row.key][field];
                                          return (
                                            <td
                                              key={`${row.key}-${field}`}
                                              className="border border-slate-700 px-3 py-4 text-center"
                                            >
                                              {isSubjectOffsetEditing ? (
                                                <div className="mx-auto flex max-w-[120px] items-center gap-2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2">
                                                  <span className="text-sm text-slate-400">%</span>
                                                  <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={value}
                                                    onChange={event =>
                                                      updateSubjectOffsetDraft(row.key, { [field]: event.target.value })
                                                    }
                                                    className="w-full bg-transparent text-center text-base text-white outline-none"
                                                  />
                                                </div>
                                              ) : (
                                                <span className="text-lg text-slate-100">{value}%</span>
                                              )}
                                            </td>
                                          );
                                        })}
                                        <td className="border border-slate-700 px-4 py-4">
                                          <div className="space-y-2 text-left text-sm text-slate-200">
                                            {getSubjectOffsetDescriptions(
                                              isSubjectOffsetEditing ? subjectOffsetDraft[row.key] : subjectOffsetMap[row.key]
                                            ).map(description => (
                                              <div key={`${row.key}-${description}`} className="rounded-lg bg-slate-900/80 px-3 py-2">
                                                {description}
                                              </div>
                                            ))}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (section === '六、笑容检测参数') {
                    return (
                      <div key={section} className="rounded-xl border border-slate-700 bg-slate-800">
                        <button
                          type="button"
                          onClick={toggleSmileSection}
                          className="flex w-full items-center justify-between px-4 py-4 text-left text-white transition hover:bg-slate-700 sm:px-5"
                        >
                          <span className="text-base font-medium leading-tight sm:text-lg">{section}</span>
                          <ChevronDown className={`h-5 w-5 flex-none text-slate-400 transition ${isSmileExpanded ? 'rotate-180' : ''}`} />
                        </button>

                        {isSmileExpanded && (
                          <div className="border-t border-slate-700 p-4">
                            {smileError && (
                              <div className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {smileError}
                              </div>
                            )}
                            {smileLoading ? (
                              <div className="text-sm text-slate-400">加载中...</div>
                            ) : (
                              <div className="space-y-6">
                                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                                  <div className="text-base font-semibold text-white">评分权重</div>
                                  <div className="mt-3 flex items-center justify-between text-sm text-slate-300">
                                    <span>嘴宽 {(100 - smileDraft.scoreWeightPercent).toFixed(0)}%</span>
                                    <span>上扬 {smileDraft.scoreWeightPercent.toFixed(0)}%</span>
                                  </div>
                                  <div className="relative mt-4 h-8">
                                    <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200/15" />
                                    <div
                                      className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-violet-500"
                                      style={{ width: `${smileDraft.scoreWeightPercent}%` }}
                                    />
                                    <input
                                      type="range"
                                      min="0"
                                      max="100"
                                      value={smileDraft.scoreWeightPercent}
                                      onChange={event =>
                                        setSmileDraft(prev => ({
                                          ...prev,
                                          scoreWeightPercent: Number(event.target.value)
                                        }))
                                      }
                                      className="smile-slider relative z-10 h-8 w-full"
                                    />
                                  </div>
                                  <div className="mt-2 text-sm text-slate-400">
                                    调整嘴宽和上扬在综合评分中的权重
                                  </div>
                                </div>

                                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                                  <div className="text-base font-semibold text-white">嘴巴宽度阈值</div>
                                  <div className="mt-2 text-sm text-slate-300">
                                    不笑↔{formatSmileDecimal(smileDraft.mouthWidthMicroSmile, 2)}↔微笑↔{formatSmileDecimal(smileDraft.mouthWidthBigSmile, 2)}↔大笑
                                  </div>
                                  <div className="relative mt-4 h-8">
                                    <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200/15" />
                                    <div
                                      className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-violet-500"
                                      style={{
                                        left: `${getSliderPercent(smileDraft.mouthWidthMicroSmile, 0, 1)}%`,
                                        width: `${getSliderPercent(smileDraft.mouthWidthBigSmile, 0, 1) - getSliderPercent(smileDraft.mouthWidthMicroSmile, 0, 1)}%`
                                      }}
                                    />
                                    <input
                                      type="range"
                                      min="0"
                                      max="1"
                                      step="0.01"
                                      value={smileDraft.mouthWidthMicroSmile}
                                      onChange={event => {
                                        const nextValue = Math.min(
                                          Number(event.target.value),
                                          smileDraft.mouthWidthBigSmile - 0.01
                                        );
                                        setSmileDraft(prev => ({
                                          ...prev,
                                          mouthWidthMicroSmile: clamp(Number(nextValue.toFixed(2)), 0, 1)
                                        }));
                                      }}
                                      className="smile-slider dual absolute inset-0 z-20 h-8 w-full"
                                    />
                                    <input
                                      type="range"
                                      min="0"
                                      max="1"
                                      step="0.01"
                                      value={smileDraft.mouthWidthBigSmile}
                                      onChange={event => {
                                        const nextValue = Math.max(
                                          Number(event.target.value),
                                          smileDraft.mouthWidthMicroSmile + 0.01
                                        );
                                        setSmileDraft(prev => ({
                                          ...prev,
                                          mouthWidthBigSmile: clamp(Number(nextValue.toFixed(2)), 0, 1)
                                        }));
                                      }}
                                      className="smile-slider dual absolute inset-0 z-30 h-8 w-full"
                                    />
                                  </div>
                                </div>

                                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                                  <div className="text-base font-semibold text-white">嘴角上扬阈值</div>
                                  <div className="mt-2 text-sm text-slate-300">
                                    不笑↔{formatSmileDecimal(smileDraft.mouthCornerMicroSmile, 3)}↔微笑↔{formatSmileDecimal(smileDraft.mouthCornerBigSmile, 3)}↔大笑
                                  </div>
                                  <div className="relative mt-4 h-8">
                                    <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-slate-200/15" />
                                    <div
                                      className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-violet-500"
                                      style={{
                                        left: `${getSliderPercent(smileDraft.mouthCornerMicroSmile, -0.2, 0, true)}%`,
                                        width: `${getSliderPercent(smileDraft.mouthCornerBigSmile, -0.2, 0, true) - getSliderPercent(smileDraft.mouthCornerMicroSmile, -0.2, 0, true)}%`
                                      }}
                                    />
                                    <input
                                      type="range"
                                      min="0"
                                      max="0.2"
                                      step="0.001"
                                      value={toSliderValue(smileDraft.mouthCornerMicroSmile, 0, true)}
                                      onChange={event => {
                                        const actualValue = fromSliderValue(Number(event.target.value), 0, true);
                                        const nextValue = Math.max(
                                          actualValue,
                                          smileDraft.mouthCornerBigSmile + 0.001
                                        );
                                        setSmileDraft(prev => ({
                                          ...prev,
                                          mouthCornerMicroSmile: clamp(Number(nextValue.toFixed(3)), -0.2, 0)
                                        }));
                                      }}
                                      className="smile-slider dual absolute inset-0 z-20 h-8 w-full"
                                    />
                                    <input
                                      type="range"
                                      min="0"
                                      max="0.2"
                                      step="0.001"
                                      value={toSliderValue(smileDraft.mouthCornerBigSmile, 0, true)}
                                      onChange={event => {
                                        const actualValue = fromSliderValue(Number(event.target.value), 0, true);
                                        const nextValue = Math.min(
                                          actualValue,
                                          smileDraft.mouthCornerMicroSmile - 0.001
                                        );
                                        setSmileDraft(prev => ({
                                          ...prev,
                                          mouthCornerBigSmile: clamp(Number(nextValue.toFixed(3)), -0.2, 0)
                                        }));
                                      }}
                                      className="smile-slider dual absolute inset-0 z-30 h-8 w-full"
                                    />
                                  </div>
                                </div>

                                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                                  使用说明：阈值可直接控制笑容分类，同时满足嘴巴宽度和嘴角上扬两个条件时才会触发相应级别。进度百分比：0-33%=不笑，33-66%=微笑，66-100%=大笑。
                                </div>

                                <div className="flex flex-wrap gap-3">
                                  <button
                                    type="button"
                                    onClick={handleSaveSmileConfig}
                                    disabled={smileSaving}
                                    className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {smileSaving ? '保存中...' : '保存'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSmileDraft({ ...smileConfig })}
                                    className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
                                  >
                                    重置
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (section === '七、拍照阈值设置') {
                    return (
                      <div key={section} className="rounded-xl border border-slate-700 bg-slate-800">
                        <button
                          type="button"
                          onClick={togglePhotoThresholdSection}
                          className="flex w-full items-center justify-between px-4 py-4 text-left text-white transition hover:bg-slate-700 sm:px-5"
                        >
                          <span className="text-base font-medium leading-tight sm:text-lg">
                            {section}
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 flex-none text-slate-400 transition ${
                              isPhotoThresholdExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {isPhotoThresholdExpanded && (
                          <div className="border-t border-slate-700 p-3 sm:p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="text-base font-semibold text-white">拍照阈值设置</div>
                                <div className="mt-1 text-sm text-slate-400">
                                  支持编辑阈值启用状态、比较符和阈值数值
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {isPhotoThresholdEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPhotoThresholdDraft(clonePhotoThresholdMap(photoThresholdMap));
                                        setIsPhotoThresholdEditing(false);
                                        setPhotoThresholdError('');
                                      }}
                                      className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700"
                                    >
                                      取消
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleSavePhotoThreshold}
                                      disabled={photoThresholdSaving}
                                      className="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {photoThresholdSaving ? '保存中...' : '保存'}
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPhotoThresholdDraft(clonePhotoThresholdMap(photoThresholdMap));
                                      setIsPhotoThresholdEditing(true);
                                    }}
                                    disabled={photoThresholdLoading}
                                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    编辑
                                  </button>
                                )}
                              </div>
                            </div>

                            {photoThresholdError && (
                              <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {photoThresholdError}
                              </div>
                            )}

                            {photoThresholdLoading ? (
                              <div className="mt-4 text-sm text-slate-400">加载中...</div>
                            ) : (
                              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-700">
                                <table className="min-w-[760px] w-full border-collapse text-sm text-slate-200">
                                  <thead>
                                    <tr className="bg-slate-900">
                                      <th className="border border-slate-700 px-4 py-4 text-center text-base font-medium">
                                        阈值名
                                      </th>
                                      <th className="border border-slate-700 px-4 py-4 text-center text-base font-medium">
                                        是否启用
                                      </th>
                                      <th className="border border-slate-700 px-4 py-4 text-center text-base font-medium">
                                        值
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {photoThresholdRows.map(row => {
                                      const item = isPhotoThresholdEditing
                                        ? photoThresholdDraft[row.key]
                                        : photoThresholdMap[row.key];
                                      return (
                                        <tr key={row.key} className="bg-slate-800/70">
                                          <td className="border border-slate-700 px-4 py-5 text-center text-lg font-medium text-white">
                                            {row.label}
                                          </td>
                                          <td className="border border-slate-700 px-4 py-4 text-center">
                                            {isPhotoThresholdEditing ? (
                                              <div className="flex flex-col items-center gap-2">
                                                <label className="flex items-center gap-2 text-base text-slate-100">
                                                  <input
                                                    type="radio"
                                                    checked={item.enabled}
                                                    onChange={() =>
                                                      updatePhotoThresholdDraft(row.key, { enabled: true })
                                                    }
                                                  />
                                                  <span>是</span>
                                                </label>
                                                <label className="flex items-center gap-2 text-base text-slate-100">
                                                  <input
                                                    type="radio"
                                                    checked={!item.enabled}
                                                    onChange={() =>
                                                      updatePhotoThresholdDraft(row.key, { enabled: false })
                                                    }
                                                  />
                                                  <span>否</span>
                                                </label>
                                              </div>
                                            ) : (
                                              <div className="text-lg text-slate-100">{item.enabled ? '是' : '否'}</div>
                                            )}
                                          </td>
                                          <td className="border border-slate-700 px-4 py-4">
                                            {isPhotoThresholdEditing ? (
                                              <div className="flex items-center justify-center gap-3">
                                                <select
                                                  value={item.operator}
                                                  onChange={event =>
                                                    updatePhotoThresholdDraft(row.key, {
                                                      operator: event.target.value as PhotoThresholdOperator
                                                    })
                                                  }
                                                  className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-base text-white outline-none transition focus:border-blue-400"
                                                >
                                                  {photoThresholdOperators.map(operator => (
                                                    <option key={operator} value={operator}>
                                                      {operator}
                                                    </option>
                                                  ))}
                                                </select>
                                                <input
                                                  type="text"
                                                  value={item.value}
                                                  onChange={event =>
                                                    updatePhotoThresholdDraft(row.key, { value: event.target.value })
                                                  }
                                                  className="w-24 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-center text-base text-white outline-none transition focus:border-blue-400"
                                                />
                                              </div>
                                            ) : (
                                              <div className="text-center text-lg text-slate-100">
                                                {item.operator} {item.value}
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (section === '八、拍摄终端设置') {
                    return (
                      <div key={section} className="rounded-xl border border-slate-700 bg-slate-800">
                        <button
                          type="button"
                          onClick={toggleTerminalSection}
                          className="flex w-full items-center justify-between px-4 py-4 text-left text-white transition hover:bg-slate-700 sm:px-5"
                        >
                          <span className="text-base font-medium leading-tight sm:text-lg">{section}</span>
                          <ChevronDown className={`h-5 w-5 flex-none text-slate-400 transition ${isTerminalExpanded ? 'rotate-180' : ''}`} />
                        </button>

                        {isTerminalExpanded && (
                          <div className="border-t border-slate-700 p-4">
                            <div className="space-y-6">
                              <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                                <div className="text-lg font-medium text-white">移动终端</div>
                                <div className="mt-4 flex flex-wrap items-center gap-3">
                                  <input
                                    type="text"
                                    value={getLocalDeviceName()}
                                    readOnly
                                    className="min-w-[240px] flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-base text-white"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => connectTerminal('phone')}
                                    className={terminalButtonClass(terminalDraft.phoneStatus === '已连接')}
                                  >
                                    {terminalDraft.phoneStatus}
                                  </button>
                                </div>
                              </div>

                              <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                                <div className="text-lg font-medium text-white">无人机</div>
                                <div className="mt-4 flex flex-wrap items-center gap-3">
                                  <select
                                    value={terminalDraft.droneDeviceName}
                                    onChange={event =>
                                      setTerminalDraft(prev => ({ ...prev, droneDeviceName: event.target.value }))
                                    }
                                    className="min-w-[240px] flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-base text-white outline-none transition focus:border-blue-400"
                                  >
                                    {droneTerminalOptions.map(option => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => connectTerminal('drone')}
                                    className={terminalButtonClass(terminalDraft.droneStatus === '已连接')}
                                  >
                                    {terminalDraft.droneStatus}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={section}
                      type="button"
                      onClick={handleUnsupported}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-4 py-4 text-left text-white transition hover:bg-slate-700 sm:px-5"
                    >
                      <span className="text-base font-medium leading-tight sm:text-lg">
                        {section}
                      </span>
                      <ChevronDown className="h-5 w-5 flex-none text-slate-400" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={activeTab === 'template' ? 'block' : 'hidden'}>
              <TemplateManager embedded />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfigPanel;
