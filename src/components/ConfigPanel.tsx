import { ChevronDown, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import TemplateManager from './TemplateManager';
import {
  BODY_RANGE_CONFIG_KEY,
  BODY_RANGE_CONFIG_TYPE,
  type BodyRangeConfigItem,
  buildBodyRangeOptions,
  compositionParams,
  formatBodyRangeValue,
  formatShotTypeValue,
  isValidBodyRangeCode,
  isValidShotTypeCode,
  normalizeBodyRangeCode,
  normalizeOptionValue,
  normalizeShotTypeCode,
  parseBodyRangeCustomItems,
  parseShotTypeCustomItems,
  serializeBodyRangeCustomItems,
  serializeShotTypeCustomItems,
  splitBodyRangeValue,
  splitShotTypeValue,
  SHOT_TYPE_CONFIG_KEY,
  SHOT_TYPE_CONFIG_TYPE,
  type ShotTypeConfigItem,
  buildShotTypeOptions,
  stripOptionCode
} from '../shared/intentTemplateOptions';

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
const pendingCompositionParamKeys = new Set(['K']);
const pendingConfigSections = new Set([
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
const SUBJECT_RATIO_SCORE_CONFIG_TYPE = 'basic_config';
const SUBJECT_RATIO_SCORE_CONFIG_KEY = 'subject_ratio_score_table';
const SUBJECT_OFFSET_SCORE_CONFIG_TYPE = 'basic_config';
const SUBJECT_OFFSET_SCORE_CONFIG_KEY = 'subject_offset_score_table';
const PHOTO_THRESHOLD_CONFIG_TYPE = 'basic_config';
const PHOTO_THRESHOLD_CONFIG_KEY = 'photo_threshold_settings';
const SMILE_CONFIG_TYPE = 'basic_config';
const SMILE_CONFIG_KEY = 'smile_detection_settings';
const GUIDE_LINE_CONFIG_TYPE = 'basic_config';
const GUIDE_LINE_CONFIG_KEY = 'guide_line_settings';
type ShotRatioMatrix = Record<string, Record<string, string>>;

const parseJsonSafely = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const DEFAULT_SHOT_RATIO_CELLS = [
  { scene: 'B2近景', range: 'A2胸部及以上', value: '50' },
  { scene: 'B3中近景', range: 'A3腰部及以上', value: '40' },
  { scene: 'B4中景', range: 'A4膝盖及以上', value: '30' },
  { scene: 'B4中景', range: 'A5全身', value: '15' },
  { scene: 'B6远景', range: 'A5全身', value: '5' }
] as const;

type SubjectRatioEvaluationCell = {
  min: string;
  max: string;
};

type SubjectRatioEvaluationMatrix = Record<string, Record<string, SubjectRatioEvaluationCell | null>>;

const normalizeSubjectRatioIntegerValue = (value: unknown, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const trimmed = String(value).trim();
  if (!trimmed) return fallback;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return String(Math.round(numeric));
  }
  const firstDigits = trimmed.match(/\d+/);
  return firstDigits?.[0] ?? fallback;
};

const DEFAULT_SUBJECT_RATIO_SCORE_CELLS = [
  { scene: 'B2近景', range: 'A2胸部及以上', min: '45', max: '60' },
  { scene: 'B3中近景', range: 'A3腰部及以上', min: '32', max: '45' },
  { scene: 'B4中景', range: 'A4膝盖及以上', min: '22', max: '32' },
  { scene: 'B4中景', range: 'A5全身', min: '8', max: '22' },
  { scene: 'B6远景', range: 'A5全身', min: '1', max: '8' }
] as const;

const isShotRatioCellEmpty = (value: string) => {
  const normalized = value.trim();
  return !normalized || normalized === '-';
};

const normalizeShotRatioCellValue = (value: string) => {
  const trimmed = value.trim();
  return trimmed || '-';
};

const coerceShotRatioCellToSingleValue = (value: string) => {
  const normalized = normalizeShotRatioCellValue(value);
  if (normalized === '-') return '-';
  const bounds = parseShotRatioCellBounds(normalized);
  if (!bounds) return normalized;
  const min = Number(bounds.ratioMin);
  const max = Number(bounds.ratioMax);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return normalized;
  if (min === max) return String(min);
  if (min === 0) return String(max);
  return String(Math.round(((min + max) / 2) * 100) / 100);
};

const formatShotRatioDisplayValue = (value: string) => {
  const normalized = normalizeShotRatioCellValue(value);
  if (normalized === '-') return '-';
  return `${normalized}%`;
};

const createSubjectRatioEvaluationMatrix = (
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[]
): SubjectRatioEvaluationMatrix => {
  const next: SubjectRatioEvaluationMatrix = {};

  shotTypeOptions.forEach(scene => {
    next[scene] = {};
    bodyRangeOptions.forEach(range => {
      next[scene][range] = null;
    });
  });

  DEFAULT_SUBJECT_RATIO_SCORE_CELLS.forEach(item => {
    const matchedScene = shotTypeOptions.find(option => normalizeOptionValue(option) === normalizeOptionValue(item.scene));
    const matchedRange = bodyRangeOptions.find(option => normalizeOptionValue(option) === normalizeOptionValue(item.range));
    if (matchedScene && matchedRange) {
      next[matchedScene][matchedRange] = {
        min: item.min,
        max: item.max
      };
    }
  });

  return next;
};

const cloneSubjectRatioEvaluationMatrix = (matrix: SubjectRatioEvaluationMatrix): SubjectRatioEvaluationMatrix =>
  Object.fromEntries(
    Object.entries(matrix).map(([scene, ranges]) => [
      scene,
      Object.fromEntries(
        Object.entries(ranges).map(([range, cell]) => [
          range,
          cell
            ? {
                min: cell.min,
                max: cell.max
              }
            : null
        ])
      )
    ])
  );

const formatSubjectRatioEvaluationDisplayValue = (cell: SubjectRatioEvaluationCell | null) => {
  if (!cell || (!cell.min.trim() && !cell.max.trim())) return '-';
  return `(${cell.min}%,${cell.max}%]`;
};

const normalizeSubjectRatioEvaluationCell = (
  cell: SubjectRatioEvaluationCell | null | undefined
): SubjectRatioEvaluationCell | null => {
  if (!cell) return null;
  const min = normalizeSubjectRatioIntegerValue(cell.min, '');
  const max = normalizeSubjectRatioIntegerValue(cell.max, '');
  if (!min && !max) return null;
  return {
    min,
    max
  };
};

const normalizeSubjectRatioEvaluationMatrix = (
  value: SubjectRatioEvaluationMatrix | null | undefined,
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[]
): SubjectRatioEvaluationMatrix => {
  const next = createSubjectRatioEvaluationMatrix(bodyRangeOptions, shotTypeOptions);
  if (!value) return next;

  shotTypeOptions.forEach(scene => {
    bodyRangeOptions.forEach(range => {
      next[scene][range] = normalizeSubjectRatioEvaluationCell(value[scene]?.[range]);
    });
  });

  return next;
};

const parseSubjectRatioEvaluationText = (value: string): SubjectRatioEvaluationCell | null => {
  const normalized = value.trim().replace(/\s+/g, '');
  if (!normalized || normalized === '-') return null;
  const match = normalized.match(/^[\(\[]?(\d+(?:\.\d+)?)%?,(\d+(?:\.\d+)?)%?[\]\)]?$/);
  if (!match) return null;
  return normalizeSubjectRatioEvaluationCell({
    min: match[1],
    max: match[2]
  });
};

const parseSubjectRatioEvaluationMatrix = (
  value: unknown,
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[]
): SubjectRatioEvaluationMatrix | null => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }

  const next = createSubjectRatioEvaluationMatrix(bodyRangeOptions, shotTypeOptions);
  if (!source || typeof source !== 'object') return null;

  if (Array.isArray(source)) {
    source.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const entry = item as Record<string, unknown>;
      const sceneRaw = typeof entry.scene === 'string' ? entry.scene : '';
      const rangeRaw = typeof entry.range === 'string' ? entry.range : '';
      const matchedScene = sceneRaw ? matchShotRatioScene(sceneRaw, shotTypeOptions) : null;
      const matchedRange = rangeRaw ? matchShotRatioRange(rangeRaw, bodyRangeOptions) : null;
      if (!matchedScene || !matchedRange) return;
      const min =
        typeof entry.min === 'number' || typeof entry.min === 'string'
          ? String(entry.min).trim()
          : typeof entry.ratioMin === 'number' || typeof entry.ratioMin === 'string'
            ? String(entry.ratioMin).trim()
            : '';
      const max =
        typeof entry.max === 'number' || typeof entry.max === 'string'
          ? String(entry.max).trim()
          : typeof entry.ratioMax === 'number' || typeof entry.ratioMax === 'string'
            ? String(entry.ratioMax).trim()
            : '';
      next[matchedScene.value][matchedRange.value] = normalizeSubjectRatioEvaluationCell({ min, max });
    });
    return next;
  }

  const obj = source as Record<string, unknown>;
  Object.entries(obj).forEach(([sceneKey, rangesValue]) => {
    const matchedScene = matchShotRatioScene(sceneKey, shotTypeOptions);
    if (!matchedScene || !rangesValue || typeof rangesValue !== 'object') return;
    const rangesObj = rangesValue as Record<string, unknown>;
    Object.entries(rangesObj).forEach(([rangeKey, cellValue]) => {
      const matchedRange = matchShotRatioRange(rangeKey, bodyRangeOptions);
      if (!matchedRange) return;
      if (typeof cellValue === 'string') {
        next[matchedScene.value][matchedRange.value] = parseSubjectRatioEvaluationText(cellValue);
        return;
      }
      if (!cellValue || typeof cellValue !== 'object') return;
      const cellObj = cellValue as Record<string, unknown>;
      const min =
        typeof cellObj.min === 'number' || typeof cellObj.min === 'string'
          ? String(cellObj.min).trim()
          : '';
      const max =
        typeof cellObj.max === 'number' || typeof cellObj.max === 'string'
          ? String(cellObj.max).trim()
          : '';
      next[matchedScene.value][matchedRange.value] = normalizeSubjectRatioEvaluationCell({ min, max });
    });
  });

  return next;
};

