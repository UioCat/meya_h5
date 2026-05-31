import { useState, useRef, useEffect } from 'react';
import { Camera, Radio, Video } from 'lucide-react';
import {
  intentTemplateOptions,
  normalizeCompositionObjectValue,
  normalizeOptionValue,
  stripOptionCode
} from '../shared/intentTemplateOptions';
import {
  AnalysisDisplayPanel,
  DisplayOverlayLayer,
  DisplayPromptLayer,
  normalizeLiveDisplayPayload,
  type DisplayPanel,
  type DisplayPoint,
  type DisplayPrimitive,
  type DisplayPrompt,
  type DisplayPromptIcon,
  type DisplayRect,
  type LiveDisplayModel
} from './LiveDisplay';

declare global {
  interface Window {
    TXLivePusher: any;
    flvjs?: any;
  }
}

interface DeviceInfo {
  deviceId: string;
  label: string;
}

type AlignmentTemplateValue = {
  bodyRange: string;
  shotType: string;
  orientation: string;
  compositionMethod: string;
  compositionObject: string;
  structureLineAlignmentLine: string;
  structureLineAlignmentPoint: string;
  cameraHeight: string;
  eyeStatus: string;
  mouthStatus: string;
};

type AlignmentTemplateItem = {
  key: string;
  value: AlignmentTemplateValue;
  updated_at?: number;
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

type ShotRatioConfigItem = {
  scene: string;
  range: string;
  ratioMin: string;
  ratioMax: string;
};

type SubjectRatioScoreConfigItem = {
  scene: string;
  range: string;
  ratioMin: string;
  ratioMax: string;
};

type AlgoType = 'upload_template' | 'alignment_person' | 'guide_line';

type ActiveMode = 'image_search' | 'alignment_person' | 'guide_line' | null;

const HEIGHT_STAGE_RANGE_HALF_RATIO = 0.035;

const parseOverlayPoint = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [x, y] = value;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  return [x, y];
};

const parseOverlayBox = (value: unknown): [number, number, number, number] | null => {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const [x, y, width, height] = value;
  if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      typeof height !== 'number'
  ) {
    return null;
  }
  return [x, y, width, height];
};

const normalizeAlgoType = (value: unknown): AlgoType | null => {
  if (value === 'upload_template' || value === 'alignment_person' || value === 'guide_line') {
    return value;
  }
  if (value === 'IBVS_ALGO') {
    return 'alignment_person';
  }
  if (value === 'guideline' || value === 'guide_line_detect') {
    return 'guide_line';
  }
  return null;
};

type GuideLineInfo = {
  statusCode?: number;
  statusMessage?: string;
  taskId?: string;
  lineCount?: number;
  selectedGuideLineId?: number | string;
  targetAngleDeg?: number;
  currentAngleDeg?: number;
  trackerRegion?: {
    available?: boolean;
    source?: string;
    shape?: string;
    bbox?: [number, number, number, number];
    bboxNorm?: [number, number, number, number];
  };
  guideLines: Array<{
    id: number | string;
    points?: [[number, number], [number, number]];
    pointsNorm?: [[number, number], [number, number]];
    isAlignmentLine?: boolean;
  }>;
  frameSize?: {
    width: number;
    height: number;
  };
  resultUrl?: string;
  apiTaskId?: string;
};

type AlignmentRawInfo = {
  ratio?: number;
  bbox?: [number, number, number, number];
  centerPoint?: [number, number];
  heightReferencePoint?: [number, number];
  targetBox?: [number, number, number, number];
  compositionObjectBox?: [number, number, number, number];
  compositionObjectCenterPoint?: [number, number];
  compositionObjectName?: string;
  yaw?: number;
};

type ImageSearchInfo = {
  statusCode?: number;
  statusMessage?: string;
  matchedPoints?: number;
  quad?: {
    leftTop: [number, number];
    rightTop: [number, number];
    rightBottom: [number, number];
    leftBottom: [number, number];
  };
  targetCenter?: [number, number];
};

type ControlPromptChannel =
  | 'move-pitch'
  | 'move-roll'
  | 'move-yaw'
  | 'move-throttle'
  | 'gimbal-horizontal'
  | 'gimbal-vertical';

type ControlPromptMap = Partial<Record<ControlPromptChannel, DisplayPrompt>>;

const CONTROL_PROMPT_TTL_MS = 3000;
const CONTROL_PROMPT_CHANNELS: ControlPromptChannel[] = [
  'move-yaw',
  'move-roll',
  'move-pitch',
  'move-throttle',
  'gimbal-horizontal',
  'gimbal-vertical'
];

const createControlPrompt = (
  id: string,
  text: string,
  icon: DisplayPromptIcon
): DisplayPrompt => ({
  id,
  text,
  placement: 'video-bottom',
  tone: 'instruction',
  icon
});

const createMovePitchPrompt = (value: number) =>
  createControlPrompt('control-move-pitch', value > 0 ? '向前' : '向后', {
    kind: 'vertical',
    direction: value > 0 ? 'up' : 'down'
  });

const createMoveRollPrompt = (value: number) =>
  createControlPrompt('control-move-roll', value > 0 ? '右移' : '左移', {
    kind: 'horizontal',
    direction: value > 0 ? 'right' : 'left'
  });

const createMoveYawPrompt = (value: number) =>
  createControlPrompt('control-move-yaw', value > 0 ? '右转' : '左转', {
    kind: 'rotate',
    direction: value > 0 ? 'clockwise' : 'counterclockwise'
  });

const createMoveThrottlePrompt = (value: number) =>
  createControlPrompt('control-move-throttle', value > 0 ? '向上' : '向下', {
    kind: 'vertical',
    direction: value > 0 ? 'up' : 'down'
  });

const createGimbalHorizontalPrompt = (value: number) =>
  createControlPrompt('control-gimbal-horizontal', value > 0 ? '云台右转' : '云台左转', {
    kind: 'horizontal',
    direction: value > 0 ? 'right' : 'left'
  });

const createGimbalVerticalPrompt = (value: number) =>
  createControlPrompt('control-gimbal-vertical', value > 0 ? '云台上' : '云台下', {
    kind: 'vertical',
    direction: value > 0 ? 'up' : 'down'
  });

const parseGuideLineSegmentPoints = (
  value: unknown
): [[number, number], [number, number]] | undefined => {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const start = parseOverlayPoint(value[0]);
  const end = parseOverlayPoint(value[1]);
  if (!start || !end) return undefined;
  return [start, end];
};

const parseGuideLineTrackerRegion = (value: unknown): GuideLineInfo['trackerRegion'] => {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const bbox = parseOverlayBox(obj.bbox);
  const bboxNorm = parseOverlayBox(obj.bboxNorm ?? obj.bbox_norm);
  if (!bbox && !bboxNorm) return undefined;

  return {
    available: typeof obj.available === 'boolean' ? obj.available : undefined,
    source: typeof obj.source === 'string' ? obj.source : undefined,
    shape: typeof obj.shape === 'string' ? obj.shape : undefined,
    bbox: bbox || undefined,
    bboxNorm: bboxNorm || undefined
  };
};

const readNumberField = (obj: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
};

const getGuideLineSegmentAngleDeg = (line?: GuideLineInfo['guideLines'][number]) => {
  const points = line?.pointsNorm || line?.points;
  if (!points) return undefined;
  const [[startX, startY], [endX, endY]] = points;
  const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
  const normalized = ((angle % 180) + 180) % 180;
  return Number(normalized.toFixed(1));
};

const parseGuideLineResult = (value: unknown): GuideLineInfo | null => {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const linesSource = Array.isArray(obj.guideLines)
    ? obj.guideLines
    : Array.isArray(obj.guide_lines)
      ? obj.guide_lines
      : Array.isArray(obj.detectedGuideLines)
        ? obj.detectedGuideLines
        : Array.isArray(obj.detected_guide_lines)
          ? obj.detected_guide_lines
          : Array.isArray(obj.reportedGuideLines)
            ? obj.reportedGuideLines
            : Array.isArray(obj.reported_guide_lines)
              ? obj.reported_guide_lines
      : [];

  const selectedGuideLineSource =
    obj.selectedGuideLine && typeof obj.selectedGuideLine === 'object'
      ? (obj.selectedGuideLine as Record<string, unknown>)
      : obj.selected_guide_line && typeof obj.selected_guide_line === 'object'
        ? (obj.selected_guide_line as Record<string, unknown>)
        : null;
  const selectedGuideLineId = selectedGuideLineSource?.id;

  const guideLines: GuideLineInfo['guideLines'] = [];
  linesSource.forEach((line, index) => {
    if (!line || typeof line !== 'object') return;
    const lineObj = line as Record<string, unknown>;
    const points = parseGuideLineSegmentPoints(lineObj.points);
    const pointsNorm = parseGuideLineSegmentPoints(lineObj.pointsNorm ?? lineObj.points_norm);
    if (!points && !pointsNorm) return;
    const rawId = lineObj.id;
    guideLines.push({
      id:
        typeof rawId === 'number' || typeof rawId === 'string'
          ? rawId
          : index,
      points,
      pointsNorm,
      isAlignmentLine:
        lineObj.isAlignmentLine === true ||
        lineObj.is_alignment_line === true
    });
  });

  const frameSizeSource =
    obj.frameSize && typeof obj.frameSize === 'object'
      ? (obj.frameSize as Record<string, unknown>)
      : obj.frame_size && typeof obj.frame_size === 'object'
        ? (obj.frame_size as Record<string, unknown>)
        : null;
  const frameWidth = frameSizeSource?.width;
  const frameHeight = frameSizeSource?.height;
  const frameSize =
    typeof frameWidth === 'number' &&
    typeof frameHeight === 'number' &&
    frameWidth > 0 &&
    frameHeight > 0
      ? { width: frameWidth, height: frameHeight }
      : undefined;

  const statusCode =
    typeof obj.statusCode === 'number'
      ? obj.statusCode
      : typeof obj.status_code === 'number'
        ? obj.status_code
        : undefined;
  const statusMessage =
    typeof obj.statusMessage === 'string'
      ? obj.statusMessage
      : typeof obj.status_message === 'string'
        ? obj.status_message
        : undefined;
  const taskId =
    typeof obj.taskId === 'string'
      ? obj.taskId
      : typeof obj.task_id === 'string'
        ? obj.task_id
        : undefined;
  const lineCount =
    typeof obj.lineCount === 'number'
      ? obj.lineCount
      : typeof obj.line_count === 'number'
        ? obj.line_count
        : guideLines.length;
  const resultUrl =
    typeof obj.resultUrl === 'string'
      ? obj.resultUrl
      : typeof obj.result_url === 'string'
        ? obj.result_url
        : undefined;
  const apiTaskId =
    typeof obj.apiTaskId === 'string'
      ? obj.apiTaskId
      : typeof obj.api_task_id === 'string'
        ? obj.api_task_id
        : undefined;
  const trackerRegion = parseGuideLineTrackerRegion(obj.trackerRegion ?? obj.tracker_region);
  const targetAngleDeg = readNumberField(obj, [
    'targetAngleDeg',
    'target_angle_deg',
    'alignmentTargetAngleDeg',
    'alignment_target_angle_deg',
    'guideLineAlignmentTargetAngleDeg',
    'guide_line_alignment_target_angle_deg'
  ]);
  const currentAngleDeg = readNumberField(obj, [
    'currentAngleDeg',
    'current_angle_deg',
    'alignmentCurrentAngleDeg',
    'alignment_current_angle_deg',
    'guideLineAlignmentCurrentAngleDeg',
    'guide_line_alignment_current_angle_deg'
  ]);

  if (
    guideLines.length === 0 &&
    !trackerRegion &&
    statusCode === undefined &&
    !statusMessage &&
    !taskId &&
    !resultUrl &&
    !apiTaskId &&
    targetAngleDeg === undefined &&
    currentAngleDeg === undefined
  ) {
    return null;
  }

  return {
    statusCode,
    statusMessage,
    taskId,
    lineCount,
    selectedGuideLineId:
      typeof selectedGuideLineId === 'number' || typeof selectedGuideLineId === 'string'
        ? selectedGuideLineId
        : undefined,
    targetAngleDeg,
    currentAngleDeg,
    trackerRegion,
    guideLines,
    frameSize,
    resultUrl,
    apiTaskId
  };
};

const pickPosePoint = (
    pose: any,
    candidates: string[]
): [number, number] | undefined => {
  for (const key of candidates) {
    const value = pose?.[key];
    if (Array.isArray(value) && value.length === 2) {
      const [x, y] = value;
      if (typeof x === 'number' && typeof y === 'number') {
        return [x, y];
      }
    }
  }
  return undefined;
};

const getHeightReferencePoint = (
    pose: any,
    cameraHeight: string
): [number, number] | undefined => {
  const normalized = cameraHeight.trim();
  if (!normalized) return undefined;

  if (normalized === '齐眼') {
    return pickPosePoint(pose, ['eye_center', 'eyes_center', 'eye_point', 'eyePoint']);
  }
  if (normalized === '齐胸') {
    return pickPosePoint(pose, ['chest_center', 'chest_point', 'chestPoint']);
  }
  if (normalized === '齐肩') {
    return pickPosePoint(pose, ['shoulder_center', 'shoulders_center', 'shoulder_point', 'shoulderPoint']);
  }
  if (normalized === '齐髋') {
    return pickPosePoint(pose, ['hip_center', 'hips_center', 'hip_point', 'hipPoint']);
  }
  if (normalized === '齐膝') {
    return pickPosePoint(pose, ['knee_center', 'knees_center', 'knee_point', 'kneePoint']);
  }
  return undefined;
};

