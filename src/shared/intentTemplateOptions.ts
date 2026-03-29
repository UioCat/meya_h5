export const compositionParams = [
  {
    key: 'A',
    label: '身体范围（A）',
    options: ['A1头部', 'A2肩部及以上', 'A3髋部及以上', 'A4膝部及以上', 'A5全身']
  },
  {
    key: 'B',
    label: '景别类型（B）',
    options: ['B1特写', 'B2近景', 'B3中近景', 'B4中景', 'B6远景']
  },
  {
    key: 'C',
    label: '方位角（C）',
    options: ['C1正脸', 'C2左侧45度', 'C3右侧45度', 'C4背身']
  },
  {
    key: 'D',
    label: '构图方法（D）',
    options: [
      'D1居中构图',
      'D2.1三分线构图H1V1',
      'D2.2三分线构图H1V2',
      'D2.3三分线构图H2V1',
      'D2.4三分线构图H2V2',
      'D2.5三分线构图H1',
      'D2.6三分线构图H2',
      'D2.7三分线构图V1',
      'D2.8三分线构图V2',
      'D3.1对角线构图-H0V0-H3V3',
      'D3.2对角线构图-H0V3-H3V0',
      'D4.1对称构图V1.5',
      'D4.2对称构图H1.5'
    ]
  },
  {
    key: 'E',
    label: '机位高度（E）',
    options: ['E4齐眼', 'E3齐肩', 'E2齐髋', 'E1齐膝']
  },
  {
    key: 'K',
    label: '空间关系（K）',
    options: ['K1前景', 'K2中景', 'K3背景']
  }
] as const;

export const eyeStatusOptions = ['闭眼', '一睁一闭', '睁眼'] as const;
export const mouthStatusOptions = ['不笑', '微笑', '大笑'] as const;

export const normalizeOptionValue = (value: string) =>
  value.replace(/^([A-Z]\d(?:\.\d+)?)(\s+)/, '$1').trim();

export const stripOptionCode = (value: string) =>
  normalizeOptionValue(value).replace(/^[A-Z]\d(?:\.\d+)?/, '');

export const intentTemplateOptions = {
  bodyRange: compositionParams.find(param => param.key === 'A')?.options ?? [],
  shotType: compositionParams.find(param => param.key === 'B')?.options ?? [],
  orientation: compositionParams.find(param => param.key === 'C')?.options ?? [],
  compositionMethod: compositionParams.find(param => param.key === 'D')?.options ?? [],
  cameraHeight: compositionParams.find(param => param.key === 'E')?.options ?? [],
  eyeStatus: eyeStatusOptions,
  mouthStatus: mouthStatusOptions
} as const;
