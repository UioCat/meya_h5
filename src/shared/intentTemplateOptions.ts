export type BodyRangeConfigItem = {
  code: string;
  name: string;
};

export type BodyRangeOptionItem = BodyRangeConfigItem & {
  value: string;
  locked: boolean;
};

export type ShotTypeConfigItem = {
  code: string;
  name: string;
};

export type ShotTypeOptionItem = ShotTypeConfigItem & {
  value: string;
  locked: boolean;
};

export const BODY_RANGE_CONFIG_TYPE = 'basic_config';
export const BODY_RANGE_CONFIG_KEY = 'composition_body_range_options';
export const SHOT_TYPE_CONFIG_TYPE = 'basic_config';
export const SHOT_TYPE_CONFIG_KEY = 'composition_shot_type_options';

export const DEFAULT_BODY_RANGE_ITEMS = [
  { code: 'A1', name: '头部' },
  { code: 'A2', name: '胸部及以上' },
  { code: 'A3', name: '腰部及以上' },
  { code: 'A4', name: '膝盖及以上' },
  { code: 'A5', name: '全身' }
] as const satisfies ReadonlyArray<BodyRangeConfigItem>;

export const DEFAULT_SHOT_TYPE_ITEMS = [
  { code: 'B1', name: '特写' },
  { code: 'B2', name: '近景' },
  { code: 'B3', name: '中近景' },
  { code: 'B4', name: '中景' },
  { code: 'B5', name: '中远景' },
  { code: 'B6', name: '远景' }
] as const satisfies ReadonlyArray<ShotTypeConfigItem>;

export const normalizeBodyRangeCode = (value: string) => {
  const compact = value.toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if (!compact) return '';
  if (/^\d/.test(compact)) return `A${compact}`;
  return compact;
};

export const isValidBodyRangeCode = (value: string) => /^A\d+(?:\.\d+)?$/.test(value);
export const isValidShotTypeCode = (value: string) => /^B\d+(?:\.\d+)?$/.test(value);

export const normalizeOptionValue = (value: string) =>
  value.replace(/^([A-Z]\d+(?:\.\d+)?)(\s+)/, '$1').trim();

export const stripOptionCode = (value: string) =>
  normalizeOptionValue(value).replace(/^[A-Z]\d+(?:\.\d+)?/, '');

const splitOptionCodeParts = (value: string) => {
  const normalized = normalizeOptionValue(value);
  const match = normalized.match(/^([A-Z])(\d+(?:\.\d+)*)(.*)$/);
  if (!match) return null;
  const [, prefix, numericPart] = match;
  return {
    prefix,
    parts: numericPart.split('.').map(part => Number(part))
  };
};