const createEmptyDisplayModel = (): LiveDisplayModel => ({
  panel: null,
  overlays: [],
  videoPrompts: [],
  viewportPrompts: []
});

const toSourcePoint = (point: [number, number]): DisplayPoint => ({
  x: point[0],
  y: point[1],
  space: 'source'
});

const toNormalizedPoint = (point: [number, number]): DisplayPoint => ({
  x: point[0],
  y: point[1],
  space: 'normalized'
});

const toSourceRect = (box: [number, number, number, number]): DisplayRect => ({
  x: box[0],
  y: box[1],
  width: box[2],
  height: box[3],
  space: 'source'
});

const toNormalizedRect = (box: [number, number, number, number]): DisplayRect => ({
  x: box[0],
  y: box[1],
  width: box[2],
  height: box[3],
  space: 'normalized'
});

const formatRatio = (value: number | undefined) =>
  value !== undefined ? `${(value * 100).toFixed(2)}%` : '--';

const formatDegree = (value: number | undefined) =>
  value !== undefined ? `${value.toFixed(2)}°` : '--';

const formatGuideDegree = (value: number | undefined) =>
  value !== undefined ? `${value.toFixed(1)}°` : '--';

const hasAlignmentDisplayData = (rawInfo: AlignmentRawInfo | null) =>
  Boolean(rawInfo?.bbox) ||
  Boolean(rawInfo?.centerPoint) ||
  Boolean(rawInfo?.targetBox) ||
  Boolean(rawInfo?.compositionObjectBox) ||
  Boolean(rawInfo?.compositionObjectCenterPoint) ||
  rawInfo?.ratio !== undefined ||
  rawInfo?.yaw !== undefined;

const getImageSearchStatusLabel = (statusCode?: number) => {
  if (statusCode === 201) return '发现目标';
  if (statusCode === 202) return '定位成功';
  if (statusCode === 203) return '未发现目标';
  return '--';
};

const getLineIntersection = (
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number]
): [number, number] | null => {
  const x1 = a[0], y1 = a[1];
  const x2 = b[0], y2 = b[1];
  const x3 = c[0], y3 = c[1];
  const x4 = d[0], y4 = d[1];
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < 1e-6) return null;
  const px =
    ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) /
    denominator;
  const py =
    ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) /
    denominator;
  return [px, py];
};

const buildAlignmentDisplayModel = ({
  currentAlgoLabel,
  currentStage,
  isActiveAlignmentRun,
  isHeightAlignmentStage,
  isDistanceAlignmentStage,
  isCenterAlignmentStage,
  rawInfo,
  sourceSize,
  effectiveAlignmentCameraHeight,
  personCenterPosition,
  personCenterPositionOffsetPercent
}: {
  currentAlgoLabel: string;
  currentStage: string;
  isActiveAlignmentRun: boolean;
  isHeightAlignmentStage: boolean;
  isDistanceAlignmentStage: boolean;
  isCenterAlignmentStage: boolean;
  rawInfo: AlignmentRawInfo | null;
  sourceSize: { width: number; height: number } | null;
  effectiveAlignmentCameraHeight: string;
  personCenterPosition: string;
  personCenterPositionOffsetPercent: number;
}): LiveDisplayModel | null => {
  const hasAnalysis = hasAlignmentDisplayData(rawInfo);
  if (!isActiveAlignmentRun || (!currentStage && !hasAnalysis)) return null;

  const overlays: DisplayPrimitive[] = [];
  const explanationRows: DisplayPanel['sections'][number]['rows'] = [];
  const shouldShowCompositionOverlay =
    isCenterAlignmentStage &&
    (Boolean(rawInfo?.targetBox) ||
      Boolean(rawInfo?.compositionObjectBox) ||
      Boolean(rawInfo?.compositionObjectCenterPoint));

  if (isCenterAlignmentStage) {
    overlays.push({
      id: 'alignment-center-grid',
      kind: 'centerAlignmentGuide'
    });
  }

  if (rawInfo) {
    if (isDistanceAlignmentStage && rawInfo.bbox) {
      overlays.push({
        id: 'alignment-person-bbox',
        kind: 'box',
        tone: 'result',
        rect: toSourceRect(rawInfo.bbox),
        strokeWidth: 2
      });
      explanationRows.push({ id: 'person-bbox-help', text: '绿色框：当前识别到的人体范围' });
    }

    if (isHeightAlignmentStage) {
      overlays.push({
        id: 'alignment-height-target-range',
        kind: 'axisBand',
        axis: 'y',
        center: 0.5,
        centerSpace: 'normalized',
        tolerance: HEIGHT_STAGE_RANGE_HALF_RATIO,
        toleranceUnit: 'axisRatio',
        minTolerancePx: 10,
        tone: 'target',
        showFill: false,
        showCenter: false,
        showBoundaries: true,
        boundaryDashed: true,
        strokeWidth: 2
      });
      if (rawInfo.heightReferencePoint && sourceSize) {
        overlays.push({
          id: 'alignment-height-current-line',
          kind: 'line',
          tone: 'result',
          from: { x: 0, y: rawInfo.heightReferencePoint[1], space: 'source' },
          to: { x: sourceSize.width, y: rawInfo.heightReferencePoint[1], space: 'source' },
          strokeWidth: 2
        });
      }
      explanationRows.push(
        { id: 'height-target-help', text: '红色虚线：以画面中心为基准的定高范围' },
        { id: 'height-current-help', text: `绿色线：当前人物的${effectiveAlignmentCameraHeight || '--'}位置` }
      );
    }

    if (shouldShowCompositionOverlay) {
      if (rawInfo.targetBox) {
        overlays.push({
          id: 'alignment-composition-target-box',
          kind: 'box',
          tone: 'target',
          rect: toSourceRect(rawInfo.targetBox),
          strokeWidth: 2
        });
      }
      if (rawInfo.compositionObjectBox) {
        overlays.push({
          id: 'alignment-composition-object-box',
          kind: 'box',
          tone: 'result',
          rect: toSourceRect(rawInfo.compositionObjectBox),
          strokeWidth: 2
        });
      }
      if (rawInfo.compositionObjectCenterPoint) {
        overlays.push({
          id: 'alignment-composition-object-center',
          kind: 'point',
          tone: 'result',
          point: toSourcePoint(rawInfo.compositionObjectCenterPoint),
          radius: 6
        });
      }
      explanationRows.push(
        { id: 'composition-target-help', text: '红色框：构图对象中心点需要到达的位置' },
        {
          id: 'composition-object-help',
          text: `绿色框：构图对象（${rawInfo.compositionObjectName || personCenterPosition}）`
        },
        { id: 'composition-center-help', text: '绿色点：构图对象中心点' }
      );
    } else if (isCenterAlignmentStage) {
      if (rawInfo.centerPoint) {
        overlays.push({
          id: 'alignment-person-center',
          kind: 'point',
          tone: 'result',
          point: toSourcePoint(rawInfo.centerPoint),
          radius: 6
        });
      }
      overlays.push(
        {
          id: 'alignment-center-target-point',
          kind: 'point',
          tone: 'target',
          point: { x: 0.5, y: 0.5, space: 'normalized' },
          radius: 6
        },
        {
          id: 'alignment-center-target-radius',
          kind: 'circle',
          tone: 'target',
          center: { x: 0.5, y: 0.5, space: 'normalized' },
          radius: {
            value: personCenterPositionOffsetPercent / 100,
            unit: 'diagonalRatio'
          },
          dashed: true,
          strokeWidth: 2
        }
      );
      explanationRows.push(
        { id: 'center-person-help', text: `绿色点：人像-${personCenterPosition}的中心点` },
        {
          id: 'center-target-help',
          text: `红色点 + 红色圆：画面中心与居中偏差范围（${personCenterPositionOffsetPercent}%）`
        }
      );
    }
  }

  const sections: DisplayPanel['sections'] = [
    {
      id: 'alignment-summary',
      rows: [
        { id: 'algo', label: '当前算法', value: currentAlgoLabel, tone: 'accent' },
        { id: 'stage', label: '当前算法阶段', value: currentStage || '--', tone: 'accent' },
        { id: 'ratio', label: '人体占比', value: formatRatio(rawInfo?.ratio) },
        { id: 'yaw', label: '人脸相对镜头偏移角度', value: formatDegree(rawInfo?.yaw) }
      ]
    }
  ];

  if (explanationRows.length > 0) {
    sections.push({
      id: 'alignment-help',
      title: '画面说明',
      rows: explanationRows
    });
  }

  return {
    panel: {
      title: '分析结果和画面说明',
      sections
    },
    overlays,
    videoPrompts: [],
    viewportPrompts: []
  };
};

const buildImageSearchDisplayModel = (imageSearchInfo: ImageSearchInfo | null): LiveDisplayModel | null => {
  if (!imageSearchInfo) return null;

  const overlays: DisplayPrimitive[] = [];
  if (imageSearchInfo.quad) {
    const p1 = imageSearchInfo.quad.leftTop;
    const p2 = imageSearchInfo.quad.rightTop;
    const p3 = imageSearchInfo.quad.rightBottom;
    const p4 = imageSearchInfo.quad.leftBottom;
    const focus = getLineIntersection(p1, p3, p2, p4) || imageSearchInfo.targetCenter || null;

    overlays.push(
      {
        id: 'image-search-target-polygon',
        kind: 'polygon',
        tone: 'result',
        points: [p1, p2, p3, p4].map(toSourcePoint),
        strokeWidth: 2
      },
      {
        id: 'image-search-target-diagonal-a',
        kind: 'line',
        tone: 'result',
        from: toSourcePoint(p1),
        to: toSourcePoint(p3),
        dashed: true,
        strokeWidth: 1.5
      },
      {
        id: 'image-search-target-diagonal-b',
        kind: 'line',
        tone: 'result',
        from: toSourcePoint(p2),
        to: toSourcePoint(p4),
        dashed: true,
        strokeWidth: 1.5
      }
    );
    if (focus) {
      overlays.push({
        id: 'image-search-target-focus',
        kind: 'point',
        tone: 'result',
        point: toSourcePoint(focus),
        radius: 5
      });
    }
  }

  return {
    panel: {
      title: '分析结果和画面说明',
      sections: [
        {
          id: 'image-search-summary',
          rows: [
            {
              id: 'status-label',
              label: '定位状态',
              value: getImageSearchStatusLabel(imageSearchInfo.statusCode)
            },
            { id: 'status-code', label: '状态码', value: imageSearchInfo.statusCode ?? '--' },
            { id: 'matched-points', label: '匹配点', value: imageSearchInfo.matchedPoints ?? '--' },
            ...(imageSearchInfo.statusMessage
              ? [{ id: 'status-message', label: '说明', value: imageSearchInfo.statusMessage }]
              : [])
          ]
        }
      ]
    },
    overlays,
    videoPrompts: [],
    viewportPrompts: []
  };
};