const serializeSubjectRatioEvaluationMatrix = (
  matrix: SubjectRatioEvaluationMatrix,
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[]
) =>
  Object.fromEntries(
    shotTypeOptions.map(scene => [
      scene,
      Object.fromEntries(
        bodyRangeOptions
          .map(range => {
            const cell = normalizeSubjectRatioEvaluationCell(matrix[scene]?.[range]);
            if (!cell) return null;
            return [
              range,
              {
                min: Number(normalizeSubjectRatioIntegerValue(cell.min, '0')),
                max: Number(normalizeSubjectRatioIntegerValue(cell.max, '0'))
              }
            ];
          })
          .filter((item): item is [string, { min: number; max: number }] => Boolean(item))
      )
    ])
  );

const createShotRatioMatrix = (
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[]
): ShotRatioMatrix => {
  const next: ShotRatioMatrix = {};

  shotTypeOptions.forEach(scene => {
    next[scene] = {};
    bodyRangeOptions.forEach(range => {
      next[scene][range] = '-';
    });
  });

  DEFAULT_SHOT_RATIO_CELLS.forEach(item => {
    const matchedScene = shotTypeOptions.find(option => normalizeOptionValue(option) === normalizeOptionValue(item.scene));
    const matchedRange = bodyRangeOptions.find(option => normalizeOptionValue(option) === normalizeOptionValue(item.range));
    if (matchedScene && matchedRange) {
      next[matchedScene][matchedRange] = item.value;
    }
  });

  return next;
};

const cloneShotRatioMatrix = (matrix: ShotRatioMatrix): ShotRatioMatrix =>
  Object.fromEntries(
    Object.entries(matrix).map(([scene, ranges]) => [
      scene,
      Object.fromEntries(Object.entries(ranges).map(([range, value]) => [range, value]))
    ])
  );

const createShotRatioRanges = (bodyRangeOptions: readonly string[]) =>
  bodyRangeOptions.map(option => ({
    key: splitBodyRangeValue(option)?.code || option,
    value: normalizeOptionValue(option)
  }));

const createShotRatioScenes = (shotTypeOptions: readonly string[]) =>
  shotTypeOptions.map(option => ({
    key: splitShotTypeValue(option)?.code || option,
    value: normalizeOptionValue(option)
  }));

const matchShotRatioRange = (value: string, bodyRangeOptions: readonly string[]) => {
  const normalizedValue = normalizeOptionValue(value);
  return createShotRatioRanges(bodyRangeOptions).find(option => {
    const normalizedRange = normalizeOptionValue(option.value);
    return normalizedRange === normalizedValue || stripOptionCode(normalizedRange) === normalizedValue;
  });
};

const matchShotRatioScene = (value: string, shotTypeOptions: readonly string[]) => {
  const normalizedValue = normalizeOptionValue(value);
  return createShotRatioScenes(shotTypeOptions).find(option => {
    const normalizedScene = normalizeOptionValue(option.value);
    return normalizedScene === normalizedValue || stripOptionCode(normalizedScene) === normalizedValue;
  });
};

const parseShotRatioCellBounds = (value: string): { ratioMin: string; ratioMax: string } | null => {
  const normalized = value.trim().replace(/\s+/g, '');
  if (!normalized || normalized === '-') return null;

  const lessEqualMatch = normalized.match(/^<=?(\d+(?:\.\d+)?)%?$/);
  if (lessEqualMatch) {
    return {
      ratioMin: '0',
      ratioMax: lessEqualMatch[1]
    };
  }

  const greaterEqualMatch = normalized.match(/^>=?(\d+(?:\.\d+)?)%?$/);
  if (greaterEqualMatch) {
    return {
      ratioMin: greaterEqualMatch[1],
      ratioMax: greaterEqualMatch[1]
    };
  }

  const rangeMatch = normalized.match(/^(\d+(?:\.\d+)?)%?[-~](\d+(?:\.\d+)?)%?$/);
  if (rangeMatch) {
    return {
      ratioMin: rangeMatch[1],
      ratioMax: rangeMatch[2]
    };
  }

  const exactMatch = normalized.match(/^(\d+(?:\.\d+)?)%?$/);
  if (exactMatch) {
    return {
      ratioMin: exactMatch[1],
      ratioMax: exactMatch[1]
    };
  }

  return null;
};

const formatShotRatioCellFromBounds = (ratioMin: string, ratioMax: string) => {
  const trimmedMin = ratioMin.trim();
  const trimmedMax = ratioMax.trim();
  if (!trimmedMin && !trimmedMax) return '-';
  if (!trimmedMin) return `<=${trimmedMax}%`;
  if (!trimmedMax) return `${trimmedMin}%`;
  if (trimmedMin === '0') return `<=${trimmedMax}%`;
  if (trimmedMin === trimmedMax) return `${trimmedMin}%`;
  return `${trimmedMin}-${trimmedMax}%`;
};

const normalizeShotRatioMatrix = (
  value: ShotRatioMatrix | null | undefined,
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[]
): ShotRatioMatrix => {
  const next = createShotRatioMatrix(bodyRangeOptions, shotTypeOptions);
  if (!value) return next;

  shotTypeOptions.forEach(scene => {
    bodyRangeOptions.forEach(range => {
      const rawValue = value[scene]?.[range];
      if (typeof rawValue === 'string' && rawValue.trim()) {
        next[scene][range] = coerceShotRatioCellToSingleValue(rawValue);
      }
    });
  });

  return next;
};

const parseShotRatioMatrix = (
  value: unknown,
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[]
): ShotRatioMatrix | null => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }
  const next = createShotRatioMatrix(bodyRangeOptions, shotTypeOptions);

  if (Array.isArray(source)) {
    source.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const entry = item as Record<string, unknown>;
      if (
        (typeof entry.scene === 'string' || typeof entry.scene === 'number') &&
        (typeof entry.range === 'string' || typeof entry.range === 'number')
      ) {
        const matchedRow = matchShotRatioScene(String(entry.scene), shotTypeOptions);
        const matchedRange = matchShotRatioRange(String(entry.range), bodyRangeOptions);
        if (!matchedRow || !matchedRange) return;
        const ratioMin =
          typeof entry.ratioMin === 'number' || typeof entry.ratioMin === 'string' ? String(entry.ratioMin) : '';
        const ratioMax =
          typeof entry.ratioMax === 'number' || typeof entry.ratioMax === 'string' ? String(entry.ratioMax) : '';
        next[matchedRow.value][matchedRange.value] = coerceShotRatioCellToSingleValue(
          formatShotRatioCellFromBounds(ratioMin, ratioMax)
        );
        return;
      }

      const [sceneName, configValue] = Object.entries(entry)[0] || [];
      if (!sceneName || !configValue || typeof configValue !== 'object') return;
      const matchedRow = matchShotRatioScene(sceneName, shotTypeOptions);
      if (!matchedRow) return;
      const configObj = configValue as Record<string, unknown>;
      const matchedRangeKeys = Object.keys(configObj)
        .map(key => matchShotRatioRange(key, bodyRangeOptions))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      if (matchedRangeKeys.length > 0) {
        matchedRangeKeys.forEach(rangeOption => {
          const rawCell = configObj[rangeOption.key] ?? configObj[rangeOption.value];
          if (typeof rawCell === 'string' && rawCell.trim()) {
            next[matchedRow.value][rangeOption.value] = coerceShotRatioCellToSingleValue(rawCell);
          }
        });
        return;
      }

      const rangeRaw =
        typeof configObj.range === 'string'
          ? configObj.range
          : typeof configObj['范围'] === 'string'
            ? configObj['范围']
            : '';
      const matchedRange = rangeRaw ? matchShotRatioRange(rangeRaw, bodyRangeOptions) : null;
      if (!matchedRange) return;
      const ratioMin =
        typeof configObj.ratioMin === 'number' || typeof configObj.ratioMin === 'string'
          ? String(configObj.ratioMin)
          : typeof configObj['比例min'] === 'number' || typeof configObj['比例min'] === 'string'
            ? String(configObj['比例min'])
            : '';
      const ratioMax =
        typeof configObj.ratioMax === 'number' || typeof configObj.ratioMax === 'string'
          ? String(configObj.ratioMax)
          : typeof configObj['比例max'] === 'number' || typeof configObj['比例max'] === 'string'
            ? String(configObj['比例max'])
            : '';
      next[matchedRow.value][matchedRange.value] = coerceShotRatioCellToSingleValue(
        formatShotRatioCellFromBounds(ratioMin, ratioMax)
      );
    });
    return next;
  }

  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;

  for (const sceneOption of createShotRatioScenes(shotTypeOptions)) {
    const rowValue =
      obj[sceneOption.value] ??
      obj[sceneOption.key] ??
      Object.entries(obj).find(([key]) => {
        const matched = matchShotRatioScene(key, shotTypeOptions);
        return matched?.value === sceneOption.value;
      })?.[1];
    if (!rowValue || typeof rowValue !== 'object') continue;
    const rowObj = rowValue as Record<string, unknown>;

    createShotRatioRanges(bodyRangeOptions).forEach(rangeOption => {
      const rawCell =
        rowObj[rangeOption.value] ??
        rowObj[rangeOption.key] ??
        Object.entries(rowObj).find(([key]) => {
          const matched = matchShotRatioRange(key, bodyRangeOptions);
          return matched?.value === rangeOption.value;
        })?.[1];
      if (typeof rawCell === 'string' && rawCell.trim()) {
        next[sceneOption.value][rangeOption.value] = coerceShotRatioCellToSingleValue(rawCell);
      }
    });
  }

  return next;
};

const serializeShotRatioMatrix = (
  matrix: ShotRatioMatrix,
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[]
) =>
  Object.fromEntries(
    shotTypeOptions.map(scene => [
      scene,
      Object.fromEntries(
        bodyRangeOptions.map(range => [range, coerceShotRatioCellToSingleValue(matrix[scene]?.[range] ?? '-')])
      )
    ])
  );

const buildAvailableShotTypeOptionsByBodyRange = (
  bodyRangeOptions: readonly string[],
  shotTypeOptions: readonly string[],
  shotRatioMatrix: ShotRatioMatrix,
  subjectRatioMatrix: SubjectRatioEvaluationMatrix
) =>
  Object.fromEntries(
    bodyRangeOptions.map(range => [
      range,
      shotTypeOptions.filter(scene => {
        const ratioValue = shotRatioMatrix[scene]?.[range] ?? '-';
        const subjectRatioCell = normalizeSubjectRatioEvaluationCell(subjectRatioMatrix[scene]?.[range]);
        return !isShotRatioCellEmpty(ratioValue) && Boolean(subjectRatioCell);
      })
    ])
  );