export const compareOptionValuesByCode = (left: string, right: string) => {
  const leftParts = splitOptionCodeParts(left);
  const rightParts = splitOptionCodeParts(right);

  if (!leftParts || !rightParts) {
    return normalizeOptionValue(left).localeCompare(normalizeOptionValue(right), 'zh-CN');
  }

  if (leftParts.prefix !== rightParts.prefix) {
    return leftParts.prefix.localeCompare(rightParts.prefix, 'en');
  }

  const maxLength = Math.max(leftParts.parts.length, rightParts.parts.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts.parts[index] ?? -1;
    const rightValue = rightParts.parts[index] ?? -1;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return normalizeOptionValue(left).localeCompare(normalizeOptionValue(right), 'zh-CN');
};

export const sortOptionValuesByCode = <T extends string>(values: readonly T[]) =>
  [...values].sort((left, right) => compareOptionValuesByCode(left, right)) as T[];

export const formatBodyRangeValue = (code: string, name: string) =>
  normalizeOptionValue(`${normalizeBodyRangeCode(code)}${name.trim()}`);

export const splitBodyRangeValue = (value: string): BodyRangeConfigItem | null => {
  const normalized = normalizeOptionValue(value);
  const match = normalized.match(/^(A\d+(?:\.\d+)?)(.+)$/);
  if (!match) return null;
  const [, code, name] = match;
  if (!name.trim()) return null;
  return {
    code,
    name: name.trim()
  };
};

export const normalizeShotTypeCode = (value: string) => {
  const compact = value.toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if (!compact) return '';
  if (/^\d/.test(compact)) return `B${compact}`;
  return compact;
};

export const formatShotTypeValue = (code: string, name: string) =>
  normalizeOptionValue(`${normalizeShotTypeCode(code)}${name.trim()}`);

export const splitShotTypeValue = (value: string): ShotTypeConfigItem | null => {
  const normalized = normalizeOptionValue(value);
  const match = normalized.match(/^(B\d+(?:\.\d+)?)(.+)$/);
  if (!match) return null;
  const [, code, name] = match;
  if (!name.trim()) return null;
  return {
    code,
    name: name.trim()
  };
};

const defaultBodyRangeValues = sortOptionValuesByCode(
  DEFAULT_BODY_RANGE_ITEMS.map(item => formatBodyRangeValue(item.code, item.name))
);
const defaultShotTypeValues = sortOptionValuesByCode(
  DEFAULT_SHOT_TYPE_ITEMS.map(item => formatShotTypeValue(item.code, item.name))
);

export const compositionParams = [
  {
    key: 'A',
    label: '身体范围（A）',
    options: defaultBodyRangeValues
  },
  {
    key: 'B',
    label: '景别类型（B）',
    options: defaultShotTypeValues
  },
  {
    key: 'C',
    label: '方位角（C）',
    options: sortOptionValuesByCode(['C1正脸', 'C2左侧45度', 'C3右侧45度', 'C4背身'])
  },
  {
    key: 'D',
    label: '构图方法（D）',
    options: sortOptionValuesByCode([
      'D1居中构图',
      'D2.1三分构图H1V1',
      'D2.2三分构图H1V2',
      'D2.3三分构图H2V1',
      'D2.4三分构图H2V2',
      'D2.5三分构图H1',
      'D2.6三分构图H2',
      'D2.7三分构图V1',
      'D2.8三分构图V2',
      'D3.1对角线构图-H0V0-H3V3',
      'D3.2对角线构图-H0V3-H3V0',
      'D4.1对称构图V1.5',
      'D4.2对称构图H1.5'
    ])
  },
  {
    key: 'E',
    label: '机位高度（E）',
    options: sortOptionValuesByCode(['E5齐眼', 'E4齐胸', 'E3齐肩', 'E2齐髋', 'E1齐膝'])
  },
  {
    key: 'K',
    label: '空间关系（K）',
    options: sortOptionValuesByCode(['K1前景', 'K2中景', 'K3背景'])
  }
] as const;

export const eyeStatusOptions = ['闭眼', '一睁一闭', '睁眼'] as const;
export const mouthStatusOptions = ['不笑', '微笑', '大笑'] as const;
export const compositionObjectOptions = ['人体头部中心点', '双眼中心点'] as const;
export const structureLineAlignmentLineOptions = ['H1', 'H2', '水平中心', 'V1', 'V2', '竖直中心'] as const;
export const structureLineAlignmentPointOptions = ['H1V1', 'H1V2', 'H2V1', 'H2V2'] as const;

export const normalizeCompositionObjectValue = (value: string) => {
  const normalized = normalizeOptionValue(value);
  return normalized === '眼睛' ? '双眼中心点' : normalized;
};

export const buildBodyRangeOptions = (customItems: readonly BodyRangeConfigItem[] = []): BodyRangeOptionItem[] => {
  const customValues = new Set(defaultBodyRangeValues);
  const merged: BodyRangeOptionItem[] = DEFAULT_BODY_RANGE_ITEMS.map(item => ({
    ...item,
    value: formatBodyRangeValue(item.code, item.name),
    locked: true
  }));

  customItems.forEach(item => {
    const code = normalizeBodyRangeCode(item.code);
    const name = item.name.trim();
    if (!isValidBodyRangeCode(code) || !name) return;
    const value = formatBodyRangeValue(code, name);
    if (customValues.has(value)) return;
    customValues.add(value);
    merged.push({
      code,
      name,
      value,
      locked: false
    });
  });

  return merged.sort((left, right) => compareOptionValuesByCode(left.value, right.value));
};

export const buildShotTypeOptions = (customItems: readonly ShotTypeConfigItem[] = []): ShotTypeOptionItem[] => {
  const customValues = new Set(defaultShotTypeValues);
  const merged: ShotTypeOptionItem[] = DEFAULT_SHOT_TYPE_ITEMS.map(item => ({
    ...item,
    value: formatShotTypeValue(item.code, item.name),
    locked: true
  }));

  customItems.forEach(item => {
    const code = normalizeShotTypeCode(item.code);
    const name = item.name.trim();
    if (!isValidShotTypeCode(code) || !name) return;
    const value = formatShotTypeValue(code, name);
    if (customValues.has(value)) return;
    customValues.add(value);
    merged.push({
      code,
      name,
      value,
      locked: false
    });
  });

  return merged.sort((left, right) => compareOptionValuesByCode(left.value, right.value));
};

export const parseBodyRangeCustomItems = (value: unknown): BodyRangeConfigItem[] => {
  let source = value;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(source)) return [];

  const items: BodyRangeConfigItem[] = [];
  const seenValues = new Set(defaultBodyRangeValues);

  source.forEach(item => {
    let parsed: BodyRangeConfigItem | null = null;

    if (typeof item === 'string') {
      parsed = splitBodyRangeValue(item);
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const code = typeof obj.code === 'string' ? normalizeBodyRangeCode(obj.code) : '';
      const name = typeof obj.name === 'string' ? obj.name.trim() : '';
      if (isValidBodyRangeCode(code) && name) {
        parsed = { code, name };
      } else if (typeof obj.value === 'string') {
        parsed = splitBodyRangeValue(obj.value);
      }
    }

    if (!parsed) return;
    const valueKey = formatBodyRangeValue(parsed.code, parsed.name);
    if (seenValues.has(valueKey)) return;
    seenValues.add(valueKey);
    items.push(parsed);
  });

  return items;
};