const buildGuideLineDisplayModel = ({
  currentAlgoLabel,
  guideLineInfo,
  visibleGuideLines,
  hasVisibleSecondaryGuideLines,
  latestGuideLineOptions,
  targetGuideLineAngle,
  currentGuideLineAngle
}: {
  currentAlgoLabel: string;
  guideLineInfo: GuideLineInfo | null;
  visibleGuideLines: GuideLineInfo['guideLines'];
  hasVisibleSecondaryGuideLines: boolean;
  latestGuideLineOptions: {
    proEnabled: boolean;
    showOtherLines: boolean;
    alignmentOrientation: GuideLineAlignmentOrientation;
    alignmentPosition: number;
    alignmentPositionToleranceRatio: number;
  };
  targetGuideLineAngle?: number;
  currentGuideLineAngle?: number;
}): LiveDisplayModel | null => {
  if (!guideLineInfo) return null;

  const overlays: DisplayPrimitive[] = [];
  const explanationRows: DisplayPanel['sections'][number]['rows'] = [];

  if (latestGuideLineOptions.proEnabled) {
    overlays.push({
      id: 'guide-line-target-band',
      kind: 'axisBand',
      axis: latestGuideLineOptions.alignmentOrientation === 'vertical' ? 'x' : 'y',
      center: latestGuideLineOptions.alignmentPosition,
      centerSpace: 'normalized',
      tolerance: latestGuideLineOptions.alignmentPositionToleranceRatio,
      toleranceUnit: 'diagonalRatio',
      tone: 'target',
      showFill: true,
      showCenter: true,
      showBoundaries: true,
      boundaryDashed: true,
      fillOpacity: 0.18,
      strokeWidth: 2
    });
    explanationRows.push(
      { id: 'guide-line-target-help', text: '红色实线：点线构图目标位置' },
      { id: 'guide-line-tolerance-help', text: '红色虚线：允许偏差范围' }
    );
  }

  if (guideLineInfo.trackerRegion && guideLineInfo.trackerRegion.available !== false) {
    const trackerRegion = guideLineInfo.trackerRegion;
    const rect = trackerRegion.bboxNorm
      ? toNormalizedRect(trackerRegion.bboxNorm)
      : trackerRegion.bbox
        ? toSourceRect(trackerRegion.bbox)
        : null;
    if (rect) {
      overlays.push({
        id: 'guide-line-tracker-region',
        kind: 'box',
        tone: 'result',
        rect,
        sourceSize: guideLineInfo.frameSize,
        dashed: true,
        strokeWidth: 2.5
      });
      explanationRows.push({ id: 'guide-line-tracker-help', text: '绿色虚线框：追踪模块识别区域' });
    }
  }

  visibleGuideLines.forEach((guideLine, index) => {
    const normalizedPoints = guideLine.pointsNorm;
    const sourcePoints = guideLine.points;
    const points = normalizedPoints || sourcePoints;
    if (!points) return;
    const selected =
      guideLine.isAlignmentLine === true ||
      guideLine.id === guideLineInfo.selectedGuideLineId;
    overlays.push({
      id: `guide-line-${guideLine.id}-${index}`,
      kind: 'line',
      tone: selected ? 'result' : 'secondary',
      from: normalizedPoints ? toNormalizedPoint(points[0]) : toSourcePoint(points[0]),
      to: normalizedPoints ? toNormalizedPoint(points[1]) : toSourcePoint(points[1]),
      sourceSize: guideLineInfo.frameSize,
      showEndpoints: true,
      label: `L${guideLine.id}`,
      strokeWidth: 3
    });
  });

  if (visibleGuideLines.length > 0) {
    explanationRows.push({ id: 'guide-line-main-help', text: '绿色线 / 绿色圆点：对准线' });
  }
  if (
    latestGuideLineOptions.proEnabled &&
    latestGuideLineOptions.showOtherLines &&
    hasVisibleSecondaryGuideLines
  ) {
    explanationRows.push({ id: 'guide-line-secondary-help', text: '蓝色线 / 蓝色圆点：其他点线构图' });
  }

  const summaryRows: DisplayPanel['sections'][number]['rows'] = [
    { id: 'algo', label: '当前算法', value: currentAlgoLabel, tone: 'accent' },
    { id: 'status-code', label: '状态码', value: guideLineInfo.statusCode ?? '--' },
    {
      id: 'line-count',
      label: '识别线数',
      value: guideLineInfo.lineCount ?? guideLineInfo.guideLines.length
    }
  ];
  if (latestGuideLineOptions.proEnabled && !latestGuideLineOptions.showOtherLines) {
    summaryRows.push({
      id: 'visible-line-count',
      label: '当前展示线数',
      value: visibleGuideLines.length
    });
  }
  summaryRows.push({
    id: 'angles',
    label: '目标角度 / 当前角度',
    value: `${formatGuideDegree(targetGuideLineAngle)} / ${formatGuideDegree(currentGuideLineAngle)}`
  });
  if (guideLineInfo.resultUrl) {
    summaryRows.push({
      id: 'result-url',
      label: '结果图',
      href: guideLineInfo.resultUrl,
      hrefLabel: '查看结果'
    });
  }

  return {
    panel: {
      title: '分析结果和画面说明',
      sections: [
        {
          id: 'guide-line-summary',
          rows: summaryRows
        },
        ...(explanationRows.length > 0
          ? [
              {
                id: 'guide-line-help',
                title: '画面说明',
                rows: explanationRows,
                subtle: true
              }
            ]
          : [])
      ]
    },
    overlays,
    videoPrompts: [],
    viewportPrompts: []
  };
};

const parseShotRatioCellBounds = (value: string): { ratioMin: string; ratioMax: string } | null => {
  const normalized = value.trim().replace(/\s+/g, '');
  if (!normalized || normalized === '-') return null;

  const lessEqualMatch = normalized.match(/^<=?(\d+(?:\.\d+)?)%?$/);
  if (lessEqualMatch) {
    return { ratioMin: '0', ratioMax: lessEqualMatch[1] };
  }

  const greaterEqualMatch = normalized.match(/^>=?(\d+(?:\.\d+)?)%?$/);
  if (greaterEqualMatch) {
    return { ratioMin: greaterEqualMatch[1], ratioMax: greaterEqualMatch[1] };
  }

  const rangeMatch = normalized.match(/^(\d+(?:\.\d+)?)%?[-~](\d+(?:\.\d+)?)%?$/);
  if (rangeMatch) {
    return { ratioMin: rangeMatch[1], ratioMax: rangeMatch[2] };
  }

  const exactMatch = normalized.match(/^(\d+(?:\.\d+)?)%?$/);
  if (exactMatch) {
    return { ratioMin: exactMatch[1], ratioMax: exactMatch[1] };
  }

  return null;
};

const parseSubjectRatioScoreBounds = (value: string): { ratioMin: string; ratioMax: string } | null => {
  const normalized = value.trim().replace(/\s+/g, '');
  if (!normalized || normalized === '-') return null;

  const bracketMatch = normalized.match(/^[\(\[]?(\d+(?:\.\d+)?)%?,(\d+(?:\.\d+)?)%?[\]\)]?$/);
  if (bracketMatch) {
    return { ratioMin: bracketMatch[1], ratioMax: bracketMatch[2] };
  }

  const rangeMatch = normalized.match(/^(\d+(?:\.\d+)?)%?[-~](\d+(?:\.\d+)?)%?$/);
  if (rangeMatch) {
    return { ratioMin: rangeMatch[1], ratioMax: rangeMatch[2] };
  }

  return null;
};

type AlignmentPersonPayload = {
  type: 'alignment_person' | 'IBVS_ALGO';
  templateKey: string;
  streamUrl: string;
  scene: string;
  bodyRange: string;
  ratioMin: string;
  ratioMax: string;
  orientation: string;
  compositionMethod: string;
  compositionObject: string;
  structureLineAlignmentLine: string;
  structureLineAlignmentPoint: string;
  cameraHeight: string;
  eyeStatus: string;
  mouthStatus: string;
};

type GuideLineAlignmentOrientation = 'horizontal' | 'vertical';

type GuideLinePayload = {
  type: 'guide_line';
  templateKey: string;
  streamUrl: string;
  structureLineAlignmentLine: string;
  structureLineAlignmentPoint: string;
  guideLineVersion?: 'pro';
  proEnabled?: boolean;
  showOtherLines?: boolean;
  alignmentOrientation?: GuideLineAlignmentOrientation;
  alignmentPosition?: number;
  alignmentPositionToleranceRatio?: number;
  alignmentAngleToleranceDeg?: number;
};

const GUIDE_LINE_ALIGNMENT_BY_TEMPLATE_LINE: Record<
  string,
  {
    alignmentOrientation: GuideLineAlignmentOrientation;
    alignmentPosition: number;
  }
> = {
  H1: { alignmentOrientation: 'horizontal', alignmentPosition: 1 / 3 },
  H2: { alignmentOrientation: 'horizontal', alignmentPosition: 2 / 3 },
  水平中心: { alignmentOrientation: 'horizontal', alignmentPosition: 0.5 },
  V1: { alignmentOrientation: 'vertical', alignmentPosition: 1 / 3 },
  V2: { alignmentOrientation: 'vertical', alignmentPosition: 2 / 3 },
  竖直中心: { alignmentOrientation: 'vertical', alignmentPosition: 0.5 }
};

const getGuideLineAlignmentFromTemplateLine = (line: string) => {
  const normalizedLine = normalizeOptionValue(line);
  const alignment = GUIDE_LINE_ALIGNMENT_BY_TEMPLATE_LINE[normalizedLine];
  if (!alignment) {
    throw new Error(`当前模版的点线构图对准-线 ${line || '--'} 暂不支持`);
  }
  return alignment;
};

type StreamSourceOption = 'mobile' | 'drone';

const STREAM_SOURCE_OPTIONS: Array<{ value: StreamSourceOption; label: string }> = [
  { value: 'mobile', label: '手机' },
  { value: 'drone', label: '无人机' }
];

const DRONE_SPECTATOR_URL = 'http://localhost:1985/rtc/v1/whep/?app=live&stream=stream.flv';

const getStreamUrlBySource = (source: StreamSourceOption) =>
    source === 'drone'
        ? 'http://localhost:8080/live/stream.flv'
        : 'http://play.uiofield.top/live/stream.flv';

const parseAlignmentTemplateValue = (value: unknown): AlignmentTemplateValue | null => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }
  if (!source || typeof source !== 'object') return null;
  const obj = source as Record<string, unknown>;

  const fieldMap: Record<keyof AlignmentTemplateValue, string[]> = {
    bodyRange: ['bodyRange', 'body_range'],
    shotType: ['shotType', 'shot_type'],
    orientation: ['orientation'],
    compositionMethod: ['compositionMethod', 'composition_method'],
    compositionObject: ['compositionObject', 'composition_object'],
    structureLineAlignmentLine: ['structureLineAlignmentLine', 'structure_line_alignment_line'],
    structureLineAlignmentPoint: ['structureLineAlignmentPoint', 'structure_line_alignment_point'],
    cameraHeight: ['cameraHeight', 'camera_height'],
    eyeStatus: ['eyeStatus', 'eye_status'],
    mouthStatus: ['mouthStatus', 'mouth_status']
  };

  const next = {} as AlignmentTemplateValue;
  for (const key of Object.keys(fieldMap) as Array<keyof AlignmentTemplateValue>) {
    const rawValue = fieldMap[key]
      .map(alias => obj[alias])
      .find(value => typeof value === 'string');
    if (typeof rawValue !== 'string') {
      if (key === 'cameraHeight') {
        next[key] = intentTemplateOptions.cameraHeight[0] ?? '';
        continue;
      }
      if (key === 'compositionObject') {
        next[key] = intentTemplateOptions.compositionObject[1] ?? intentTemplateOptions.compositionObject[0] ?? '';
        continue;
      }
      if (key === 'structureLineAlignmentLine') {
        next[key] = intentTemplateOptions.structureLineAlignmentLine[0] ?? '';
        continue;
      }
      if (key === 'structureLineAlignmentPoint') {
        next[key] = intentTemplateOptions.structureLineAlignmentPoint[0] ?? '';
        continue;
      }
      return null;
    }
    const normalizedValue =
      key === 'compositionObject' ? normalizeCompositionObjectValue(rawValue) : normalizeOptionValue(rawValue);
    if (
      key === 'structureLineAlignmentLine' &&
      !(intentTemplateOptions.structureLineAlignmentLine as readonly string[]).includes(normalizedValue)
    ) {
      return null;
    }
    if (
      key === 'structureLineAlignmentPoint' &&
      !(intentTemplateOptions.structureLineAlignmentPoint as readonly string[]).includes(normalizedValue)
    ) {
      return null;
    }
    next[key] = normalizedValue;
  }
  return next;
};

const parseShotRatioConfig = (value: unknown): ShotRatioConfigItem[] => {
  let source = value;
  if (typeof source === 'string') {
    source = parseJsonSafely(source);
  }

  const items: ShotRatioConfigItem[] = [];
  if (!source || typeof source !== 'object') {
    return items;
  }

  const sourceEntries = Array.isArray(source) ? source : Object.entries(source).map(([scene, config]) => ({ [scene]: config }));

  sourceEntries.forEach(item => {
    if (!item || typeof item !== 'object') return;
    const entry = item as Record<string, unknown>;

    if (
      (typeof entry.scene === 'string' || typeof entry.scene === 'number') &&
      (typeof entry.range === 'string' || typeof entry.range === 'number')
    ) {
      items.push({
        scene: normalizeOptionValue(String(entry.scene)),
        range: normalizeOptionValue(String(entry.range)),
        ratioMin:
          typeof entry.ratioMin === 'number' || typeof entry.ratioMin === 'string'
            ? String(entry.ratioMin)
            : '',
        ratioMax:
          typeof entry.ratioMax === 'number' || typeof entry.ratioMax === 'string'
            ? String(entry.ratioMax)
            : ''
      });
      return;
    }

    const [sceneName, configValue] = Object.entries(entry)[0] || [];
    if (!sceneName || !configValue || typeof configValue !== 'object') return;
    const configObj = configValue as Record<string, unknown>;
    const matrixItems = Object.entries(configObj)
      .filter(([, cellValue]) => typeof cellValue === 'string')
      .map(([rangeName, cellValue]) => {
        const bounds = parseShotRatioCellBounds(cellValue as string);
        if (!bounds) return null;
        return {
          scene: normalizeOptionValue(sceneName),
          range: normalizeOptionValue(rangeName),
          ratioMin: bounds.ratioMin,
          ratioMax: bounds.ratioMax
        };
      })
      .filter((item): item is ShotRatioConfigItem => Boolean(item));
    if (matrixItems.length > 0) {
      items.push(...matrixItems);
      return;
    }

    items.push({
      scene: normalizeOptionValue(sceneName),
      range:
        typeof configObj.range === 'string'
          ? normalizeOptionValue(configObj.range)
          : typeof configObj['范围'] === 'string'
            ? normalizeOptionValue(configObj['范围'])
            : '',
      ratioMin:
        typeof configObj.ratioMin === 'number' || typeof configObj.ratioMin === 'string'
          ? String(configObj.ratioMin)
          : typeof configObj['比例min'] === 'number' || typeof configObj['比例min'] === 'string'
            ? String(configObj['比例min'])
            : '',
      ratioMax:
        typeof configObj.ratioMax === 'number' || typeof configObj.ratioMax === 'string'
          ? String(configObj.ratioMax)
          : typeof configObj['比例max'] === 'number' || typeof configObj['比例max'] === 'string'
            ? String(configObj['比例max'])
            : ''
    });
  });

  return items.filter(item => item.scene && item.range && item.ratioMin && item.ratioMax);
};