const subjectOffsetRows = [
  { key: 'B1', code: 'B1', scene: '特写' },
  { key: 'B2', code: 'B2', scene: '近景' },
  { key: 'B3', code: 'B3', scene: '中近景' },
  { key: 'B4', code: 'B4', scene: '中景' },
  { key: 'B5', code: 'B5', scene: '中远景' },
  { key: 'B6', code: 'B6', scene: '远景' }
] as const;

type SubjectOffsetRowKey = (typeof subjectOffsetRows)[number]['key'];
type SubjectOffsetItem = {
  scene: string;
  x1: string;
  x2: string;
};
type SubjectOffsetMap = Record<SubjectOffsetRowKey, SubjectOffsetItem>;

const normalizeSubjectOffsetIntegerValue = (value: unknown, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const trimmed = String(value).trim();
  if (!trimmed) return fallback;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return String(Math.round(numeric));
  }
  const firstDigits = trimmed.match(/\d+/);
  return firstDigits?.[0] ?? fallback;
};

const createDefaultSubjectOffsetMap = (): SubjectOffsetMap => ({
  B1: { scene: '特写', x1: '12', x2: '20' },
  B2: { scene: '近景', x1: '10', x2: '16' },
  B3: { scene: '中近景', x1: '8', x2: '13' },
  B4: { scene: '中景', x1: '6', x2: '10' },
  B5: { scene: '中远景', x1: '3', x2: '6' },
  B6: { scene: '远景', x1: '3', x2: '6' }
});

const cloneSubjectOffsetMap = (map: SubjectOffsetMap): SubjectOffsetMap => ({
  B1: { ...map.B1 },
  B2: { ...map.B2 },
  B3: { ...map.B3 },
  B4: { ...map.B4 },
  B5: { ...map.B5 },
  B6: { ...map.B6 }
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
        x1: normalizeSubjectOffsetIntegerValue(configObj['X1'], next[matchedRow.key].x1),
        x2: normalizeSubjectOffsetIntegerValue(configObj['X2'], next[matchedRow.key].x2)
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
        x1: normalizeSubjectOffsetIntegerValue(rowObj['X1'], next[row.key].x1),
        x2: normalizeSubjectOffsetIntegerValue(rowObj['X2'], next[row.key].x2)
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
        x1: normalizeSubjectOffsetIntegerValue(goodNumbers[1], next[row.key].x1),
        x2: normalizeSubjectOffsetIntegerValue(normalNumbers[1], next[row.key].x2)
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
            x1: normalizeSubjectOffsetIntegerValue(sceneRowObj['X1'], next[row.key].x1),
            x2: normalizeSubjectOffsetIntegerValue(sceneRowObj['X2'], next[row.key].x2)
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
      X1: Number(normalizeSubjectOffsetIntegerValue(map[row.key].x1, '0')),
      X2: Number(normalizeSubjectOffsetIntegerValue(map[row.key].x2, '0'))
    }
  }));

const formatSubjectOffsetRangeLabel = (
  item: SubjectOffsetItem,
  level: 'good' | 'normal' | 'bad'
) => {
  if (level === 'good') return `[0%,${item.x1}%]`;
  if (level === 'normal') return `(${item.x1}%,${item.x2}%]`;
  return `(${item.x2}%,100%]`;
};

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

type GuideLineConfig = {
  useGuideLinePro: boolean;
  showOtherLinesWhenPro: boolean;
};

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

const defaultGuideLineConfig = (): GuideLineConfig => ({
  useGuideLinePro: false,
  showOtherLinesWhenPro: false
});