export const parseShotTypeCustomItems = (value: unknown): ShotTypeConfigItem[] => {
  let source = value;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(source)) return [];

  const items: ShotTypeConfigItem[] = [];
  const seenValues = new Set(defaultShotTypeValues);

  source.forEach(item => {
    let parsed: ShotTypeConfigItem | null = null;

    if (typeof item === 'string') {
      parsed = splitShotTypeValue(item);
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const code = typeof obj.code === 'string' ? normalizeShotTypeCode(obj.code) : '';
      const name = typeof obj.name === 'string' ? obj.name.trim() : '';
      if (isValidShotTypeCode(code) && name) {
        parsed = { code, name };
      } else if (typeof obj.value === 'string') {
        parsed = splitShotTypeValue(obj.value);
      }
    }

    if (!parsed) return;
    const valueKey = formatShotTypeValue(parsed.code, parsed.name);
    if (seenValues.has(valueKey)) return;
    seenValues.add(valueKey);
    items.push(parsed);
  });

  return items;
};

export const serializeBodyRangeCustomItems = (items: readonly BodyRangeConfigItem[]) =>
  items.map(item => ({
    code: normalizeBodyRangeCode(item.code),
    name: item.name.trim()
  }));

export const serializeShotTypeCustomItems = (items: readonly ShotTypeConfigItem[]) =>
  items.map(item => ({
    code: normalizeShotTypeCode(item.code),
    name: item.name.trim()
  }));

export const intentTemplateOptions = {
  bodyRange: compositionParams.find(param => param.key === 'A')?.options ?? [],
  shotType: compositionParams.find(param => param.key === 'B')?.options ?? [],
  orientation: compositionParams.find(param => param.key === 'C')?.options ?? [],
  compositionMethod: compositionParams.find(param => param.key === 'D')?.options ?? [],
  cameraHeight: compositionParams.find(param => param.key === 'E')?.options ?? [],
  compositionObject: compositionObjectOptions,
  structureLineAlignmentLine: structureLineAlignmentLineOptions,
  structureLineAlignmentPoint: structureLineAlignmentPointOptions,
  eyeStatus: eyeStatusOptions,
  mouthStatus: mouthStatusOptions
} as const;