function LivePusher() {
  const ALIGNMENT_TEMPLATE_TYPE = 'intent_template';
  const SHOT_RATIO_CONFIG_TYPE = 'basic_config';
  const SHOT_RATIO_CONFIG_KEY = 'shot_subject_ratio_table';
  const SUBJECT_RATIO_SCORE_CONFIG_TYPE = 'basic_config';
  const SUBJECT_RATIO_SCORE_CONFIG_KEY = 'subject_ratio_score_table';
  const CONFIG_SERVER_BASE_URL = 'https://www.uiofield.top/config_server';
  const isRearCameraLabel = (label?: string) =>
      /back|rear|environment|后置|后摄|主摄/i.test(label || '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [error, setError] = useState('');
  const [streamStatus, setStreamStatus] = useState('未连接');
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [wsStatus, setWsStatus] = useState('未连接');
  const [messages, setMessages] = useState<string[]>([]);
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(false);
  const [isAnalysisPanelExpanded, setIsAnalysisPanelExpanded] = useState(true);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [activeMode, setActiveMode] = useState<ActiveMode>(null);
  const [spectatorFlvUrl, setSpectatorFlvUrl] = useState('http://localhost:1985/rtc/v1/whep/?app=live&stream=stream.flv');
  const [spectatorIsLive, setSpectatorIsLive] = useState(true);
  const [spectatorWithCredentials, setSpectatorWithCredentials] = useState(false);
  const [spectatorHasAudio, setSpectatorHasAudio] = useState(true);
  const [spectatorHasVideo, setSpectatorHasVideo] = useState(true);
  const [spectatorLogs, setSpectatorLogs] = useState<string[]>([]);
  const [controlDevice, setControlDevice] = useState<StreamSourceOption>('mobile');
  const [personCenterPosition, setPersonCenterPosition] = useState('双眼中心点');
  const [personCenterPositionOffsetPercent, setPersonCenterPositionOffsetPercent] = useState(3);
  const [currentStage, setCurrentStage] = useState('');
  const [currentStageCode, setCurrentStageCode] = useState('');
  const [alignmentRunCompleted, setAlignmentRunCompleted] = useState(false);
  const [alignmentTemplates, setAlignmentTemplates] = useState<AlignmentTemplateItem[]>([]);
  const [selectedAlignmentTemplateKey, setSelectedAlignmentTemplateKey] = useState('');
  const [alignmentTemplateLoading, setAlignmentTemplateLoading] = useState(false);
  const [alignmentError, setAlignmentError] = useState('');
  const [alignmentIbvsMode, setAlignmentIbvsMode] = useState(false);
  const [guideLineForm, setGuideLineForm] = useState({
    showOtherLines: true,
    alignmentPositionTolerancePercent: '5',
    alignmentAngleToleranceDeg: '5'
  });
  const [latestGuideLineOptions, setLatestGuideLineOptions] = useState({
    proEnabled: true,
    showOtherLines: true,
    alignmentOrientation: 'horizontal' as GuideLineAlignmentOrientation,
    alignmentPosition: 0.5,
    alignmentPositionToleranceRatio: 0.05,
    alignmentAngleToleranceDeg: 5
  });
  const [guideLineInfo, setGuideLineInfo] = useState<GuideLineInfo | null>(null);
  const [guideLineError, setGuideLineError] = useState('');
  const [controlPromptMap, setControlPromptMap] = useState<ControlPromptMap>({});
  const [renderAspect, setRenderAspect] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [rawInfo, setRawInfo] = useState<AlignmentRawInfo | null>(null);
  const [imageSearchInfo, setImageSearchInfo] = useState<ImageSearchInfo | null>(null);
  const [serverDisplay, setServerDisplay] = useState<LiveDisplayModel | null>(null);
  const [currentAlgoType, setCurrentAlgoType] = useState<AlgoType | null>(null);
  const [taskOffNotice, setTaskOffNotice] = useState(false);
  const taskOffTimerRef = useRef<number | null>(null);
  const notifyTimerRef = useRef<number | null>(null);
  const controlPromptTimersRef = useRef<Partial<Record<ControlPromptChannel, number>>>({});
  const videoWrapRef = useRef<HTMLDivElement | null>(null);
  const spectatorVideoRef = useRef<HTMLVideoElement | null>(null);
  const spectatorFlvPlayerRef = useRef<any>(null);
  const spectatorPcRef = useRef<RTCPeerConnection | null>(null);
  const currentAlgoTypeRef = useRef<AlgoType | null>(null);
  const alignmentRunCompletedRef = useRef(false);

  const showNotify = (text: string) => {
    if (!text) return;
    setNotifyMessage(text);
    if (notifyTimerRef.current) {
      window.clearTimeout(notifyTimerRef.current);
    }
    notifyTimerRef.current = window.setTimeout(() => {
      setNotifyMessage('');
    }, 2000);
  };

  const clearControlPromptTimer = (channel: ControlPromptChannel) => {
    const timer = controlPromptTimersRef.current[channel];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete controlPromptTimersRef.current[channel];
    }
  };

  const clearControlPrompts = () => {
    (Object.keys(controlPromptTimersRef.current) as ControlPromptChannel[]).forEach(clearControlPromptTimer);
    setControlPromptMap({});
  };

  const setControlPromptChannel = (channel: ControlPromptChannel, prompt: DisplayPrompt | null) => {
    clearControlPromptTimer(channel);
    if (!prompt) {
      setControlPromptMap(prev => {
        if (!prev[channel]) return prev;
        const next = { ...prev };
        delete next[channel];
        return next;
      });
      return;
    }

    setControlPromptMap(prev => ({
      ...prev,
      [channel]: prompt
    }));
    controlPromptTimersRef.current[channel] = window.setTimeout(() => {
      setControlPromptMap(prev => {
        if (!prev[channel]) return prev;
        const next = { ...prev };
        delete next[channel];
        return next;
      });
      delete controlPromptTimersRef.current[channel];
    }, CONTROL_PROMPT_TTL_MS);
  };

  const updateControlPromptFromValue = (
    channel: ControlPromptChannel,
    value: unknown,
    createPrompt: (value: number) => DisplayPrompt
  ) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    if (value === 0) return;
    setControlPromptChannel(channel, createPrompt(value));
  };

  useEffect(() => {
    alignmentRunCompletedRef.current = alignmentRunCompleted;
  }, [alignmentRunCompleted]);
  useEffect(() => {
    return () => {
      (Object.values(controlPromptTimersRef.current) as number[]).forEach(timer => {
        window.clearTimeout(timer);
      });
      controlPromptTimersRef.current = {};
    };
  }, []);
  const selectedAlignmentTemplate =
      alignmentTemplates.find(item => item.key === selectedAlignmentTemplateKey) || null;
  const currentAlgoLabel =
      currentAlgoType === 'upload_template'
          ? '以图搜景'
          : currentAlgoType === 'alignment_person'
              ? '对准-人'
              : currentAlgoType === 'guide_line'
                  ? '点线构图'
              : '未识别';
  const captureScrollTop = () => {
      const scrollingElement = document.scrollingElement;
      if (scrollingElement) {
        return scrollingElement.scrollTop;
      }
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  };
  const restoreScrollTop = (top: number) => {
      const apply = () => {
        const scrollingElement = document.scrollingElement;
        if (scrollingElement) {
          scrollingElement.scrollTop = top;
        }
        window.scrollTo({ top, behavior: 'auto' });
      };
      apply();
      window.requestAnimationFrame(apply);
      window.setTimeout(apply, 0);
  };
  const effectiveAlignmentCameraHeight =
      selectedAlignmentTemplate ? stripOptionCode(selectedAlignmentTemplate.value.cameraHeight) : '';
  const isActiveAlignmentRun =
      activeMode === 'alignment_person' &&
      currentAlgoType === 'alignment_person' &&
      !alignmentRunCompleted;
  const isHeightAlignmentStage =
      isActiveAlignmentRun &&
      (currentStage === '定高' || (currentStageCode ? /height/i.test(currentStageCode) : false));
  const isDistanceAlignmentStage =
      isActiveAlignmentRun &&
      (currentStage === '定距' || (currentStageCode ? /distance/i.test(currentStageCode) : false));
  const isCenterAlignmentStage =
      isActiveAlignmentRun &&
      (currentStage === '中心点对准' || (currentStageCode ? /center/i.test(currentStageCode) : false));
  const visibleGuideLines = guideLineInfo?.guideLines.filter(line =>
      !latestGuideLineOptions.proEnabled ||
      latestGuideLineOptions.showOtherLines ||
      line.isAlignmentLine
  ) || [];
  const hasVisibleSecondaryGuideLines = visibleGuideLines.some(line =>
      line.isAlignmentLine !== true &&
      line.id !== guideLineInfo?.selectedGuideLineId
  );
  const selectedGuideLine =
      guideLineInfo?.guideLines.find(line =>
        line.isAlignmentLine === true ||
        line.id === guideLineInfo.selectedGuideLineId
      ) || visibleGuideLines[0];
  const targetGuideLineAngle =
      guideLineInfo?.targetAngleDeg ??
      (latestGuideLineOptions.alignmentOrientation === 'vertical' ? 90 : 0);
  const currentGuideLineAngle =
      guideLineInfo?.currentAngleDeg ??
      getGuideLineSegmentAngleDeg(selectedGuideLine);
  const isDroneControl = controlDevice === 'drone';
  const controlSuggestions = CONTROL_PROMPT_CHANNELS
    .map(channel => controlPromptMap[channel])
    .filter((prompt): prompt is DisplayPrompt => Boolean(prompt));
  const localAlgorithmDisplay =
      currentAlgoType === 'alignment_person'
          ? buildAlignmentDisplayModel({
            currentAlgoLabel,
            currentStage,
            isActiveAlignmentRun,
            isHeightAlignmentStage,
            isDistanceAlignmentStage,
            isCenterAlignmentStage,
            rawInfo,
            sourceSize,
            effectiveAlignmentCameraHeight,
            personCenterPosition,
            personCenterPositionOffsetPercent
          })
          : activeMode === 'image_search' && currentAlgoType === 'upload_template'
            ? buildImageSearchDisplayModel(imageSearchInfo)
            : activeMode === 'guide_line' && currentAlgoType === 'guide_line'
              ? buildGuideLineDisplayModel({
                currentAlgoLabel,
                guideLineInfo,
                visibleGuideLines,
                hasVisibleSecondaryGuideLines,
                latestGuideLineOptions,
                targetGuideLineAngle,
                currentGuideLineAngle
              })
              : null;
  const algorithmDisplay = serverDisplay || localAlgorithmDisplay || createEmptyDisplayModel();
  const displayModel: LiveDisplayModel = {
    sourceSize: algorithmDisplay.sourceSize,
    panel: algorithmDisplay.panel,
    overlays: algorithmDisplay.overlays,
    videoPrompts: [
      ...algorithmDisplay.videoPrompts,
      ...controlSuggestions,
      ...(activeMode === 'alignment_person' && taskOffNotice
        ? [{
            id: 'alignment-task-started',
            text: '算法启动成功，开始识别中',
            placement: 'video-center' as const,
            tone: 'success' as const
          }]
        : [])
    ],
    viewportPrompts: [
      ...algorithmDisplay.viewportPrompts,
      ...(notifyMessage
        ? [{
            id: 'notify',
            text: notifyMessage,
            placement: 'viewport-center' as const,
            tone: 'toast' as const
          }]
        : [])
    ]
  };

  const pusherRef = useRef<any>(null);
  const deviceManagerRef = useRef<any>(null);
  // const localStreamRef = useRef<MediaStream | null>(null);

  const WS_SERVER = "wss://www.uiofield.top/meya/ws";
  const WEB_SERVER = "https://www.uiofield.top/meya/push"
  const PUSH_URL =
      'webrtc://226975.push.tlivecloud.com/live/stream?txSecret=62791f098ea16d00daa28f400468f262&txTime=6A433AFC';

  /** 浏览器兼容性检测 */
  // useEffect(() => {
  //   window.TXLivePusher.checkSupport().then((res: any) => {
  //     if (!res.isWebRTCSupported) {
  //       setError('当前浏览器不支持 WebRTC');
  //     }
  //   });
  useEffect(() => {
    const initDevices = async () => {
      try {
        // 1. 浏览器能力检测
        const res = await window.TXLivePusher.checkSupport();
        if (!res.isWebRTCSupported) {
          setError('当前浏览器不支持 WebRTC');
          return;
        }

        setStreamStatus('申请摄像头权限...');

        // 2. 主动申请权限（iOS 必须）
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        stream.getTracks().forEach(t => t.stop());

        // 3. 用「临时 pusher」只做设备枚举
        const tempPusher = new window.TXLivePusher();
        await enumerateDevices(tempPusher);

        setStreamStatus('未连接');
      } catch (e: any) {
        setError(e.message || '摄像头权限申请失败');
      }
    };

    initDevices();

    return () => {
      stopStream();
    };
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_SERVER);
    wsRef.current = ws;
    ws.onopen = () => {
      setWsStatus('已连接');

      // ❤️ 心跳：每 5 秒一次
      heartbeatRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }
      }, 5000);
    };

    // ws.onmessage = event => {
    //   setMessages(prev => [
    //     typeof event.data === 'string' ? event.data : JSON.stringify(event.data),
    //     ...prev
    //   ].slice(0, 10));
    // };
    ws.onmessage = event => {
      const normalizeMessage = (data: unknown) => {
        if (typeof data !== 'string') {
          return JSON.stringify(data);
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed?.type === 'notify' && typeof parsed?.message === 'string') {
            showNotify(parsed.message);
          }
          const nextDisplay = normalizeLiveDisplayPayload(parsed?.display);
          const incomingAlgoType: AlgoType | null =
              normalizeAlgoType(parsed?.algoType) ||
              normalizeAlgoType(parsed?.raw?.algoType) ||
              normalizeAlgoType(parsed?.type) ||
              (parsed?.type === 'guide_line_result' || parsed?.raw?.type === 'guide_line_result'
                  ? 'guide_line'
                  : null);
          if (incomingAlgoType && incomingAlgoType !== currentAlgoTypeRef.current) {
            // 算法类型切换时，清空上一轮展示
            setRawInfo(null);
            setImageSearchInfo(null);
            setGuideLineInfo(null);
            setServerDisplay(null);
            clearControlPrompts();
            setTaskOffNotice(false);
            setCurrentStage('');
            setCurrentStageCode('');
            alignmentRunCompletedRef.current = false;
            setAlignmentRunCompleted(false);
          }
          if (nextDisplay) {
            setServerDisplay(nextDisplay);
          }
          if (incomingAlgoType) {
            currentAlgoTypeRef.current = incomingAlgoType;
            setCurrentAlgoType(incomingAlgoType);
          }
          const effectiveAlgoType = incomingAlgoType || currentAlgoTypeRef.current;
          const isAlignmentDoneMessage =
              effectiveAlgoType === 'alignment_person' && parsed?.type === 'alignment_done';
          const shouldIgnoreCompletedAlignmentUpdate =
              effectiveAlgoType === 'alignment_person' &&
              alignmentRunCompletedRef.current &&
              !isAlignmentDoneMessage;

          if (effectiveAlgoType === 'alignment_person' && !isAlignmentDoneMessage && !shouldIgnoreCompletedAlignmentUpdate) {
            setAlignmentRunCompleted(false);
            alignmentRunCompletedRef.current = false;
            if (typeof parsed?.currentStage === 'string' && parsed.currentStage.trim()) {
              setCurrentStage(parsed.currentStage.trim());
            }
            if (typeof parsed?.currentStageCode === 'string' && parsed.currentStageCode.trim()) {
              setCurrentStageCode(parsed.currentStageCode.trim());
            }
          }

          if (isAlignmentDoneMessage) {
            setRawInfo(null);
            setImageSearchInfo(null);
            setServerDisplay(null);
            clearControlPrompts();
            setCurrentStage('');
            setCurrentStageCode('');
            alignmentRunCompletedRef.current = true;
            setAlignmentRunCompleted(true);
          }

          if (parsed?.command === 'task_off') {
            setTaskOffNotice(true);
            if (taskOffTimerRef.current) {
              window.clearTimeout(taskOffTimerRef.current);
            }
            taskOffTimerRef.current = window.setTimeout(() => {
              setTaskOffNotice(false);
            }, 1000);
          }
          if (!isAlignmentDoneMessage && !shouldIgnoreCompletedAlignmentUpdate && parsed?.command === 'move' && parsed?.param) {
            updateControlPromptFromValue('move-pitch', parsed.param.pitch, createMovePitchPrompt);
            updateControlPromptFromValue('move-roll', parsed.param.roll, createMoveRollPrompt);
          }

          if (!isAlignmentDoneMessage && !shouldIgnoreCompletedAlignmentUpdate && parsed?.command === 'adjust' && parsed?.param) {
            updateControlPromptFromValue('move-yaw', parsed.param.yaw, createMoveYawPrompt);
            updateControlPromptFromValue('move-throttle', parsed.param.throttle, createMoveThrottlePrompt);
          }

          if (!isAlignmentDoneMessage && !shouldIgnoreCompletedAlignmentUpdate && parsed?.command === 'gimbal_adjust' && parsed?.param) {
            const horizontal =
                typeof parsed.param.yaw === 'number'
                    ? parsed.param.yaw
                    : typeof parsed.param.roll === 'number'
                        ? parsed.param.roll
                        : undefined;
            const vertical =
                typeof parsed.param.throttle === 'number'
                    ? parsed.param.throttle
                    : typeof parsed.param.pitch === 'number'
                        ? parsed.param.pitch
                        : undefined;
            updateControlPromptFromValue('gimbal-horizontal', horizontal, createGimbalHorizontalPrompt);
            updateControlPromptFromValue('gimbal-vertical', vertical, createGimbalVerticalPrompt);
          }

          if (!isAlignmentDoneMessage && !shouldIgnoreCompletedAlignmentUpdate && parsed && parsed.type === 'move') {
            // 兼容旧协议（type=move, move/raw）
            if (parsed.move) {
              updateControlPromptFromValue('move-pitch', parsed.move.pitch, createMovePitchPrompt);
              updateControlPromptFromValue('move-roll', parsed.move.roll, createMoveRollPrompt);
              updateControlPromptFromValue('move-yaw', parsed.move.circle, createMoveYawPrompt);
            }
          }

          if (parsed?.raw) {
            if (
                effectiveAlgoType === 'upload_template' &&
                typeof parsed.raw?.statusCode === 'number' ||
                (effectiveAlgoType === 'upload_template' && parsed.raw?.targetInfo) ||
                (effectiveAlgoType === 'upload_template' && parsed.raw?.targetCenter)
            ) {
              const targetInfo = parsed.raw?.targetInfo || {};
              const leftTop = targetInfo.leftTop;
              const rightTop = targetInfo.rightTop;
              const rightBottom = targetInfo.rightBottom;
              const leftBottom = targetInfo.leftBottom || targetInfo.leftBotton;
              setImageSearchInfo({
                statusCode: parsed.raw?.statusCode,
                statusMessage: parsed.raw?.statusMessage,
                matchedPoints:
                    parsed.raw?.matchedPoints ?? targetInfo?.matchedPoints,
                quad:
                    Array.isArray(leftTop) &&
                    leftTop.length === 2 &&
                    Array.isArray(rightTop) &&
                    rightTop.length === 2 &&
                    Array.isArray(rightBottom) &&
                    rightBottom.length === 2 &&
                    Array.isArray(leftBottom) &&
                    leftBottom.length === 2
                        ? {
                          leftTop: [leftTop[0], leftTop[1]],
                          rightTop: [rightTop[0], rightTop[1]],
                          rightBottom: [rightBottom[0], rightBottom[1]],
                          leftBottom: [leftBottom[0], leftBottom[1]]
                        }
                        : undefined,
                targetCenter:
                    Array.isArray(parsed.raw?.targetCenter) &&
                    parsed.raw.targetCenter.length === 2
                        ? [parsed.raw.targetCenter[0], parsed.raw.targetCenter[1]]
                        : undefined
              });
            }

            if (effectiveAlgoType === 'alignment_person' && !isAlignmentDoneMessage && !shouldIgnoreCompletedAlignmentUpdate) {
              const nextRaw: {
                ratio?: number;
                bbox?: [number, number, number, number];
                centerPoint?: [number, number];
                heightReferencePoint?: [number, number];
                targetBox?: [number, number, number, number];
                compositionObjectBox?: [number, number, number, number];
                compositionObjectCenterPoint?: [number, number];
                compositionObjectName?: string;
                yaw?: number;
              } = {};

              if (typeof parsed.raw?.object?.ratio === 'number') {
                nextRaw.ratio = parsed.raw.object.ratio;
              }
              if (parsed.raw?.object?.bbox && Array.isArray(parsed.raw.object.bbox)) {
                const bbox = parsed.raw.object.bbox;
                if (bbox.length === 4) {
                  // bbox: [origin_x, origin_y, width, height]
                  nextRaw.bbox = [bbox[0], bbox[1], bbox[2], bbox[3]];
                }
              }
              if (
                  parsed.raw?.pose?.center_point &&
                  Array.isArray(parsed.raw.pose.center_point) &&
                  parsed.raw.pose.center_point.length === 2
              ) {
                nextRaw.centerPoint = [
                  parsed.raw.pose.center_point[0],
                  parsed.raw.pose.center_point[1]
                ];
              }
              const heightReferencePoint = getHeightReferencePoint(
                  parsed.raw?.pose,
                  effectiveAlignmentCameraHeight
              );
              if (heightReferencePoint) {
                nextRaw.heightReferencePoint = heightReferencePoint;
              } else if (nextRaw.centerPoint) {
                nextRaw.heightReferencePoint = nextRaw.centerPoint;
              }
              if (typeof parsed.raw?.head?.yaw === 'number') {
                nextRaw.yaw = parsed.raw.head.yaw;
              }
              if (parsed?.compositionOverlay && typeof parsed.compositionOverlay === 'object') {
                const targetCenter = parseOverlayPoint(parsed.compositionOverlay?.targetCircle?.center);
                const targetRadius =
                    typeof parsed.compositionOverlay?.targetCircle?.radius === 'number'
                        ? parsed.compositionOverlay.targetCircle.radius
                        : null;
                if (targetCenter && typeof targetRadius === 'number') {
                  nextRaw.targetBox = [
                    targetCenter[0] - targetRadius,
                    targetCenter[1] - targetRadius,
                    targetRadius * 2,
                    targetRadius * 2
                  ];
                }
                const compositionObjectBox = parseOverlayBox(parsed.compositionOverlay?.compositionObjectBox?.bbox);
                if (compositionObjectBox) {
                  nextRaw.compositionObjectBox = compositionObjectBox;
                }
                const compositionObjectCenterPoint = parseOverlayPoint(
                    parsed.compositionOverlay?.compositionObjectCenterPoint?.point
                );
                if (compositionObjectCenterPoint) {
                  nextRaw.compositionObjectCenterPoint = compositionObjectCenterPoint;
                }
                if (typeof parsed.compositionOverlay?.compositionObject === 'string') {
                  nextRaw.compositionObjectName = parsed.compositionOverlay.compositionObject;
                } else if (typeof parsed.compositionOverlay?.compositionObjectBox?.object === 'string') {
                  nextRaw.compositionObjectName = parsed.compositionOverlay.compositionObjectBox.object;
                }
              }

              if (Object.keys(nextRaw).length > 0) {
                setRawInfo(nextRaw);
              }
            }
          }

          if (effectiveAlgoType === 'guide_line' || parsed?.type === 'guide_line_result') {
            const rawGuideLineInfo = parseGuideLineResult(parsed.raw);
            const rootGuideLineInfo = parseGuideLineResult(parsed);
            const nextGuideLineInfo =
              rawGuideLineInfo && rootGuideLineInfo
                ? {
                  ...rootGuideLineInfo,
                  ...rawGuideLineInfo,
                  trackerRegion: rawGuideLineInfo.trackerRegion || rootGuideLineInfo.trackerRegion
                }
                : rawGuideLineInfo || rootGuideLineInfo;
            if (nextGuideLineInfo) {
              setGuideLineInfo(nextGuideLineInfo);
            }
          }
          return JSON.stringify(parsed);
        } catch {
          return data.replace(/\\u([\dA-Fa-f]{4})/g, (_, code) =>
              String.fromCharCode(parseInt(code, 16))
          );
        }
      };

      const msg = normalizeMessage(event.data);
      setMessages(prev => [msg, ...prev].slice(0, 10));
    };

    ws.onerror = () => {
      setWsStatus('连接异常');
    };

    ws.onclose = () => {
      setWsStatus('已断开');
    };

    return () => {
      // 清理
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      ws.close();
    };
  }, []);

  useEffect(() => {
    const container = document.getElementById('videoContainer');
    if (!container) return;

    const updateAspectFromEl = (el: HTMLVideoElement | HTMLCanvasElement) => {
      const width =
          el instanceof HTMLVideoElement ? el.videoWidth : el.width;
      const height =
          el instanceof HTMLVideoElement ? el.videoHeight : el.height;
      if (width > 0 && height > 0) {
        setRenderAspect(`${width} / ${height}`);
        setSourceSize({ width, height });
      }
    };

    const tryAttach = () => {
      const video = container.querySelector('video') as HTMLVideoElement | null;
      if (video) {
        const onMeta = () => updateAspectFromEl(video);
        video.addEventListener('loadedmetadata', onMeta);
        onMeta();
        return () => video.removeEventListener('loadedmetadata', onMeta);
      }

      const canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
      if (canvas) {
        updateAspectFromEl(canvas);
      }

      return () => {};
    };

    let detach = tryAttach();
    const observer = new MutationObserver(() => {
      detach();
      detach = tryAttach();
    });

    observer.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      detach();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (notifyTimerRef.current) {
        window.clearTimeout(notifyTimerRef.current);
      }
    };
  }, []);

  const loadAlignmentTemplates = async () => {
    setAlignmentTemplateLoading(true);
    setAlignmentError('');
    if (activeMode === 'guide_line') {
      setGuideLineError('');
    }
    try {
      const resp = await fetch(
          `${CONFIG_SERVER_BASE_URL}/kvs?type=${encodeURIComponent(ALIGNMENT_TEMPLATE_TYPE)}&t=${Date.now()}`,
          { cache: 'no-store' }
      );
      const text = await resp.text();
      const data = parseJsonSafely(text) as { items?: Array<{ key?: string; value?: unknown; updated_at?: number }> } | null;
      if (!resp.ok) {
        if (resp.status === 404) {
          setAlignmentTemplates([]);
          setSelectedAlignmentTemplateKey('');
          return;
        }
        throw new Error(`获取模版失败（HTTP ${resp.status}）`);
      }
      const parsedItems: AlignmentTemplateItem[] = [];
      if (Array.isArray(data?.items)) {
        data.items.forEach(item => {
          const key = typeof item.key === 'string' ? item.key : '';
          const parsedValue = parseAlignmentTemplateValue(item.value);
          if (!key || !parsedValue) return;
          parsedItems.push({
            key,
            value: parsedValue,
            updated_at: item.updated_at
          });
        });
      }
      parsedItems.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
      setAlignmentTemplates(parsedItems);
      setSelectedAlignmentTemplateKey(prev =>
          parsedItems.some(item => item.key === prev)
              ? prev
              : parsedItems[0]?.key || ''
      );
    } catch (err: any) {
      const message = err.message || '获取模版失败';
      if (activeMode === 'guide_line') {
        setGuideLineError(message);
      } else {
        setAlignmentError(message);
      }
    } finally {
      setAlignmentTemplateLoading(false);
    }
  };

  const loadShotRatioConfigs = async () => {
    const resp = await fetch(
      `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(SHOT_RATIO_CONFIG_TYPE)}&key=${encodeURIComponent(SHOT_RATIO_CONFIG_KEY)}&t=${Date.now()}`,
      { cache: 'no-store' }
    );
    const text = await resp.text();
    const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
    if (!resp.ok) {
      if (resp.status === 404) {
        return [] as ShotRatioConfigItem[];
      }
      throw new Error((data && typeof data.error === 'string' && data.error) || `获取景别与主体占比失败（HTTP ${resp.status}）`);
    }
    return parseShotRatioConfig(data?.value);
  };

  const parseSubjectRatioScoreConfigs = (value: unknown): SubjectRatioScoreConfigItem[] => {
    let source = value;
    if (typeof source === 'string') {
      source = parseJsonSafely(source);
    }

    const items: SubjectRatioScoreConfigItem[] = [];
    if (!source || typeof source !== 'object') {
      return items;
    }

    if (Array.isArray(source)) {
      source.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const entry = item as Record<string, unknown>;
        const scene =
          typeof entry.scene === 'string' || typeof entry.scene === 'number'
            ? normalizeOptionValue(String(entry.scene))
            : '';
        const range =
          typeof entry.range === 'string' || typeof entry.range === 'number'
            ? normalizeOptionValue(String(entry.range))
            : '';
        const ratioMin =
          typeof entry.min === 'number' || typeof entry.min === 'string'
            ? String(entry.min).trim()
            : typeof entry.ratioMin === 'number' || typeof entry.ratioMin === 'string'
              ? String(entry.ratioMin).trim()
              : '';
        const ratioMax =
          typeof entry.max === 'number' || typeof entry.max === 'string'
            ? String(entry.max).trim()
            : typeof entry.ratioMax === 'number' || typeof entry.ratioMax === 'string'
              ? String(entry.ratioMax).trim()
              : '';
        if (!scene || !range || !ratioMin || !ratioMax) return;
        items.push({ scene, range, ratioMin, ratioMax });
      });
      return items;
    }

    Object.entries(source).forEach(([sceneName, rangesValue]) => {
      if (!rangesValue || typeof rangesValue !== 'object') return;
      const rangesObj = rangesValue as Record<string, unknown>;
      Object.entries(rangesObj).forEach(([rangeName, cellValue]) => {
        if (typeof cellValue === 'string') {
          const bounds = parseSubjectRatioScoreBounds(cellValue);
          if (!bounds) return;
          items.push({
            scene: normalizeOptionValue(sceneName),
            range: normalizeOptionValue(rangeName),
            ratioMin: bounds.ratioMin,
            ratioMax: bounds.ratioMax
          });
          return;
        }

        if (!cellValue || typeof cellValue !== 'object') return;
        const cellObj = cellValue as Record<string, unknown>;
        const ratioMin =
          typeof cellObj.min === 'number' || typeof cellObj.min === 'string'
            ? String(cellObj.min).trim()
            : typeof cellObj.ratioMin === 'number' || typeof cellObj.ratioMin === 'string'
              ? String(cellObj.ratioMin).trim()
              : '';
        const ratioMax =
          typeof cellObj.max === 'number' || typeof cellObj.max === 'string'
            ? String(cellObj.max).trim()
            : typeof cellObj.ratioMax === 'number' || typeof cellObj.ratioMax === 'string'
              ? String(cellObj.ratioMax).trim()
              : '';
        if (!ratioMin || !ratioMax) return;
        items.push({
          scene: normalizeOptionValue(sceneName),
          range: normalizeOptionValue(rangeName),
          ratioMin,
          ratioMax
        });
      });
    });

    return items;
  };

  const loadSubjectRatioScoreConfigs = async () => {
    const resp = await fetch(
      `${CONFIG_SERVER_BASE_URL}/kv?type=${encodeURIComponent(SUBJECT_RATIO_SCORE_CONFIG_TYPE)}&key=${encodeURIComponent(SUBJECT_RATIO_SCORE_CONFIG_KEY)}&t=${Date.now()}`,
      { cache: 'no-store' }
    );
    const text = await resp.text();
    const data = parseJsonSafely(text) as { value?: unknown; error?: string } | null;
    if (!resp.ok) {
      if (resp.status === 404) {
        return [] as SubjectRatioScoreConfigItem[];
      }
      throw new Error((data && typeof data.error === 'string' && data.error) || `获取主体占比评价标准失败（HTTP ${resp.status}）`);
    }
    return parseSubjectRatioScoreConfigs(data?.value);
  };

  useEffect(() => {
    if (activeMode === 'alignment_person' || activeMode === 'guide_line') {
      void loadAlignmentTemplates();
    }
  }, [activeMode]);

  useEffect(() => {
    setServerDisplay(null);
    if (activeMode === 'alignment_person') return;
    setCurrentStage('');
    setCurrentStageCode('');
    alignmentRunCompletedRef.current = false;
    setAlignmentRunCompleted(false);
    clearControlPrompts();
  }, [activeMode]);

  useEffect(() => {
    const el = videoWrapRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const destroySpectatorFlvPlayer = () => {
    if (spectatorFlvPlayerRef.current) {
      try {
        spectatorFlvPlayerRef.current.pause();
      } catch {}
      try {
        spectatorFlvPlayerRef.current.unload();
      } catch {}
      try {
        spectatorFlvPlayerRef.current.detachMediaElement();
      } catch {}
      try {
        spectatorFlvPlayerRef.current.destroy();
      } catch {}
      spectatorFlvPlayerRef.current = null;
    }
  };

  const destroySpectatorWhepPlayer = () => {
    if (spectatorPcRef.current) {
      try {
        spectatorPcRef.current.close();
      } catch {}
      spectatorPcRef.current = null;
    }
  };

  const appendSpectatorLog = (line: string) => {
    const ts = new Date().toLocaleTimeString();
    setSpectatorLogs(prev => [`[${ts}] ${line}`, ...prev].slice(0, 80));
  };

  const loadFlvJs = (): Promise<any | null> => {
    if (window.flvjs) return Promise.resolve(window.flvjs);
    return new Promise(resolve => {
      const existing = document.getElementById('flvjs-script') as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve(window.flvjs || null), { once: true });
        existing.addEventListener('error', () => resolve(null), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.id = 'flvjs-script';
      script.src = 'https://cdn.jsdelivr.net/npm/flv.js@1.6.2/dist/flv.min.js';
      script.async = true;
      script.onload = () => resolve(window.flvjs || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  };

  const whepLoad = async (url: string) => {
    const video = spectatorVideoRef.current;
    if (!video) return false;
    destroySpectatorFlvPlayer();
    destroySpectatorWhepPlayer();
    video.removeAttribute('src');
    video.load();

    const pc = new RTCPeerConnection();
    spectatorPcRef.current = pc;
    const remoteStream = new MediaStream();
    video.srcObject = remoteStream;
    pc.ontrack = event => {
      event.streams[0]?.getTracks().forEach(track => {
        if (!remoteStream.getTracks().some(t => t.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
    };

    pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.addTransceiver('video', { direction: 'recvonly' });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise<void>(resolve => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const handler = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', handler);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', handler);
      setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', handler);
        resolve();
      }, 1500);
    });

    const answerResp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: pc.localDescription?.sdp || offer.sdp
    });
    if (!answerResp.ok) {
      throw new Error(`WHEP HTTP ${answerResp.status}`);
    }
    const answerSdp = await answerResp.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    appendSpectatorLog(`whep_load: ${url}`);
    return true;
  };

  const flvLoad = async () => {
    const video = spectatorVideoRef.current;
    if (!video) return false;
    if (!isDroneControl) return false;

    const targetUrl = DRONE_SPECTATOR_URL;
    const isWhep = /\/rtc\/v1\/whep\//.test(targetUrl);
    if (isWhep) {
      try {
        return await whepLoad(targetUrl);
      } catch (err) {
        appendSpectatorLog(`whep_error: ${String(err)}`);
        return false;
      }
    }

    const flvjs = await loadFlvJs();
    destroySpectatorFlvPlayer();
    destroySpectatorWhepPlayer();
    video.srcObject = null;
    video.removeAttribute('src');
    video.load();

    if (flvjs?.isSupported?.()) {
      const mediaDataSource = {
        type: 'flv',
        url: targetUrl,
        isLive: spectatorIsLive,
        withCredentials: spectatorWithCredentials,
        hasAudio: spectatorHasAudio,
        hasVideo: spectatorHasVideo
      };
      appendSpectatorLog(`flv_load: ${targetUrl}`);
      const player = flvjs.createPlayer(mediaDataSource, {
        enableWorker: false,
        lazyLoadMaxDuration: 3 * 60,
        seekType: 'range'
      });
      spectatorFlvPlayerRef.current = player;
      if (flvjs.Events?.ERROR) {
        player.on(flvjs.Events.ERROR, (errorType: string, errorDetail: string, errorInfo: unknown) => {
          appendSpectatorLog(`flv_error: ${errorType} / ${errorDetail} / ${JSON.stringify(errorInfo)}`);
        });
      }
      player.attachMediaElement(video);
      player.load();
      return true;
    }

    // flv.js 不可用时回退原生 video
    appendSpectatorLog(`flv.js 不可用，回退原生播放: ${targetUrl}`);
    video.src = targetUrl;
    return true;
  };

  const flvStart = async () => {
    const video = spectatorVideoRef.current;
    if (!video) return;
    await video.play().catch(() => {});
    appendSpectatorLog('flv_start');
  };

  const flvPause = () => {
    const video = spectatorVideoRef.current;
    if (!video) return;
    video.pause();
    appendSpectatorLog('flv_pause');
  };

  const flvDestroy = () => {
    const video = spectatorVideoRef.current;
    if (!video) return;
    destroySpectatorFlvPlayer();
    destroySpectatorWhepPlayer();
    video.pause();
    video.srcObject = null;
    video.removeAttribute('src');
    video.load();
    appendSpectatorLog('flv_destroy');
  };

  useEffect(() => {
    const video = spectatorVideoRef.current;
    if (!video) return;
    if (!isDroneControl || !isStreaming) {
      destroySpectatorFlvPlayer();
      destroySpectatorWhepPlayer();
      video.pause();
      return;
    }
    flvLoad();
  }, [isDroneControl, isStreaming]);

  const resetRenderView = () => {
    const container = document.getElementById('videoContainer');
    if (container) {
      container.innerHTML = ''; // ⭐ 关键：清空旧 video / canvas
    }
  };

  /**
   * 压缩图片（iOS 原图友好）
   * @param file 原始图片文件
   * @param maxSize 最大边长（默认 1280）
   * @param quality jpeg 质量（0~1，默认 0.7）
   */
  const compressImage = (
      file: File,
      maxSize = 1280,
      quality = 0.7
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const img = new Image();

        img.onload = () => {
          let { width, height } = img;

          // 等比缩放
          if (width > height && width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 不支持'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // ⭐ 强制转 jpeg（解决 iOS HEIC 问题）
          const compressedBase64 = canvas.toDataURL(
              'image/jpeg',
              quality
          );

          resolve(compressedBase64);
        };

        img.onerror = reject;
        img.src = reader.result as string;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUploadTemplate = () => {
    setImageSearchInfo(null);
    setServerDisplay(null);
    fileInputRef.current?.click();
  };

  const parseGuideLineNumberInput = (value: string, label: string) => {
    if (!value.trim()) {
      throw new Error(`${label}不能为空`);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${label}必须是有效数字`);
    }
    return parsed;
  };

  const handleSubmitGuideLine = async () => {
    setGuideLineError('');
    setGuideLineInfo(null);
    setServerDisplay(null);
    try {
      if (!selectedAlignmentTemplate) {
        throw new Error('请先选择模版');
      }

      const selectedTemplate = selectedAlignmentTemplate.value;
      const templateLineAlignment = getGuideLineAlignmentFromTemplateLine(
        selectedTemplate.structureLineAlignmentLine
      );
      const alignmentPositionTolerancePercent = parseGuideLineNumberInput(
        guideLineForm.alignmentPositionTolerancePercent,
        '位置容忍比例'
      );
      const alignmentAngleToleranceDeg = parseGuideLineNumberInput(
        guideLineForm.alignmentAngleToleranceDeg,
        '角度容忍度'
      );

      if (alignmentPositionTolerancePercent < 0 || alignmentPositionTolerancePercent > 100) {
        throw new Error('位置容忍比例需在 0~100% 之间');
      }
      if (alignmentAngleToleranceDeg < 0) {
        throw new Error('角度容忍度不能小于 0 度');
      }

      const alignmentPositionToleranceRatio = Number(
        (alignmentPositionTolerancePercent / 100).toFixed(6)
      );
      const requestBody: GuideLinePayload = {
        type: 'guide_line',
        templateKey: selectedAlignmentTemplate.key,
        streamUrl: getStreamUrlBySource(controlDevice),
        structureLineAlignmentLine: selectedTemplate.structureLineAlignmentLine,
        structureLineAlignmentPoint: selectedTemplate.structureLineAlignmentPoint,
        guideLineVersion: 'pro',
        proEnabled: true,
        showOtherLines: guideLineForm.showOtherLines,
        alignmentOrientation: templateLineAlignment.alignmentOrientation,
        alignmentPosition: templateLineAlignment.alignmentPosition,
        alignmentPositionToleranceRatio,
        alignmentAngleToleranceDeg
      };

      const response = await fetch(WEB_SERVER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        throw new Error(`提交失败（HTTP ${response.status}）`);
      }
      const nextGuideLineOptions = {
        proEnabled: true,
        showOtherLines: guideLineForm.showOtherLines,
        alignmentOrientation: templateLineAlignment.alignmentOrientation,
        alignmentPosition: templateLineAlignment.alignmentPosition,
        alignmentPositionToleranceRatio,
        alignmentAngleToleranceDeg
      };
      setLatestGuideLineOptions(nextGuideLineOptions);
      currentAlgoTypeRef.current = 'guide_line';
      setCurrentAlgoType('guide_line');
      setGuideLineInfo(prev =>
        prev || {
          guideLines: [],
          lineCount: 0,
          targetAngleDeg: nextGuideLineOptions.alignmentOrientation === 'vertical' ? 90 : 0
        }
      );
    } catch (err) {
      console.error('提交点线构图失败', err);
      setGuideLineError((err as Error).message || '提交失败');
    }
  };

  const saveBlobWithDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const saveCapturedPhoto = async (blob: Blob, filename: string) => {
    const ua = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    const isMacDesktop = /Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua);
    const isAbortError = (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err || '');
      const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name || '') : '';
      return name === 'AbortError' || /user aborted a request/i.test(message);
    };

    if (isMobile) {
      const shareFile = new File([blob], filename, { type: 'image/jpeg' });
      if (navigator.canShare?.({ files: [shareFile] }) && navigator.share) {
        try {
          await navigator.share({
            files: [shareFile],
            title: '保存照片'
          });
        } catch (err) {
          if (isAbortError(err)) return '';
          throw err;
        }
        return '已打开系统分享面板，请保存到相册';
      }
      saveBlobWithDownload(blob, filename);
      return '当前浏览器不支持直接写入相册，已触发下载';
    }

    const showSaveFilePicker = (window as any).showSaveFilePicker as
        | ((options?: Record<string, unknown>) => Promise<any>)
        | undefined;
    if (isMacDesktop && showSaveFilePicker) {
      let handle;
      try {
        handle = await showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'JPEG Image',
              accept: { 'image/jpeg': ['.jpg', '.jpeg'] }
            }
          ]
        });
      } catch (err) {
        if (isAbortError(err)) return '';
        throw err;
      }
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return '照片已保存';
    }

    saveBlobWithDownload(blob, filename);
    return '已触发下载保存';
  };

  const handleCapturePhoto = async () => {
    try {
      const container = document.getElementById('videoContainer');
      const video = container?.querySelector('video') as HTMLVideoElement | null;
      const canvasEl = container?.querySelector('canvas') as HTMLCanvasElement | null;
      const sourceWidth = video?.videoWidth || canvasEl?.width || 0;
      const sourceHeight = video?.videoHeight || canvasEl?.height || 0;

      if (!sourceWidth || !sourceHeight) {
        throw new Error('当前还没有可拍摄的画面');
      }

      const canvas = document.createElement('canvas');
      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 不支持');
      }

      if (video) {
        ctx.drawImage(video, 0, 0, sourceWidth, sourceHeight);
      } else if (canvasEl) {
        ctx.drawImage(canvasEl, 0, 0, sourceWidth, sourceHeight);
      }

      const filename = `capture-${Date.now()}.jpg`;
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(nextBlob => {
          if (!nextBlob) {
            reject(new Error('生成照片失败'));
            return;
          }
          resolve(nextBlob);
        }, 'image/jpeg', 0.7);
      });
      const saveMessage = await saveCapturedPhoto(blob, filename);
      if (saveMessage) {
        showNotify(saveMessage);
      }
    } catch (err) {
      console.error('拍照失败', err);
      showNotify((err as Error).message || '拍照失败');
    }
  };

  const handleSubmitAlignmentPerson = async () => {
    const scrollTopBeforeSubmit = captureScrollTop();
    setAlignmentError('');
    // 重新提交任务时清空画面提示
    setRawInfo(null);
    setServerDisplay(null);
    clearControlPrompts();
    setTaskOffNotice(false);
    setCurrentStage('');
    setCurrentStageCode('');
    alignmentRunCompletedRef.current = false;
    setAlignmentRunCompleted(false);
    restoreScrollTop(scrollTopBeforeSubmit);
    try {
      if (!selectedAlignmentTemplate) {
        throw new Error('请先选择模版');
      }

      const selectedTemplate = selectedAlignmentTemplate.value;
      const [shotRatioConfigs, subjectRatioScoreConfigs] = await Promise.all([
        loadShotRatioConfigs(),
        loadSubjectRatioScoreConfigs()
      ]);
      const matchedShotRatio = shotRatioConfigs.find(item => {
        const normalizedScene = normalizeOptionValue(item.scene);
        const normalizedRange = normalizeOptionValue(item.range);
        const selectedShotType = normalizeOptionValue(selectedTemplate.shotType);
        const selectedBodyRange = normalizeOptionValue(selectedTemplate.bodyRange);
        return (
          (normalizedScene === selectedShotType ||
            stripOptionCode(normalizedScene) === stripOptionCode(selectedShotType)) &&
          (normalizedRange === selectedBodyRange ||
            stripOptionCode(normalizedRange) === stripOptionCode(selectedBodyRange))
        );
      });

      if (!matchedShotRatio) {
        const fallbackShotRatio = shotRatioConfigs.find(item => {
          const normalizedScene = normalizeOptionValue(item.scene);
          const selectedShotType = normalizeOptionValue(selectedTemplate.shotType);
          return (
            normalizedScene === selectedShotType ||
            stripOptionCode(normalizedScene) === stripOptionCode(selectedShotType)
          );
        });

        if (!fallbackShotRatio) {
          throw new Error(`未找到景别类型 ${selectedTemplate.shotType} 对应的景别与主体占比配置`);
        }
        throw new Error(`未找到景别类型 ${selectedTemplate.shotType} 与身体范围 ${selectedTemplate.bodyRange} 对应的主体占比配置`);
      }

      const matchedSubjectRatioScore = subjectRatioScoreConfigs.find(item => {
        const normalizedScene = normalizeOptionValue(item.scene);
        const normalizedRange = normalizeOptionValue(item.range);
        const selectedShotType = normalizeOptionValue(selectedTemplate.shotType);
        const selectedBodyRange = normalizeOptionValue(selectedTemplate.bodyRange);
        return (
          (normalizedScene === selectedShotType ||
            stripOptionCode(normalizedScene) === stripOptionCode(selectedShotType)) &&
          (normalizedRange === selectedBodyRange ||
            stripOptionCode(normalizedRange) === stripOptionCode(selectedBodyRange))
        );
      });

      if (!matchedSubjectRatioScore) {
        const fallbackSubjectRatioScore = subjectRatioScoreConfigs.find(item => {
          const normalizedScene = normalizeOptionValue(item.scene);
          const selectedShotType = normalizeOptionValue(selectedTemplate.shotType);
          return (
            normalizedScene === selectedShotType ||
            stripOptionCode(normalizedScene) === stripOptionCode(selectedShotType)
          );
        });

        if (!fallbackSubjectRatioScore) {
          throw new Error(`未找到景别类型 ${selectedTemplate.shotType} 对应的主体占比评价标准`);
        }
        throw new Error(`未找到景别类型 ${selectedTemplate.shotType} 与身体范围 ${selectedTemplate.bodyRange} 对应的主体占比评价标准`);
      }

      const concreteScene = stripOptionCode(selectedTemplate.shotType);
      const concreteBodyRange = stripOptionCode(selectedTemplate.bodyRange);
      const concreteOrientation = stripOptionCode(selectedTemplate.orientation);
      const concreteCompositionMethod = stripOptionCode(selectedTemplate.compositionMethod);
      const concreteCameraHeight = stripOptionCode(selectedTemplate.cameraHeight);

      setPersonCenterPosition(selectedTemplate.compositionObject);
      setPersonCenterPositionOffsetPercent(3);

      const requestBody: AlignmentPersonPayload = {
        type: alignmentIbvsMode ? 'IBVS_ALGO' : 'alignment_person',
        templateKey: selectedAlignmentTemplate.key,
        streamUrl: getStreamUrlBySource(controlDevice),
        scene: concreteScene,
        bodyRange: concreteBodyRange,
        ratioMin: matchedSubjectRatioScore.ratioMin,
        ratioMax: matchedSubjectRatioScore.ratioMax,
        orientation: concreteOrientation,
        compositionMethod: concreteCompositionMethod,
        compositionObject: selectedTemplate.compositionObject,
        structureLineAlignmentLine: selectedTemplate.structureLineAlignmentLine,
        structureLineAlignmentPoint: selectedTemplate.structureLineAlignmentPoint,
        cameraHeight: concreteCameraHeight,
        eyeStatus: selectedTemplate.eyeStatus,
        mouthStatus: selectedTemplate.mouthStatus
      };

      const response = await fetch(WEB_SERVER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        throw new Error(`提交失败（HTTP ${response.status}）`);
      }
      restoreScrollTop(scrollTopBeforeSubmit);
    } catch (err) {
      console.error('提交对准-人失败', err);
      setAlignmentError((err as Error).message || '提交失败');
      restoreScrollTop(scrollTopBeforeSubmit);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // ⭐ iOS 原图压缩
      const compressedBase64 = await compressImage(
          file,
          1280, // 最大边
          0.7   // 质量
      );

      await fetch(WEB_SERVER, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'upload_template',
          filename: file.name.replace(/\.\w+$/, '.jpg'),
          contentType: 'image/jpeg',
          streamUrl: getStreamUrlBySource(controlDevice),
          data: compressedBase64
        })
      });
    } catch (err) {
      console.error('图片压缩或上传失败', err);
    }

    // 允许重复选择同一张
    e.target.value = '';
  };


  /** 获取设备列表 */
  const enumerateDevices = async (pusher: any) => {
    const deviceManager = pusher.getDeviceManager();
    deviceManagerRef.current = deviceManager;

    const list = await deviceManager.getDevicesList();
    const cameras: DeviceInfo[] = list
        .filter((d: any) => d.type === 'video')
        .map((d: any) => ({
          deviceId: d.deviceId,
          label: d.deviceName
        }));

    setDevices(cameras);

    // ⭐ 默认优先后置摄像头
    if (cameras.length) {
      const backCamera =
          cameras.find(c =>
              isRearCameraLabel(c.label)
          ) || cameras[0];
      setSelectedCamera(prev => prev || backCamera.deviceId);
    }
  };

  /** 开始推流 */
  const startStream = async () => {
    try {
      setError('');
      if (isDroneControl) {
        setStreamStatus('启动旁观模式...');
        resetRenderView();
        setRenderAspect(null);
        setIsStreaming(true);
        window.requestAnimationFrame(() => {
          void flvLoad().then(success => {
            setStreamStatus(success ? '旁观中' : '旁观启动失败');
          });
        });
        return;
      }

      setStreamStatus('初始化推流器...');

      // ⭐ 每次启动前，先清空渲染容器
      resetRenderView();

      const pusher = new window.TXLivePusher();
      pusherRef.current = pusher;

      pusher.setRenderView('videoContainer');
      pusher.videoView.muted = true;
      // const param = {
      //   videoResolutionMode: V2TXLiveVideoResolutionMode.v2TXLiveVideoResolutionModePortrait
      // };
      // pusher.setVideoQuality(param);
      pusher.setVideoQuality('480p');
      pusher.setProperty('setVideoFPS', 25);

      pusher.setObserver({
        onPushStatusUpdate: (_: number, msg: string) => {
          setStreamStatus(msg || '推流中');
        }
      });

      const isiOSDevice = /iP(hone|od|ad)/.test(navigator.userAgent);
      const backCamera =
          devices.find(c =>
              isRearCameraLabel(c.label)
          ) || devices[0];
      const targetCameraId = selectedCamera || backCamera?.deviceId;
      const targetCamera = devices.find(c => c.deviceId === targetCameraId);
      const useRearCamera = targetCamera ? isRearCameraLabel(targetCamera.label) : false;

      // iOS 上直接按朝向打开摄像头，避免先开前置再切后置导致黑屏
      if (isiOSDevice) {
        await pusher.startCamera(useRearCamera ? 'environment' : 'user');
      } else {
        await pusher.startCamera();
      }

      const defaultCameraId = devices[0]?.deviceId;

      if (!isiOSDevice && targetCameraId && targetCameraId !== defaultCameraId) {
        setStreamStatus('切换摄像头中...');
        await pusher.getDeviceManager().switchCamera(targetCameraId);
        await new Promise(resolve => setTimeout(resolve, 900));
      }

      setStreamStatus('推流连接中...');
      await pusher.startPush(PUSH_URL);

      setIsStreaming(true);
      setStreamStatus('直播中');
    } catch (e: any) {
      setError(e.message || '启动推流失败');
      setStreamStatus('未连接');
    }
  };

  /** 停止推流 */
  const stopStream = () => {
    const video = spectatorVideoRef.current;
    destroySpectatorFlvPlayer();
    destroySpectatorWhepPlayer();
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      video.load();
    }

    if (pusherRef.current) {
      try {
        pusherRef.current.stopPush();
        pusherRef.current.stopCamera();
      } catch {}
      pusherRef.current = null;
    }

    setIsStreaming(false);
    setStreamStatus('未连接');
    setRenderAspect(null);
    setActiveMode(null);
    setServerDisplay(null);

    // ⭐ 防止残留 DOM
    resetRenderView();
  };

  /** 摄像头开关 */
  const toggleCamera = async () => {
    if (!pusherRef.current) return;

    if (isCameraOn) {
      await pusherRef.current.stopCamera();
    } else {
      await pusherRef.current.startCamera();
    }

    setIsCameraOn(!isCameraOn);
  };

  const isIOS = () => {
    return /iP(hone|od|ad)/.test(navigator.userAgent);
  };


  return (
      <div className="min-h-screen bg-slate-900 px-4 pb-8 pt-4 sm:px-6 lg:pb-10 lg:pt-6">
        <DisplayPromptLayer prompts={displayModel.viewportPrompts} placement="viewport-center" />
        <div className="mx-auto max-w-4xl space-y-6">
          <h1 className="text-center text-[1.75rem] font-bold tracking-[0.08em] text-white sm:text-[1.9rem]">Meya</h1>

          <div
              className={`bg-black rounded-xl relative overflow-hidden ${
                renderAspect ? '' : 'min-h-[240px] sm:min-h-[320px] lg:min-h-[420px]'
              }`}
              style={renderAspect ? { aspectRatio: renderAspect } : undefined}
              ref={videoWrapRef}
          >
            <div id="videoContainer" className="w-full h-full" />
            <style>{`
              #videoContainer video,
              #videoContainer canvas {
                width: 100%;
                height: 100%;
                object-fit: cover;
              }
            `}</style>
            {isDroneControl && (
                <video
                    ref={spectatorVideoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    playsInline
                    muted
                    autoPlay
                    controls
                    onLoadedMetadata={e => {
                      const v = e.currentTarget;
                      if (v.videoWidth > 0 && v.videoHeight > 0) {
                        setRenderAspect(`${v.videoWidth} / ${v.videoHeight}`);
                        setSourceSize({ width: v.videoWidth, height: v.videoHeight });
                      }
                    }}
                />
            )}
            <AnalysisDisplayPanel
                panel={displayModel.panel}
                expanded={isAnalysisPanelExpanded}
                onToggle={() => setIsAnalysisPanelExpanded(prev => !prev)}
            />
            <DisplayOverlayLayer
                overlays={displayModel.overlays}
                containerSize={containerSize}
                sourceSize={displayModel.sourceSize || sourceSize}
            />
            {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                  <Video className="w-14 h-14" />
                </div>
            )}

            <DisplayPromptLayer prompts={displayModel.videoPrompts} placement="video-bottom" />
            <DisplayPromptLayer prompts={displayModel.videoPrompts} placement="video-center" />

            <button
                type="button"
                onClick={handleCapturePhoto}
                className="absolute bottom-3 right-3 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-white/25 text-white shadow-[0_8px_18px_rgba(15,23,42,0.22)] backdrop-blur-md transition hover:bg-white/35"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between text-white">
            <span>{!isStreaming && streamStatus === '未连接' ? '' : streamStatus}</span>

            <span
                className={`text-sm ${
                    wsStatus === '已连接' ? 'text-green-400' : 'text-yellow-400'
                }`}
            >
            WS：{wsStatus}
            </span>
            {isStreaming && (
                <span className={`flex items-center ${isDroneControl ? 'text-emerald-400' : 'text-red-500'}`}>
                    <Radio className="w-4 h-4 mr-1" /> {isDroneControl ? '旁观中' : '直播中'}
                  </span>
            )}
          </div>
          <div className="bg-slate-800 rounded-xl p-4 text-white">
            <div className="flex items-center justify-between">
              <div className="text-slate-300">指令控制台</div>
              <div className="flex items-center gap-2">
                <button
                    onClick={() => setMessages([])}
                    disabled={messages.length === 0}
                    className={`text-xs px-2 py-1 rounded ${
                        messages.length === 0
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : 'bg-slate-700 text-slate-200'
                    }`}
                >
                  清空
                </button>
                <button
                    onClick={() => setIsConsoleExpanded(prev => !prev)}
                    className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-200"
                >
                  {isConsoleExpanded ? '收起' : '展开'}
                </button>
              </div>
            </div>

            {isConsoleExpanded && (
                <div className="max-h-48 overflow-y-auto space-y-1 text-sm mt-2">
                  {messages.length === 0 && (
                      <div className="text-slate-500">暂无消息</div>
                  )}

                  {messages.map((msg, idx) => (
                      <div
                          key={idx}
                          className="bg-slate-700 rounded px-2 py-1 break-all"
                      >
                        {msg}
                      </div>
                  ))}
                </div>
            )}
          </div>

          <div className="bg-slate-800 rounded-xl p-4 text-white space-y-4">
            <div>
              <label className="text-slate-300 text-sm">控制设备</label>
              <select
                  disabled={isStreaming}
                  value={controlDevice}
                  onChange={e => {
                    setControlDevice(e.target.value as StreamSourceOption);
                    setActiveMode(null);
                  }}
                  className="w-full mt-2 bg-slate-900 text-white p-2 rounded"
              >
                {STREAM_SOURCE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                ))}
              </select>
            </div>

            <div className="flex space-x-3 items-center">
            {!isDroneControl && (
                <select
                    disabled={isStreaming}
                    value={selectedCamera}
                    onChange={e => setSelectedCamera(e.target.value)}
                    className="bg-slate-700 text-white p-3 rounded-xl"
                >
                  {devices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `摄像头 ${i + 1}`}
                      </option>
                  ))}
                </select>
            )}

            <button
                onClick={isStreaming ? stopStream : startStream}
                className={`flex-1 py-3 rounded-xl ${
                    isStreaming ? 'bg-red-500' : 'bg-blue-500'
                }`}
            >
              {isStreaming
                  ? (isDroneControl ? '停止旁观' : '停止推流')
                  : (isDroneControl ? '开始旁观' : '开始推流')}
            </button>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-4 text-white">
            <div className="text-slate-300 mb-3">模式</div>
            {!isStreaming ? (
                <div className="text-sm text-slate-400">
                  请先选择控制设备，然后点击{isDroneControl ? '“开始旁观”' : '“开始推流”'}，再选择算法模式。
                </div>
            ) : (
              <>
                <div className="flex space-x-3">
                  <button
                      onClick={() => setActiveMode('image_search')}
                      className={`px-4 py-2 rounded-xl ${
                          activeMode === 'image_search' ? 'bg-blue-500' : 'bg-slate-700'
                      }`}
                  >
                    以图搜景
                  </button>
                  <button
                      onClick={() => setActiveMode('alignment_person')}
                      className={`px-4 py-2 rounded-xl ${
                          activeMode === 'alignment_person'
                              ? 'bg-blue-500'
                              : 'bg-slate-700'
                      }`}
                  >
                    对准-人
                  </button>
                  <button
                      onClick={() => setActiveMode('guide_line')}
                      className={`px-4 py-2 rounded-xl ${
                          activeMode === 'guide_line'
                              ? 'bg-blue-500'
                              : 'bg-slate-700'
                      }`}
                  >
                    点线构图
                  </button>
                </div>
              </>
            )}

            {isStreaming && activeMode === 'image_search' && (
                <div className="mt-4 space-y-3">
                  <button
                      onClick={handleUploadTemplate}
                      className="w-full py-2 rounded-xl bg-slate-700 text-white"
                  >
                    以图搜景
                  </button>
                </div>
            )}

            {isStreaming && activeMode === 'alignment_person' && (
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 text-sm">选择模版</label>
                      <button
                          onClick={() => void loadAlignmentTemplates()}
                          disabled={alignmentTemplateLoading}
                          className={`px-2 py-1 text-xs rounded ${
                              alignmentTemplateLoading ? 'bg-slate-700' : 'bg-slate-600'
                          }`}
                      >
                        刷新
                      </button>
                    </div>
                    <select
                        value={selectedAlignmentTemplateKey}
                        onChange={e => setSelectedAlignmentTemplateKey(e.target.value)}
                        className="w-full mt-2 bg-slate-900 text-white p-2 rounded"
                    >
                      <option value="">请选择模版</option>
                      {alignmentTemplates.map(item => (
                          <option key={item.key} value={item.key}>
                            {item.key}
                          </option>
                      ))}
                    </select>
                    {selectedAlignmentTemplate && (
                        <div className="mt-2 text-xs text-slate-300 space-y-1">
                          <div>身体范围（A）：{selectedAlignmentTemplate.value.bodyRange}</div>
                          <div>景别类型（B）：{selectedAlignmentTemplate.value.shotType}</div>
                          <div>方位角（C）：{selectedAlignmentTemplate.value.orientation}</div>
                          <div>构图方法（D）：{selectedAlignmentTemplate.value.compositionMethod}</div>
                          <div>构图对象：{selectedAlignmentTemplate.value.compositionObject}</div>
                          <div>机位高度（E）：{selectedAlignmentTemplate.value.cameraHeight}</div>
                          <div>眼睛状态：{selectedAlignmentTemplate.value.eyeStatus}</div>
                          <div>嘴巴状态：{selectedAlignmentTemplate.value.mouthStatus}</div>
                          <div>点线构图对准-线：{selectedAlignmentTemplate.value.structureLineAlignmentLine}</div>
                          <div>点线构图对准-点：{selectedAlignmentTemplate.value.structureLineAlignmentPoint}</div>
                        </div>
                    )}
                  </div>

                  <label className="flex items-center gap-3 rounded bg-slate-900 px-3 py-3 text-sm text-white">
                    <input
                        type="checkbox"
                        checked={alignmentIbvsMode}
                        onChange={e => setAlignmentIbvsMode(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-500 bg-slate-800"
                    />
                    IBVS模式
                  </label>

                  <button
                      onClick={handleSubmitAlignmentPerson}
                      disabled={!selectedAlignmentTemplateKey || alignmentTemplateLoading}
                      className={`w-full py-2 rounded-xl text-white ${
                          !selectedAlignmentTemplateKey || alignmentTemplateLoading
                              ? 'bg-slate-600'
                              : 'bg-emerald-500'
                      }`}
                  >
                    提交
                  </button>

                  {alignmentError && (
                      <div className="text-red-400 text-sm">{alignmentError}</div>
                  )}
                </div>
            )}

            {isStreaming && activeMode === 'guide_line' && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-xl bg-slate-900/80 p-3 text-sm text-slate-300">
                    按当前直播流发起点线构图识别。目标线和目标点来自所选模版，可配置展示线条和容忍阈值。
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 text-sm">选择模版</label>
                      <button
                          onClick={() => void loadAlignmentTemplates()}
                          disabled={alignmentTemplateLoading}
                          className={`px-2 py-1 text-xs rounded ${
                              alignmentTemplateLoading ? 'bg-slate-700' : 'bg-slate-600'
                          }`}
                      >
                        刷新
                      </button>
                    </div>
                    <select
                        value={selectedAlignmentTemplateKey}
                        onChange={e => setSelectedAlignmentTemplateKey(e.target.value)}
                        className="w-full mt-2 bg-slate-900 text-white p-2 rounded"
                    >
                      <option value="">请选择模版</option>
                      {alignmentTemplates.map(item => (
                          <option key={item.key} value={item.key}>
                            {item.key}
                          </option>
                      ))}
                    </select>
                    {selectedAlignmentTemplate ? (
                        <div className="mt-2 text-xs text-slate-300 space-y-1">
                          <div>点线构图对准-线：{selectedAlignmentTemplate.value.structureLineAlignmentLine}</div>
                          <div>点线构图对准-点：{selectedAlignmentTemplate.value.structureLineAlignmentPoint}</div>
                        </div>
                    ) : (
                        <div className="mt-2 text-xs text-amber-300">
                          请先选择模版后再提交点线构图
                        </div>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-3 rounded bg-slate-900 px-3 py-3 text-sm text-white">
                      <input
                          type="checkbox"
                          checked={guideLineForm.showOtherLines}
                          onChange={e =>
                              setGuideLineForm(prev => ({
                                ...prev,
                                showOtherLines: e.target.checked
                              }))
                          }
                          className="h-4 w-4 rounded border-slate-500 bg-slate-800"
                      />
                      选择是否展示其他线条
                    </label>

                    <label className="flex flex-col gap-2 rounded bg-slate-900 px-3 py-3 text-sm text-white">
                      <span>位置容忍比例（%）</span>
                      <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          inputMode="decimal"
                          value={guideLineForm.alignmentPositionTolerancePercent}
                          onChange={e =>
                              setGuideLineForm(prev => ({
                                ...prev,
                                alignmentPositionTolerancePercent: e.target.value
                              }))
                          }
                          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      />
                    </label>

                    <label className="flex flex-col gap-2 rounded bg-slate-900 px-3 py-3 text-sm text-white">
                      <span>角度容忍度（度）</span>
                      <input
                          type="number"
                          min="0"
                          step="0.1"
                          inputMode="decimal"
                          value={guideLineForm.alignmentAngleToleranceDeg}
                          onChange={e =>
                              setGuideLineForm(prev => ({
                                ...prev,
                                alignmentAngleToleranceDeg: e.target.value
                              }))
                          }
                          className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                      />
                    </label>
                  </div>

                  <button
                      onClick={handleSubmitGuideLine}
                      disabled={!selectedAlignmentTemplate || alignmentTemplateLoading}
                      className={`w-full rounded-xl py-2 text-white ${
                          !selectedAlignmentTemplate || alignmentTemplateLoading
                              ? 'bg-slate-600'
                              : 'bg-emerald-500'
                      }`}
                  >
                    提交
                  </button>

                  {guideLineError && (
                      <div className="text-sm text-red-400">{guideLineError}</div>
                  )}
                </div>
            )}
          </div>

          {error && (
              <div className="text-red-400 text-sm">{error}</div>
          )}

          <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileChange}
          />
        </div>
      </div>
  );
}

export default LivePusher;