const parseGuideLineConfig = (value: unknown): GuideLineConfig | null => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }
  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;

  const useGuideLinePro =
    typeof obj.useGuideLinePro === 'boolean'
      ? obj.useGuideLinePro
      : typeof obj.guideLineProEnabled === 'boolean'
        ? obj.guideLineProEnabled
        : false;

  const showOtherLinesWhenPro =
    typeof obj.showOtherLinesWhenPro === 'boolean'
      ? obj.showOtherLinesWhenPro
      : typeof obj.showOtherGuideLines === 'boolean'
        ? obj.showOtherGuideLines
        : typeof obj.showOtherLines === 'boolean'
          ? obj.showOtherLines
          : false;

  return {
    useGuideLinePro,
    showOtherLinesWhenPro: useGuideLinePro ? showOtherLinesWhenPro : false
  };
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
  const [bodyRangeLoaded, setBodyRangeLoaded] = useState(false);
  const [bodyRangeExists, setBodyRangeExists] = useState(false);
  const [bodyRangeLoading, setBodyRangeLoading] = useState(false);
  const [bodyRangeSaving, setBodyRangeSaving] = useState(false);
  const [bodyRangeError, setBodyRangeError] = useState('');
  const [bodyRangeCustomItems, setBodyRangeCustomItems] = useState<BodyRangeConfigItem[]>([]);
  const [bodyRangeCodeInput, setBodyRangeCodeInput] = useState('');
  const [bodyRangeNameInput, setBodyRangeNameInput] = useState('');
  const [editingBodyRangeValue, setEditingBodyRangeValue] = useState<string | null>(null);
  const [shotTypeLoaded, setShotTypeLoaded] = useState(false);
  const [shotTypeExists, setShotTypeExists] = useState(false);
  const [shotTypeLoading, setShotTypeLoading] = useState(false);
  const [shotTypeSaving, setShotTypeSaving] = useState(false);
  const [shotTypeError, setShotTypeError] = useState('');
  const [shotTypeCustomItems, setShotTypeCustomItems] = useState<ShotTypeConfigItem[]>([]);
  const [shotTypeCodeInput, setShotTypeCodeInput] = useState('');
  const [shotTypeNameInput, setShotTypeNameInput] = useState('');
  const [editingShotTypeValue, setEditingShotTypeValue] = useState<string | null>(null);
  const [isShotRatioExpanded, setIsShotRatioExpanded] = useState(false);
  const [shotRatioLoaded, setShotRatioLoaded] = useState(false);
  const [shotRatioExists, setShotRatioExists] = useState(false);
  const [shotRatioLoading, setShotRatioLoading] = useState(false);
  const [shotRatioSaving, setShotRatioSaving] = useState(false);
  const [shotRatioError, setShotRatioError] = useState('');
  const [isShotRatioEditing, setIsShotRatioEditing] = useState(false);
  const [shotRatioList, setShotRatioList] = useState<ShotRatioMatrix>({});
  const [shotRatioDraft, setShotRatioDraft] = useState<ShotRatioMatrix>({});
  const [isSubjectRatioExpanded, setIsSubjectRatioExpanded] = useState(false);
  const [subjectRatioLoaded, setSubjectRatioLoaded] = useState(false);
  const [subjectRatioExists, setSubjectRatioExists] = useState(false);
  const [subjectRatioLoading, setSubjectRatioLoading] = useState(false);
  const [subjectRatioSaving, setSubjectRatioSaving] = useState(false);
  const [subjectRatioError, setSubjectRatioError] = useState('');
  const [isSubjectRatioEditing, setIsSubjectRatioEditing] = useState(false);
  const [subjectRatioMatrix, setSubjectRatioMatrix] = useState<SubjectRatioEvaluationMatrix>({});
  const [subjectRatioDraft, setSubjectRatioDraft] = useState<SubjectRatioEvaluationMatrix>({});
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
  const [isGuideLineExpanded, setIsGuideLineExpanded] = useState(false);
  const [guideLineLoaded, setGuideLineLoaded] = useState(false);
  const [guideLineExists, setGuideLineExists] = useState(false);
  const [guideLineLoading, setGuideLineLoading] = useState(false);
  const [guideLineSaving, setGuideLineSaving] = useState(false);
  const [guideLineError, setGuideLineError] = useState('');
  const [guideLineConfig, setGuideLineConfig] = useState<GuideLineConfig>(defaultGuideLineConfig);
  const [guideLineDraft, setGuideLineDraft] = useState<GuideLineConfig>(defaultGuideLineConfig);
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
  const bodyRangeOptions = buildBodyRangeOptions(bodyRangeCustomItems);
  const shotTypeOptions = buildShotTypeOptions(shotTypeCustomItems);
  const bodyRangeValues = bodyRangeOptions.map(item => item.value);
  const shotTypeValues = shotTypeOptions.map(item => item.value);
  const bodyRangeKey = bodyRangeValues.join('|');
  const shotTypeKey = shotTypeValues.join('|');
  const availableShotTypeOptionsByBodyRange = buildAvailableShotTypeOptionsByBodyRange(
    bodyRangeValues,
    shotTypeValues,
    shotRatioList,
    subjectRatioMatrix
  );

  const handleUnsupported = () => {
    notify('目前当前还未支持');
  };

  const resetBodyRangeForm = () => {
    setBodyRangeCodeInput('');
    setBodyRangeNameInput('');
    setEditingBodyRangeValue(null);
  };

  const loadBodyRangeConfig = async () => {
    setBodyRangeLoading(true);
    setBodyRangeError('');
    try {
      const response = await fetch(
        `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(BODY_RANGE_CONFIG_TYPE)}&key=${encodeURIComponent(BODY_RANGE_CONFIG_KEY)}`
      );
      const text = await response.text();
      const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
      if (response.status === 404) {
        setBodyRangeCustomItems([]);
        setBodyRangeExists(false);
        setBodyRangeLoaded(true);
        return;
      }
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      setBodyRangeCustomItems(parseBodyRangeCustomItems(data?.value));
      setBodyRangeExists(true);
      setBodyRangeLoaded(true);
    } catch (error) {
      setBodyRangeError((error as Error).message || '加载身体范围配置失败');
    } finally {
      setBodyRangeLoading(false);
    }
  };

  useEffect(() => {
    void loadBodyRangeConfig();
  }, []);

  const resetShotTypeForm = () => {
    setShotTypeCodeInput('');
    setShotTypeNameInput('');
    setEditingShotTypeValue(null);
  };

  const loadShotTypeConfig = async () => {
    setShotTypeLoading(true);
    setShotTypeError('');
    try {
      const response = await fetch(
        `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(SHOT_TYPE_CONFIG_TYPE)}&key=${encodeURIComponent(SHOT_TYPE_CONFIG_KEY)}`
      );
      const text = await response.text();
      const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
      if (response.status === 404) {
        setShotTypeCustomItems([]);
        setShotTypeExists(false);
        setShotTypeLoaded(true);
        return;
      }
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      setShotTypeCustomItems(parseShotTypeCustomItems(data?.value));
      setShotTypeExists(true);
      setShotTypeLoaded(true);
    } catch (error) {
      setShotTypeError((error as Error).message || '加载景别类型配置失败');
    } finally {
      setShotTypeLoading(false);
    }
  };

  useEffect(() => {
    void loadShotTypeConfig();
  }, []);

  const readShotRatioConfig = async () => {
    const response = await fetch(
      `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(SHOT_RATIO_CONFIG_TYPE)}&key=${encodeURIComponent(SHOT_RATIO_CONFIG_KEY)}`
    );
    const text = await response.text();
    const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
    if (response.status === 404) {
      return createShotRatioMatrix(bodyRangeValues, shotTypeValues);
    }
    if (!response.ok) {
      throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
    }
    return parseShotRatioMatrix(data?.value, bodyRangeValues, shotTypeValues) || createShotRatioMatrix(bodyRangeValues, shotTypeValues);
  };

  const readSubjectRatioConfig = async () => {
    const response = await fetch(
      `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(SUBJECT_RATIO_SCORE_CONFIG_TYPE)}&key=${encodeURIComponent(SUBJECT_RATIO_SCORE_CONFIG_KEY)}`
    );
    const text = await response.text();
    const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
    if (response.status === 404) {
      return createSubjectRatioEvaluationMatrix(bodyRangeValues, shotTypeValues);
    }
    if (!response.ok) {
      throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
    }
    return (
      parseSubjectRatioEvaluationMatrix(data?.value, bodyRangeValues, shotTypeValues) ||
      createSubjectRatioEvaluationMatrix(bodyRangeValues, shotTypeValues)
    );
  };

  useEffect(() => {
    setShotRatioList(prev => normalizeShotRatioMatrix(prev, bodyRangeValues, shotTypeValues));
    setShotRatioDraft(prev => normalizeShotRatioMatrix(prev, bodyRangeValues, shotTypeValues));
    setSubjectRatioMatrix(prev => normalizeSubjectRatioEvaluationMatrix(prev, bodyRangeValues, shotTypeValues));
    setSubjectRatioDraft(prev => normalizeSubjectRatioEvaluationMatrix(prev, bodyRangeValues, shotTypeValues));
  }, [bodyRangeKey, shotTypeKey]);

  useEffect(() => {
    if (activeTab !== 'template') return;
    if (!bodyRangeLoaded && !bodyRangeLoading) {
      void loadBodyRangeConfig();
    }
    if (!shotTypeLoaded && !shotTypeLoading) {
      void loadShotTypeConfig();
    }
  }, [activeTab, bodyRangeLoaded, bodyRangeLoading, shotTypeLoaded, shotTypeLoading]);

  useEffect(() => {
    if (activeTab !== 'template' || !bodyRangeLoaded || !shotTypeLoaded) return;
    if (!shotRatioLoaded && !shotRatioLoading) {
      void loadShotRatioConfig();
    }
    if (!subjectRatioLoaded && !subjectRatioLoading) {
      void loadSubjectRatioConfig();
    }
  }, [
    activeTab,
    bodyRangeLoaded,
    shotTypeLoaded,
    shotRatioLoaded,
    shotRatioLoading,
    subjectRatioLoaded,
    subjectRatioLoading
  ]);

  const getTemplateFieldValue = (value: unknown, aliases: string[]) => {
    let source = value;
    if (typeof source === 'string') {
      source = parseJsonSafely(source);
    }
    if (!source || typeof source !== 'object') return '';
    const obj = source as Record<string, unknown>;
    const rawValue = aliases.map(alias => obj[alias]).find(item => typeof item === 'string');
    return typeof rawValue === 'string' ? normalizeOptionValue(rawValue) : '';
  };

  const readTemplateItems = async () => {
    const templatesResp = await fetch(`${CONFIG_SERVER_BASE_URL}/kvs?type=${encodeURIComponent('intent_template')}`);
    const templateText = await templatesResp.text();
    const templateData = parseJsonSafely(templateText) as { items?: Array<{ key: string; value: unknown }>; error?: string } | null;
    if (!templatesResp.ok && templatesResp.status !== 404) {
      throw new Error(
        (templateData && typeof templateData.error === 'string' && templateData.error) || `HTTP ${templatesResp.status}`
      );
    }
    return templateData?.items || [];
  };

  const findBodyRangeReferenceMessage = async (targetValue: string) => {
    const normalizedTarget = normalizeOptionValue(targetValue);

    const [shotRatioMatrix, subjectRatioConfig, templates] = await Promise.all([
      readShotRatioConfig(),
      readSubjectRatioConfig(),
      readTemplateItems()
    ]);

    const usedScene = shotTypeValues.find(scene => !isShotRatioCellEmpty(shotRatioMatrix[scene]?.[targetValue] ?? '-'));
    if (usedScene) {
      return `当前身体范围已在“${usedScene}”的景别与主体占比配置中使用，请先调整后再删除或修改。`;
    }

    const usedRatioScene = shotTypeValues.find(scene => normalizeSubjectRatioEvaluationCell(subjectRatioConfig[scene]?.[targetValue]));
    if (usedRatioScene) {
      return `当前身体范围已在“${usedRatioScene}”的主体占比评价标准中使用，请先调整后再删除或修改。`;
    }

    const templateItem = templates.find(item => getTemplateFieldValue(item.value, ['bodyRange', 'body_range']) === normalizedTarget);
    if (templateItem) {
      return `当前身体范围已被意图模版“${templateItem.key}”使用，请先调整相关模版后再删除或修改。`;
    }

    return '';
  };

  const findShotTypeReferenceMessage = async (targetValue: string) => {
    const normalizedTarget = normalizeOptionValue(targetValue);

    const [shotRatioMatrix, subjectRatioConfig, templates] = await Promise.all([
      readShotRatioConfig(),
      readSubjectRatioConfig(),
      readTemplateItems()
    ]);

    const usedRange = bodyRangeValues.find(range => !isShotRatioCellEmpty(shotRatioMatrix[targetValue]?.[range] ?? '-'));
    if (usedRange) {
      return `当前景别类型已在“${usedRange}”的景别与主体占比配置中使用，请先调整后再删除或修改。`;
    }

    const usedRatioRange = bodyRangeValues.find(range => normalizeSubjectRatioEvaluationCell(subjectRatioConfig[targetValue]?.[range]));
    if (usedRatioRange) {
      return `当前景别类型已在“${usedRatioRange}”的主体占比评价标准中使用，请先调整后再删除或修改。`;
    }

    const templateItem = templates.find(item => getTemplateFieldValue(item.value, ['shotType', 'shot_type']) === normalizedTarget);
    if (templateItem) {
      return `当前景别类型已被意图模版“${templateItem.key}”使用，请先调整相关模版后再删除或修改。`;
    }

    return '';
  };

  const saveBodyRangeCustomItems = async (nextItems: BodyRangeConfigItem[], successMessage: string) => {
    setBodyRangeSaving(true);
    setBodyRangeError('');
    try {
      if (nextItems.length === 0) {
        if (bodyRangeExists) {
          const deleteResponse = await fetch(`${CONFIG_SERVER_BASE_URL}/kv/delete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: BODY_RANGE_CONFIG_TYPE,
              key: BODY_RANGE_CONFIG_KEY
            })
          });
          const text = await deleteResponse.text();
          const data = parseJsonSafely(text) as { error?: string } | null;
          if (!deleteResponse.ok) {
            throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${deleteResponse.status}`);
          }
        }
        setBodyRangeCustomItems([]);
        setBodyRangeExists(false);
      } else {
        const response = await fetch(`${CONFIG_SERVER_BASE_URL}${bodyRangeExists ? '/kv/update' : '/kv/create'}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: BODY_RANGE_CONFIG_TYPE,
            key: BODY_RANGE_CONFIG_KEY,
            value: serializeBodyRangeCustomItems(nextItems)
          })
        });
        const text = await response.text();
        const data = parseJsonSafely(text) as { error?: string } | null;
        if (!response.ok) {
          throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
        }
        setBodyRangeCustomItems(nextItems);
        setBodyRangeExists(true);
      }
      resetBodyRangeForm();
      notify(successMessage);
    } catch (error) {
      setBodyRangeError((error as Error).message || '保存身体范围配置失败');
    } finally {
      setBodyRangeSaving(false);
    }
  };

  const handleEditBodyRange = (value: string) => {
    const parsed = splitBodyRangeValue(value);
    if (!parsed) return;
    setBodyRangeCodeInput(parsed.code);
    setBodyRangeNameInput(parsed.name);
    setEditingBodyRangeValue(value);
    setBodyRangeError('');
  };

  const handleDeleteBodyRange = async (item: BodyRangeConfigItem) => {
    const targetValue = formatBodyRangeValue(item.code, item.name);
    if (!window.confirm(`确认删除身体范围“${item.code}. ${item.name}”吗？`)) return;

    try {
      setBodyRangeError('');
      const referenceMessage = await findBodyRangeReferenceMessage(targetValue);
      if (referenceMessage) {
        setBodyRangeError(referenceMessage);
        return;
      }
      const nextItems = bodyRangeCustomItems.filter(entry => formatBodyRangeValue(entry.code, entry.name) !== targetValue);
      await saveBodyRangeCustomItems(nextItems, '身体范围配置已删除');
    } catch (error) {
      setBodyRangeError((error as Error).message || '删除身体范围失败');
    }
  };

  const handleSubmitBodyRange = async () => {
    const code = normalizeBodyRangeCode(bodyRangeCodeInput);
    const name = bodyRangeNameInput.trim();
    if (!code || !name) {
      setBodyRangeError('请先填写编号和名称');
      return;
    }
    if (!isValidBodyRangeCode(code)) {
      setBodyRangeError('编号格式不正确，请使用 A6、A10 或 A6.1 这类格式');
      return;
    }

    const nextValue = formatBodyRangeValue(code, name);
    const editingValue = editingBodyRangeValue ? normalizeOptionValue(editingBodyRangeValue) : null;
    const duplicateExists = bodyRangeOptions.some(option => option.value === nextValue && option.value !== editingValue);
    if (duplicateExists) {
      setBodyRangeError('该身体范围编号或名称已存在，请换一个');
      return;
    }

    if (editingValue && editingValue !== nextValue) {
      try {
        const referenceMessage = await findBodyRangeReferenceMessage(editingValue);
        if (referenceMessage) {
          setBodyRangeError(referenceMessage);
          return;
        }
      } catch (error) {
        setBodyRangeError((error as Error).message || '校验身体范围引用失败');
        return;
      }
    }

    const nextItems = editingValue
      ? bodyRangeCustomItems.map(item =>
          formatBodyRangeValue(item.code, item.name) === editingValue ? { code, name } : item
        )
      : [...bodyRangeCustomItems, { code, name }];

    await saveBodyRangeCustomItems(nextItems, editingValue ? '身体范围配置已更新' : '身体范围配置已新增');
  };

  const saveShotTypeCustomItems = async (nextItems: ShotTypeConfigItem[], successMessage: string) => {
    setShotTypeSaving(true);
    setShotTypeError('');
    try {
      if (nextItems.length === 0) {
        if (shotTypeExists) {
          const deleteResponse = await fetch(`${CONFIG_SERVER_BASE_URL}/kv/delete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              type: SHOT_TYPE_CONFIG_TYPE,
              key: SHOT_TYPE_CONFIG_KEY
            })
          });
          const text = await deleteResponse.text();
          const data = parseJsonSafely(text) as { error?: string } | null;
          if (!deleteResponse.ok) {
            throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${deleteResponse.status}`);
          }
        }
        setShotTypeCustomItems([]);
        setShotTypeExists(false);
      } else {
        const response = await fetch(`${CONFIG_SERVER_BASE_URL}${shotTypeExists ? '/kv/update' : '/kv/create'}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            type: SHOT_TYPE_CONFIG_TYPE,
            key: SHOT_TYPE_CONFIG_KEY,
            value: serializeShotTypeCustomItems(nextItems)
          })
        });
        const text = await response.text();
        const data = parseJsonSafely(text) as { error?: string } | null;
        if (!response.ok) {
          throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
        }
        setShotTypeCustomItems(nextItems);
        setShotTypeExists(true);
      }
      resetShotTypeForm();
      notify(successMessage);
    } catch (error) {
      setShotTypeError((error as Error).message || '保存景别类型配置失败');
    } finally {
      setShotTypeSaving(false);
    }
  };

  const handleEditShotType = (value: string) => {
    const parsed = splitShotTypeValue(value);
    if (!parsed) return;
    setShotTypeCodeInput(parsed.code);
    setShotTypeNameInput(parsed.name);
    setEditingShotTypeValue(value);
    setShotTypeError('');
  };

  const handleDeleteShotType = async (item: ShotTypeConfigItem) => {
    const targetValue = formatShotTypeValue(item.code, item.name);
    if (!window.confirm(`确认删除景别类型“${item.code}. ${item.name}”吗？`)) return;

    try {
      setShotTypeError('');
      const referenceMessage = await findShotTypeReferenceMessage(targetValue);
      if (referenceMessage) {
        setShotTypeError(referenceMessage);
        return;
      }
      const nextItems = shotTypeCustomItems.filter(entry => formatShotTypeValue(entry.code, entry.name) !== targetValue);
      await saveShotTypeCustomItems(nextItems, '景别类型配置已删除');
    } catch (error) {
      setShotTypeError((error as Error).message || '删除景别类型失败');
    }
  };

  const handleSubmitShotType = async () => {
    const code = normalizeShotTypeCode(shotTypeCodeInput);
    const name = shotTypeNameInput.trim();
    if (!code || !name) {
      setShotTypeError('请先填写编号和名称');
      return;
    }
    if (!isValidShotTypeCode(code)) {
      setShotTypeError('编号格式不正确，请使用 B6、B10 或 B6.1 这类格式');
      return;
    }

    const nextValue = formatShotTypeValue(code, name);
    const editingValue = editingShotTypeValue ? normalizeOptionValue(editingShotTypeValue) : null;
    const duplicateExists = shotTypeOptions.some(option => option.value === nextValue && option.value !== editingValue);
    if (duplicateExists) {
      setShotTypeError('该景别类型编号或名称已存在，请换一个');
      return;
    }

    if (editingValue && editingValue !== nextValue) {
      try {
        const referenceMessage = await findShotTypeReferenceMessage(editingValue);
        if (referenceMessage) {
          setShotTypeError(referenceMessage);
          return;
        }
      } catch (error) {
        setShotTypeError((error as Error).message || '校验景别类型引用失败');
        return;
      }
    }

    const nextItems = editingValue
      ? shotTypeCustomItems.map(item =>
          formatShotTypeValue(item.code, item.name) === editingValue ? { code, name } : item
        )
      : [...shotTypeCustomItems, { code, name }];

    await saveShotTypeCustomItems(nextItems, editingValue ? '景别类型配置已更新' : '景别类型配置已新增');
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
        const next = createShotRatioMatrix(bodyRangeValues, shotTypeValues);
        setShotRatioList(next);
        setShotRatioDraft(cloneShotRatioMatrix(next));
        setShotRatioExists(false);
        setShotRatioLoaded(true);
        return;
      }
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      const next =
        parseShotRatioMatrix(data?.value, bodyRangeValues, shotTypeValues) ||
        createShotRatioMatrix(bodyRangeValues, shotTypeValues);
      setShotRatioList(next);
      setShotRatioDraft(cloneShotRatioMatrix(next));
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

  const updateShotRatioDraftCell = (scene: string, range: string, value: string) => {
    setShotRatioDraft(prev => ({
      ...prev,
      [scene]: {
        ...(prev[scene] || {}),
        [range]: value
      }
    }));
  };

  const handleSaveShotRatio = async () => {
    try {
      for (const scene of shotTypeValues) {
        for (const range of bodyRangeValues) {
          const cellValue = normalizeShotRatioCellValue(shotRatioDraft[scene]?.[range] ?? '-');
          if (cellValue === '-') continue;
          const ratioValue = Number(cellValue);
          if (!Number.isFinite(ratioValue)) {
            throw new Error(`${scene} / ${range} 的主体占比必须是 0 到 100 的数字`);
          }
          if (ratioValue < 0 || ratioValue > 100) {
            throw new Error(`${scene} / ${range} 的主体占比必须在 0 到 100 之间`);
          }
        }
      }

      setShotRatioSaving(true);
      setShotRatioError('');

      const payload = {
        type: SHOT_RATIO_CONFIG_TYPE,
        key: SHOT_RATIO_CONFIG_KEY,
        value: serializeShotRatioMatrix(shotRatioDraft, bodyRangeValues, shotTypeValues)
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
      const next = cloneShotRatioMatrix(shotRatioDraft);
      setShotRatioList(next);
      setShotRatioDraft(cloneShotRatioMatrix(next));
      setShotRatioExists(true);
      setIsShotRatioEditing(false);
      notify('景别与主体占比已保存');
    } catch (error) {
      setShotRatioError((error as Error).message || '保存景别与主体占比失败');
    } finally {
      setShotRatioSaving(false);
    }
  };

  const loadSubjectRatioConfig = async () => {
    setSubjectRatioLoading(true);
    setSubjectRatioError('');
    try {
      const response = await fetch(
        `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(SUBJECT_RATIO_SCORE_CONFIG_TYPE)}&key=${encodeURIComponent(SUBJECT_RATIO_SCORE_CONFIG_KEY)}`
      );
      const text = await response.text();
      const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
      if (response.status === 404) {
        const next = createSubjectRatioEvaluationMatrix(bodyRangeValues, shotTypeValues);
        setSubjectRatioMatrix(next);
        setSubjectRatioDraft(cloneSubjectRatioEvaluationMatrix(next));
        setSubjectRatioExists(false);
        setSubjectRatioLoaded(true);
        return;
      }
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      const next =
        parseSubjectRatioEvaluationMatrix(data?.value, bodyRangeValues, shotTypeValues) ||
        createSubjectRatioEvaluationMatrix(bodyRangeValues, shotTypeValues);
      setSubjectRatioMatrix(next);
      setSubjectRatioDraft(cloneSubjectRatioEvaluationMatrix(next));
      setSubjectRatioExists(true);
      setSubjectRatioLoaded(true);
    } catch (error) {
      setSubjectRatioError((error as Error).message || '加载主体占比评价标准失败');
    } finally {
      setSubjectRatioLoading(false);
    }
  };

  const toggleSubjectRatioSection = async () => {
    const nextExpanded = !isSubjectRatioExpanded;
    setIsSubjectRatioExpanded(nextExpanded);
    if (nextExpanded && !subjectRatioLoaded && !subjectRatioLoading) {
      await loadSubjectRatioConfig();
    }
  };

  const updateSubjectRatioDraftCell = (
    scene: string,
    range: string,
    patch: Partial<SubjectRatioEvaluationCell>
  ) => {
    setSubjectRatioDraft(prev => ({
      ...prev,
      [scene]: {
        ...(prev[scene] || {}),
        [range]: normalizeSubjectRatioEvaluationCell({
          min:
            patch.min !== undefined
              ? normalizeSubjectRatioIntegerValue(patch.min, '')
              : prev[scene]?.[range]?.min ?? subjectRatioMatrix[scene]?.[range]?.min ?? '',
          max:
            patch.max !== undefined
              ? normalizeSubjectRatioIntegerValue(patch.max, '')
              : prev[scene]?.[range]?.max ?? subjectRatioMatrix[scene]?.[range]?.max ?? ''
        })
      }
    }));
  };

  const handleSaveSubjectRatio = async () => {
    try {
      for (const scene of shotTypeValues) {
        for (const range of bodyRangeValues) {
          const cell = normalizeSubjectRatioEvaluationCell(subjectRatioDraft[scene]?.[range]);
          if (!cell) continue;
          const min = Number(cell.min);
          const max = Number(cell.max);
          if (!Number.isInteger(min) || !Number.isInteger(max)) {
            throw new Error(`${scene} / ${range} 的两个区间值必须是 0 到 100 的整数`);
          }
          if (min < 0 || max > 100) {
            throw new Error(`${scene} / ${range} 的区间值必须在 0 到 100 的整数范围内`);
          }
          if (min >= max) {
            throw new Error(`${scene} / ${range} 需要满足前开后闭区间的左值小于右值`);
          }
        }
      }

      setSubjectRatioSaving(true);
      setSubjectRatioError('');

      const payload = {
        type: SUBJECT_RATIO_SCORE_CONFIG_TYPE,
        key: SUBJECT_RATIO_SCORE_CONFIG_KEY,
        value: serializeSubjectRatioEvaluationMatrix(subjectRatioDraft, bodyRangeValues, shotTypeValues)
      };
      const path = subjectRatioExists ? '/kv/update' : '/kv/create';
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
      const next = cloneSubjectRatioEvaluationMatrix(subjectRatioDraft);
      setSubjectRatioMatrix(next);
      setSubjectRatioDraft(cloneSubjectRatioEvaluationMatrix(next));
      setSubjectRatioExists(true);
      setIsSubjectRatioEditing(false);
      notify('主体占比评价标准已保存');
    } catch (error) {
      setSubjectRatioError((error as Error).message || '保存主体占比评价标准失败');
    } finally {
      setSubjectRatioSaving(false);
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
        ...Object.fromEntries(
          Object.entries(patch).map(([key, value]) => {
            if (key === 'x1' || key === 'x2') {
              return [key, normalizeSubjectOffsetIntegerValue(value, '')];
            }
            return [key, value];
          })
        )
      }
    }));
  };

  const handleSaveSubjectOffset = async () => {
    setSubjectOffsetError('');
    for (const row of subjectOffsetRows) {
      const item = subjectOffsetDraft[row.key];
      const rowTitle = `${row.code}${row.scene}`;
      if (item.x1.trim() === '' || item.x2.trim() === '') {
        setSubjectOffsetError(`${rowTitle} 的两个分界点不能为空`);
        return;
      }
      const x1 = Number(item.x1);
      const x2 = Number(item.x2);
      if (!Number.isInteger(x1) || !Number.isInteger(x2)) {
        setSubjectOffsetError(`${rowTitle} 的两个分界点必须是整数`);
        return;
      }
      if (x1 < 0 || x2 > 100 || x1 >= x2) {
        setSubjectOffsetError(`${rowTitle} 需要满足 x1 < x2，且两个分界点都在 0 到 100 的整数范围内`);
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

  const loadGuideLineConfig = async () => {
    setGuideLineLoading(true);
    setGuideLineError('');
    try {
      const response = await fetch(
        `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(GUIDE_LINE_CONFIG_TYPE)}&key=${encodeURIComponent(GUIDE_LINE_CONFIG_KEY)}`
      );
      const text = await response.text();
      const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
      if (response.status === 404) {
        const next = defaultGuideLineConfig();
        setGuideLineConfig(next);
        setGuideLineDraft({ ...next });
        setGuideLineExists(false);
        setGuideLineLoaded(true);
        return;
      }
      if (!response.ok) {
        throw new Error((data && typeof data.error === 'string' && data.error) || `HTTP ${response.status}`);
      }
      const next = parseGuideLineConfig(data?.value) || defaultGuideLineConfig();
      setGuideLineConfig(next);
      setGuideLineDraft({ ...next });
      setGuideLineExists(true);
      setGuideLineLoaded(true);
    } catch (error) {
      setGuideLineError((error as Error).message || '加载引导线配置失败');
    } finally {
      setGuideLineLoading(false);
    }
  };

  const toggleGuideLineSection = async () => {
    const nextExpanded = !isGuideLineExpanded;
    setIsGuideLineExpanded(nextExpanded);
    if (nextExpanded && !guideLineLoaded && !guideLineLoading) {
      await loadGuideLineConfig();
    }
  };

  const handleSaveGuideLineConfig = async () => {
    setGuideLineSaving(true);
    setGuideLineError('');
    try {
      const normalizedDraft: GuideLineConfig = {
        useGuideLinePro: guideLineDraft.useGuideLinePro,
        showOtherLinesWhenPro: guideLineDraft.useGuideLinePro ? guideLineDraft.showOtherLinesWhenPro : false
      };
      const payload = {
        type: GUIDE_LINE_CONFIG_TYPE,
        key: GUIDE_LINE_CONFIG_KEY,
        value: normalizedDraft
      };
      const path = guideLineExists ? '/kv/update' : '/kv/create';
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
      setGuideLineConfig(normalizedDraft);
      setGuideLineDraft({ ...normalizedDraft });
      setGuideLineExists(true);
      notify('引导线配置已保存');
    } catch (error) {
      setGuideLineError((error as Error).message || '保存引导线配置失败');
    } finally {
      setGuideLineSaving(false);
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
    `flex min-h-[52px] flex-1 items-center justify-center rounded-xl border px-3 py-3 text-center transition sm:min-h-[56px] ${
      active
        ? 'border-blue-500 bg-slate-700 text-white'
        : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
    }`;

  return (
    <div className="min-h-screen bg-slate-900 px-4 pb-8 pt-4 sm:px-6 lg:pb-10 lg:pt-6">
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
        <h1 className="text-center text-[1.75rem] font-bold tracking-[0.08em] text-white sm:text-[1.9rem]">Meya</h1>

        <div className="rounded-xl bg-slate-800 p-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('basic')}
              className={tabClassName(activeTab === 'basic')}
            >
              <span className="text-[15px] font-semibold leading-none sm:text-base">基础配置</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('template')}
              className={tabClassName(activeTab === 'template')}
            >
              <span className="text-[15px] font-semibold leading-none sm:text-base">意图模版</span>
            </button>
            <button
              type="button"
              onClick={handleUnsupported}
              className={tabClassName(false)}
            >
              <span className="text-[15px] font-semibold leading-none sm:text-base">分析结果</span>
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
                                      {param.key === 'A' || param.key === 'B' ? (
                                        <div className="space-y-4">
                                          {(param.key === 'A' ? bodyRangeError : shotTypeError) && (
                                            <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                                              {param.key === 'A' ? bodyRangeError : shotTypeError}
                                            </div>
                                          )}

                                          {(param.key === 'A' ? bodyRangeLoading && !bodyRangeLoaded : shotTypeLoading && !shotTypeLoaded) ? (
                                            <div className="rounded-xl bg-slate-800 px-4 py-6 text-slate-400">加载中...</div>
                                          ) : (
                                            <>
                                              <div className="space-y-2">
                                                {(param.key === 'A' ? bodyRangeOptions : shotTypeOptions).map(option => (
                                                  <div
                                                    key={option.value}
                                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-800 px-4 py-3"
                                                  >
                                                    <div className="min-w-0 text-base font-medium text-slate-100">
                                                      {option.code}. {option.name}
                                                    </div>
                                                    {option.locked ? (
                                                      <span className="rounded-full border border-slate-600 px-2.5 py-1 text-xs text-slate-400">
                                                        默认项
                                                      </span>
                                                    ) : (
                                                      <div className="flex items-center gap-2">
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            param.key === 'A'
                                                              ? handleEditBodyRange(option.value)
                                                              : handleEditShotType(option.value)
                                                          }
                                                          disabled={param.key === 'A' ? bodyRangeSaving : shotTypeSaving}
                                                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                                          aria-label={`修改 ${option.code}. ${option.name}`}
                                                          title="修改"
                                                        >
                                                          <Pencil className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                          type="button"
                                                          onClick={() =>
                                                            void (param.key === 'A'
                                                              ? handleDeleteBodyRange({ code: option.code, name: option.name })
                                                              : handleDeleteShotType({ code: option.code, name: option.name }))
                                                          }
                                                          disabled={param.key === 'A' ? bodyRangeSaving : shotTypeSaving}
                                                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                                          aria-label={`删除 ${option.code}. ${option.name}`}
                                                          title="删除"
                                                        >
                                                          <Trash2 className="h-4 w-4" />
                                                        </button>
                                                      </div>
                                                    )}
                                                  </div>
                                                ))}
                                              </div>

                                              <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-3 sm:p-4">
                                                <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr_auto]">
                                                  <input
                                                    type="text"
                                                    value={param.key === 'A' ? bodyRangeCodeInput : shotTypeCodeInput}
                                                    onChange={event =>
                                                      param.key === 'A'
                                                        ? setBodyRangeCodeInput(event.target.value)
                                                        : setShotTypeCodeInput(event.target.value)
                                                    }
                                                    placeholder={param.key === 'A' ? '编号，例如 A6' : '编号，例如 B6'}
                                                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                                                  />
                                                  <input
                                                    type="text"
                                                    value={param.key === 'A' ? bodyRangeNameInput : shotTypeNameInput}
                                                    onChange={event =>
                                                      param.key === 'A'
                                                        ? setBodyRangeNameInput(event.target.value)
                                                        : setShotTypeNameInput(event.target.value)
                                                    }
                                                    placeholder="名称"
                                                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                                                  />
                                                  <div className="flex items-center justify-end gap-2">
                                                    <button
                                                      type="button"
                                                      onClick={() => void (param.key === 'A' ? handleSubmitBodyRange() : handleSubmitShotType())}
                                                      disabled={param.key === 'A' ? bodyRangeSaving : shotTypeSaving}
                                                      className="inline-flex h-[52px] min-w-[88px] items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                                                      title="保存"
                                                    >
                                                      <span>保存</span>
                                                    </button>
                                                    {(param.key === 'A' ? editingBodyRangeValue : editingShotTypeValue) && (
                                                      <button
                                                        type="button"
                                                        onClick={param.key === 'A' ? resetBodyRangeForm : resetShotTypeForm}
                                                        disabled={param.key === 'A' ? bodyRangeSaving : shotTypeSaving}
                                                        className="inline-flex h-[52px] min-w-[52px] items-center justify-center rounded-xl border border-slate-600 bg-slate-900 px-4 text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                        title="取消修改"
                                                      >
                                                        <X className="h-5 w-5" />
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="mt-3 text-xs text-slate-400">
                                                  默认 5 项不可删除或修改，新增项支持修改和删除。
                                                </div>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      ) : (
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
                                      )}
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

                  if (section === '五、引导线配置') {
                    const activeGuideLineConfig = guideLineDraft;
                    return (
                      <div key={section} className="rounded-xl border border-slate-700 bg-slate-800">
                        <button
                          type="button"
                          onClick={toggleGuideLineSection}
                          className="flex w-full items-center justify-between px-4 py-4 text-left text-white transition hover:bg-slate-700 sm:px-5"
                        >
                          <span className="text-base font-medium leading-tight sm:text-lg">
                            {section}
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 flex-none text-slate-400 transition ${
                              isGuideLineExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {isGuideLineExpanded && (
                          <div className="border-t border-slate-700 p-3 sm:p-4">
                            <div className="text-sm text-slate-400">
                              这里仅保留两个引导线显示开关，不再展示旧的任务 ID、超时、上报间隔、接口地址和鉴权参数。
                            </div>

                            {guideLineError && (
                              <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {guideLineError}
                              </div>
                            )}

                            {guideLineLoading ? (
                              <div className="mt-4 text-sm text-slate-400">加载中...</div>
                            ) : (
                              <div className="mt-4 space-y-4">
                                <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                      <div className="text-base font-semibold text-white">是否使用引导线 pro</div>
                                      <div className="mt-1 text-sm text-slate-400">
                                        开启后使用引导线 pro 展示方案。
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      <label className="flex items-center gap-2 text-base text-slate-100">
                                        <input
                                          type="radio"
                                          checked={activeGuideLineConfig.useGuideLinePro}
                                          onChange={() =>
                                            setGuideLineDraft(prev => ({ ...prev, useGuideLinePro: true }))
                                          }
                                        />
                                        <span>是</span>
                                      </label>
                                      <label className="flex items-center gap-2 text-base text-slate-100">
                                        <input
                                          type="radio"
                                          checked={!activeGuideLineConfig.useGuideLinePro}
                                          onChange={() =>
                                            setGuideLineDraft(prev => ({
                                              ...prev,
                                              useGuideLinePro: false,
                                              showOtherLinesWhenPro: false
                                            }))
                                          }
                                        />
                                        <span>否</span>
                                      </label>
                                    </div>
                                  </div>
                                </div>

                                {activeGuideLineConfig.useGuideLinePro && (
                                  <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="min-w-0">
                                        <div className="text-base font-semibold text-white">展示其他线条</div>
                                        <div className="mt-1 text-sm text-slate-400">
                                          仅在启用引导线 pro 时生效，用于控制是否同时显示其他辅助线条。
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 text-base text-slate-100">
                                          <input
                                            type="radio"
                                            checked={activeGuideLineConfig.showOtherLinesWhenPro}
                                            onChange={() =>
                                              setGuideLineDraft(prev => ({ ...prev, showOtherLinesWhenPro: true }))
                                            }
                                          />
                                          <span>是</span>
                                        </label>
                                        <label className="flex items-center gap-2 text-base text-slate-100">
                                          <input
                                            type="radio"
                                            checked={!activeGuideLineConfig.showOtherLinesWhenPro}
                                            onChange={() =>
                                              setGuideLineDraft(prev => ({ ...prev, showOtherLinesWhenPro: false }))
                                            }
                                          />
                                          <span>否</span>
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setGuideLineDraft({ ...guideLineConfig })}
                                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700"
                                  >
                                    重置
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveGuideLineConfig}
                                    disabled={guideLineSaving}
                                    className="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {guideLineSaving ? '保存中...' : '保存'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
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
                            <div className="min-w-0">
                              <div className="text-sm text-slate-400">
                                行来自景别类型（B），列来自身体范围（A），单元格只填写 0 到 100 的数字，展示时自动补 %
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
                                <table className="min-w-[760px] w-full border-collapse text-sm text-slate-200">
                                  <thead>
                                    <tr className="bg-slate-900">
                                      <th
                                        className="min-w-[120px] border border-slate-700 px-3 py-3 text-center text-base font-medium align-middle"
                                      >
                                        主体占比
                                      </th>
                                      {bodyRangeOptions.map(option => (
                                        <th
                                          key={option.value}
                                          className="min-w-[104px] border border-slate-700 px-3 py-3 text-center align-middle"
                                        >
                                          <div className="flex min-h-[72px] flex-col items-center justify-center gap-2">
                                            <span className="text-base font-semibold text-white">{option.code}</span>
                                            <span className="whitespace-nowrap text-sm font-medium text-slate-300">
                                              {option.name}
                                            </span>
                                          </div>
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shotTypeOptions.map(sceneOption => {
                                      return (
                                        <tr key={sceneOption.value} className="bg-slate-800/70">
                                          <td className="whitespace-nowrap border border-slate-700 px-3 py-4 text-center text-lg font-medium text-white">
                                            {sceneOption.value}
                                          </td>
                                          {bodyRangeOptions.map(rangeOption => {
                                            const draftValue = shotRatioDraft[sceneOption.value]?.[rangeOption.value] ?? '-';
                                            const savedValue = shotRatioList[sceneOption.value]?.[rangeOption.value] ?? '-';
                                            return (
                                              <td
                                                key={`${sceneOption.value}-${rangeOption.value}`}
                                                className="border border-slate-700 px-2 py-3 text-center align-middle"
                                              >
                                                {isShotRatioEditing ? (
                                                  <div className="relative mx-auto w-full max-w-[92px]">
                                                    <input
                                                      type="number"
                                                      min="0"
                                                      max="100"
                                                      step="0.01"
                                                      value={draftValue === '-' ? '' : draftValue}
                                                      onChange={event =>
                                                        updateShotRatioDraftCell(
                                                          sceneOption.value,
                                                          rangeOption.value,
                                                          event.target.value
                                                        )
                                                      }
                                                      placeholder="-"
                                                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 pr-7 text-center text-base text-white outline-none transition placeholder:text-slate-500 focus:border-blue-400"
                                                    />
                                                    <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                                                      %
                                                    </span>
                                                  </div>
                                                ) : (
                                                  <span className="text-lg text-slate-100">{formatShotRatioDisplayValue(savedValue)}</span>
                                                )}
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            <div className="mt-4 flex justify-end gap-2">
                              {isShotRatioEditing ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShotRatioDraft(cloneShotRatioMatrix(shotRatioList));
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
                                    setShotRatioDraft(cloneShotRatioMatrix(shotRatioList));
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
                        )}
                      </div>
                    );
                  }

                  if (section === '三、主体占比评价标准') {
                    return (
                      <div key={section} className="rounded-xl border border-slate-700 bg-slate-800">
                        <button
                          type="button"
                          onClick={toggleSubjectRatioSection}
                          className="flex w-full items-center justify-between px-4 py-4 text-left text-white transition hover:bg-slate-700 sm:px-5"
                        >
                          <span className="text-base font-medium leading-tight sm:text-lg">
                            {section}
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 flex-none text-slate-400 transition ${
                              isSubjectRatioExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {isSubjectRatioExpanded && (
                          <div className="border-t border-slate-700 p-3 sm:p-4">
                            <div className="min-w-0">
                              <div className="text-sm text-slate-400">
                                行来自景别类型（B），列来自身体范围（A），默认按前开后闭区间 `(x%,y%]` 展示，编辑时只需填写两个整数
                              </div>
                            </div>

                            {subjectRatioError && (
                              <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {subjectRatioError}
                              </div>
                            )}

                            {subjectRatioLoading ? (
                              <div className="mt-4 text-sm text-slate-400">加载中...</div>
                            ) : (
                              <div className="mt-4 overflow-x-auto">
                                <div className="inline-block w-max min-w-max align-top rounded-xl border border-slate-700 sm:block sm:min-w-full sm:w-full">
                                <table className="w-max min-w-max border-collapse text-sm text-slate-200 sm:w-full sm:min-w-full">
                                  <thead>
                                    <tr className="bg-slate-900">
                                      <th className="min-w-[108px] whitespace-nowrap border border-slate-700 px-2 py-3 text-center align-middle sm:min-w-[120px] sm:px-3">
                                        <div className="flex min-h-[60px] flex-col items-center justify-center gap-1 sm:min-h-[72px] sm:gap-2">
                                          <span className="text-sm font-semibold text-white sm:text-base">主体占比</span>
                                          <span className="text-xs font-medium text-slate-300 sm:text-sm">范围</span>
                                        </div>
                                      </th>
                                      {bodyRangeOptions.map(option => (
                                        <th
                                          key={`subject-ratio-${option.value}`}
                                          className="min-w-[108px] whitespace-nowrap border border-slate-700 px-2 py-3 text-center align-middle sm:min-w-[124px] sm:px-3"
                                        >
                                          <div className="flex min-h-[60px] flex-col items-center justify-center gap-1 sm:min-h-[72px] sm:gap-2">
                                            <span className="text-sm font-semibold text-white sm:text-base">{option.code}</span>
                                            <span className="whitespace-nowrap text-xs font-medium text-slate-300 sm:text-sm">
                                              {option.name}
                                            </span>
                                          </div>
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shotTypeOptions.map(sceneOption => (
                                      <tr key={`subject-ratio-row-${sceneOption.value}`} className="bg-slate-800/70">
                                        <td className="whitespace-nowrap border border-slate-700 px-2 py-4 text-center text-base font-medium text-white sm:px-3 sm:text-lg">
                                          {sceneOption.value}
                                        </td>
                                        {bodyRangeOptions.map(rangeOption => {
                                          const draftCell = subjectRatioDraft[sceneOption.value]?.[rangeOption.value] ?? null;
                                          const savedCell = subjectRatioMatrix[sceneOption.value]?.[rangeOption.value] ?? null;
                                          const editingCell = draftCell ?? savedCell;
                                          return (
                                            <td
                                              key={`subject-ratio-${sceneOption.value}-${rangeOption.value}`}
                                              className="whitespace-nowrap border border-slate-700 px-1.5 py-3 text-center align-middle sm:px-2"
                                            >
                                              {isSubjectRatioEditing ? (
                                                <div className="mx-auto flex max-w-[184px] items-center justify-center gap-0 text-[14px] text-slate-300 sm:max-w-[216px] sm:gap-1 sm:text-base">
                                                  <span>(</span>
                                                  <div className="relative w-[50px] sm:w-[64px]">
                                                    <input
                                                      type="text"
                                                      inputMode="numeric"
                                                      pattern="[0-9]*"
                                                      value={editingCell?.min ?? ''}
                                                      onChange={event =>
                                                        updateSubjectRatioDraftCell(sceneOption.value, rangeOption.value, {
                                                          min: event.target.value
                                                        })
                                                      }
                                                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-1.5 py-1.5 pr-4 text-center text-base font-medium text-white outline-none transition focus:border-blue-400 sm:px-2 sm:py-2 sm:pr-5 sm:text-[1.1rem]"
                                                    />
                                                    <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                                      %
                                                    </span>
                                                  </div>
                                                  <span>,</span>
                                                  <div className="relative w-[50px] sm:w-[64px]">
                                                    <input
                                                      type="text"
                                                      inputMode="numeric"
                                                      pattern="[0-9]*"
                                                      value={editingCell?.max ?? ''}
                                                      onChange={event =>
                                                        updateSubjectRatioDraftCell(sceneOption.value, rangeOption.value, {
                                                          max: event.target.value
                                                        })
                                                      }
                                                      className="w-full rounded-lg border border-slate-600 bg-slate-900 px-1.5 py-1.5 pr-4 text-center text-base font-medium text-white outline-none transition focus:border-blue-400 sm:px-2 sm:py-2 sm:pr-5 sm:text-[1.1rem]"
                                                    />
                                                    <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                                      %
                                                    </span>
                                                  </div>
                                                  <span>]</span>
                                                </div>
                                              ) : (
                                                <span className="whitespace-nowrap text-base text-slate-100 sm:text-lg">
                                                  {formatSubjectRatioEvaluationDisplayValue(savedCell)}
                                                </span>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                </div>
                              </div>
                            )}

                            <div className="mt-4 flex justify-end gap-2">
                              {isSubjectRatioEditing ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubjectRatioDraft(cloneSubjectRatioEvaluationMatrix(subjectRatioMatrix));
                                      setIsSubjectRatioEditing(false);
                                      setSubjectRatioError('');
                                    }}
                                    className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700"
                                  >
                                    取消
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveSubjectRatio}
                                    disabled={subjectRatioSaving}
                                    className="rounded-lg bg-blue-500 px-3 py-2 text-sm text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {subjectRatioSaving ? '保存中...' : '保存'}
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSubjectRatioDraft(cloneSubjectRatioEvaluationMatrix(subjectRatioMatrix));
                                    setIsSubjectRatioEditing(true);
                                  }}
                                  disabled={subjectRatioLoading}
                                  className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  编辑
                                </button>
                              )}
                            </div>
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
                            <div className="min-w-0">
                              <div className="text-sm text-slate-400">
                                主体偏离度主要描述头部锚点到最佳构图点的距离，占整个画面对角线长度的百分比。页面按好、一般、差三档展示，编辑时只需调整两个分界点数字。
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
                              <div className="mt-4 overflow-x-auto">
                                <div className="inline-block w-max min-w-max align-top rounded-xl border border-slate-700 sm:block sm:min-w-full sm:w-full">
                                <table className="w-max min-w-max border-collapse text-sm text-slate-200 sm:w-full sm:min-w-full">
                                  <thead>
                                    <tr className="bg-slate-900">
                                      <th className="whitespace-nowrap border border-slate-700 px-2 py-3 text-center text-sm font-medium text-white sm:px-4 sm:py-4 sm:text-base">
                                        主体偏离度
                                      </th>
                                      <th className="whitespace-nowrap border border-slate-700 px-2 py-3 text-center text-base font-semibold text-white sm:px-4 sm:py-4 sm:text-lg">
                                        好
                                      </th>
                                      <th className="whitespace-nowrap border border-slate-700 px-2 py-3 text-center text-base font-semibold text-white sm:px-4 sm:py-4 sm:text-lg">
                                        一般
                                      </th>
                                      <th className="whitespace-nowrap border border-slate-700 px-2 py-3 text-center text-base font-semibold text-white sm:px-4 sm:py-4 sm:text-lg">
                                        差
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {subjectOffsetRows.map(row => {
                                      const activeItem = isSubjectOffsetEditing
                                        ? subjectOffsetDraft[row.key]
                                        : subjectOffsetMap[row.key];

                                      return (
                                      <tr key={row.key} className="bg-slate-800/70">
                                        <td className="whitespace-nowrap border border-slate-700 px-2 py-4 text-center text-base font-medium text-white sm:px-4 sm:py-5 sm:text-lg">
                                          {row.code} {row.scene}
                                        </td>
                                        <td className="whitespace-nowrap border border-slate-700 px-1.5 py-3 text-center align-middle sm:px-3 sm:py-4">
                                          {isSubjectOffsetEditing ? (
                                            <div className="mx-auto flex max-w-[172px] items-center justify-center gap-0.5 text-[14px] text-slate-300 sm:max-w-[208px] sm:gap-1 sm:text-base">
                                              <span>[0%,</span>
                                              <div className="relative w-[72px] sm:w-[88px]">
                                                <input
                                                  type="text"
                                                  inputMode="numeric"
                                                  pattern="[0-9]*"
                                                  value={activeItem.x1}
                                                  onChange={event =>
                                                    updateSubjectOffsetDraft(row.key, { x1: event.target.value })
                                                  }
                                                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-1.5 py-1.5 pr-4 text-center text-base font-medium text-white outline-none transition focus:border-blue-400 sm:px-2 sm:py-2 sm:pr-5 sm:text-[1.1rem]"
                                                />
                                                <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                                  %
                                                </span>
                                              </div>
                                              <span>]</span>
                                            </div>
                                          ) : (
                                            <span className="whitespace-nowrap text-base text-slate-100 sm:text-lg">
                                              {formatSubjectOffsetRangeLabel(activeItem, 'good')}
                                            </span>
                                          )}
                                        </td>
                                        <td className="whitespace-nowrap border border-slate-700 px-1.5 py-3 text-center align-middle sm:px-3 sm:py-4">
                                          {isSubjectOffsetEditing ? (
                                            <div className="mx-auto flex max-w-[236px] items-center justify-center gap-0.5 text-[14px] text-slate-300 sm:max-w-[284px] sm:gap-1 sm:text-base">
                                              <span>(</span>
                                              <div className="relative w-[72px] sm:w-[88px]">
                                                <input
                                                  type="text"
                                                  inputMode="numeric"
                                                  pattern="[0-9]*"
                                                  value={activeItem.x1}
                                                  onChange={event =>
                                                    updateSubjectOffsetDraft(row.key, { x1: event.target.value })
                                                  }
                                                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-1.5 py-1.5 pr-4 text-center text-base font-medium text-white outline-none transition focus:border-blue-400 sm:px-2 sm:py-2 sm:pr-5 sm:text-[1.1rem]"
                                                />
                                                <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                                  %
                                                </span>
                                              </div>
                                              <span>,</span>
                                              <div className="relative w-[72px] sm:w-[88px]">
                                                <input
                                                  type="text"
                                                  inputMode="numeric"
                                                  pattern="[0-9]*"
                                                  value={activeItem.x2}
                                                  onChange={event =>
                                                    updateSubjectOffsetDraft(row.key, { x2: event.target.value })
                                                  }
                                                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-1.5 py-1.5 pr-4 text-center text-base font-medium text-white outline-none transition focus:border-blue-400 sm:px-2 sm:py-2 sm:pr-5 sm:text-[1.1rem]"
                                                />
                                                <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                                  %
                                                </span>
                                              </div>
                                              <span>]</span>
                                            </div>
                                          ) : (
                                            <span className="whitespace-nowrap text-base text-slate-100 sm:text-lg">
                                              {formatSubjectOffsetRangeLabel(activeItem, 'normal')}
                                            </span>
                                          )}
                                        </td>
                                        <td className="whitespace-nowrap border border-slate-700 px-1.5 py-3 text-center align-middle sm:px-3 sm:py-4">
                                          {isSubjectOffsetEditing ? (
                                            <div className="mx-auto flex max-w-[172px] items-center justify-center gap-0.5 text-[14px] text-slate-300 sm:max-w-[208px] sm:gap-1 sm:text-base">
                                              <span>(</span>
                                              <div className="relative w-[72px] sm:w-[88px]">
                                                <input
                                                  type="text"
                                                  inputMode="numeric"
                                                  pattern="[0-9]*"
                                                  value={activeItem.x2}
                                                  onChange={event =>
                                                    updateSubjectOffsetDraft(row.key, { x2: event.target.value })
                                                  }
                                                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-1.5 py-1.5 pr-4 text-center text-base font-medium text-white outline-none transition focus:border-blue-400 sm:px-2 sm:py-2 sm:pr-5 sm:text-[1.1rem]"
                                                />
                                                <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                                                  %
                                                </span>
                                              </div>
                                              <span>,100%]</span>
                                            </div>
                                          ) : (
                                            <span className="whitespace-nowrap text-base text-slate-100 sm:text-lg">
                                              {formatSubjectOffsetRangeLabel(activeItem, 'bad')}
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                </div>
                              </div>
                            )}

                            <div className="mt-4 flex justify-end gap-2">
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
                            <div className="text-sm text-slate-400">
                              支持在右下角统一保存或重置当前笑容检测参数配置
                            </div>

                            {smileError && (
                              <div className="mb-4 mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {smileError}
                              </div>
                            )}
                            {smileLoading ? (
                              <div className="mt-4 text-sm text-slate-400">加载中...</div>
                            ) : (
                              <div className="mt-4 space-y-6">
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
                              </div>
                            )}

                            <div className="mt-4 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setSmileDraft({ ...smileConfig })}
                                className="rounded-lg border border-slate-600 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
                              >
                                重置
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveSmileConfig}
                                disabled={smileSaving}
                                className="rounded-lg bg-violet-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {smileSaving ? '保存中...' : '保存'}
                              </button>
                            </div>
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
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="text-base font-semibold text-white">拍照阈值设置</div>
                                <div className="mt-1 text-sm text-slate-400">
                                  支持编辑阈值启用状态、比较符和阈值数值
                                </div>
                              </div>
                              <div className="flex w-full justify-end gap-2 sm:w-auto sm:flex-none">
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
              <TemplateManager
                embedded
                bodyRangeOptions={bodyRangeValues}
                shotTypeOptions={shotTypeValues}
                availableShotTypeOptionsByBodyRange={availableShotTypeOptionsByBodyRange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfigPanel;
