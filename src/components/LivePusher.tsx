import { useState, useRef, useEffect } from 'react';
import { Camera, ChevronUp, ChevronDown, Radio, Video, VideoOff } from 'lucide-react';
import {
  intentTemplateOptions,
  normalizeCompositionObjectValue,
  normalizeOptionValue,
  stripOptionCode
} from '../shared/intentTemplateOptions';

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

const CENTER_ALIGNMENT_GUIDE_VIEWBOX = 300;

const CENTER_ALIGNMENT_GUIDE_TOP_LABELS = [
  { label: 'V0', x: 6, y: 10, anchor: 'start' as const, muted: false },
  { label: 'V1', x: 100, y: 10, anchor: 'middle' as const, muted: false },
  { label: 'V1.5', x: 150, y: 10, anchor: 'middle' as const, muted: true },
  { label: 'V2', x: 200, y: 10, anchor: 'middle' as const, muted: false },
  { label: 'V2.75', x: 275, y: 10, anchor: 'middle' as const, muted: true },
  { label: 'V3', x: 294, y: 10, anchor: 'end' as const, muted: false }
];

const CENTER_ALIGNMENT_GUIDE_LEFT_LABELS = [
  { label: 'H0', y: 6, percent: '', muted: false },
  { label: 'H0.5', y: 50, percent: '50%', muted: true },
  { label: 'H1', y: 100, percent: '', muted: false },
  { label: 'H1.33', y: 133, percent: '30%', muted: true },
  { label: 'H1.66', y: 166, percent: '', muted: true },
  { label: 'H2', y: 200, percent: '', muted: false },
  { label: 'H2.25', y: 225, percent: '25%', muted: true },
  { label: 'H2.5', y: 250, percent: '', muted: true },
  { label: 'H3', y: 294, percent: '', muted: false }
];

const CENTER_ALIGNMENT_GUIDE_POINTS = [
  { label: 'H0.5V1.5', x: 150, y: 50, dx: -8, dy: -10, anchor: 'end' as const },
  { label: 'H1V1', x: 100, y: 100, dx: -2, dy: -10, anchor: 'end' as const },
  { label: 'H1V2', x: 200, y: 100, dx: 2, dy: -10, anchor: 'start' as const },
  { label: 'H2V1', x: 100, y: 200, dx: -2, dy: -10, anchor: 'end' as const },
  { label: 'H2V2', x: 200, y: 200, dx: 2, dy: -10, anchor: 'start' as const },
  { label: 'H2.25V2.75', x: 275, y: 225, dx: -2, dy: 6, anchor: 'end' as const }
];

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

function CenterAlignmentGuideOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none select-none">
      <svg
        className="h-full w-full"
        viewBox={`0 0 ${CENTER_ALIGNMENT_GUIDE_VIEWBOX} ${CENTER_ALIGNMENT_GUIDE_VIEWBOX}`}
        preserveAspectRatio="none"
      >
        <rect
          x="0"
          y="0"
          width={CENTER_ALIGNMENT_GUIDE_VIEWBOX}
          height={CENTER_ALIGNMENT_GUIDE_VIEWBOX}
          fill="none"
          stroke="rgba(255,255,255,0.72)"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        />

        {[100, 200].map(x => (
          <line
            key={`solid-v-${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2={CENTER_ALIGNMENT_GUIDE_VIEWBOX}
            stroke="rgba(255,255,255,0.48)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {[100, 200].map(y => (
          <line
            key={`solid-h-${y}`}
            x1="0"
            y1={y}
            x2={CENTER_ALIGNMENT_GUIDE_VIEWBOX}
            y2={y}
            stroke="rgba(255,255,255,0.48)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {[150, 275].map(x => (
          <line
            key={`dash-v-${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2={CENTER_ALIGNMENT_GUIDE_VIEWBOX}
            stroke="rgba(255,255,255,0.34)"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {[50, 133, 166, 225, 250].map(y => (
          <line
            key={`dash-h-${y}`}
            x1="0"
            y1={y}
            x2={CENTER_ALIGNMENT_GUIDE_VIEWBOX}
            y2={y}
            stroke="rgba(255,255,255,0.34)"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {CENTER_ALIGNMENT_GUIDE_TOP_LABELS.map(item => (
          <text
            key={item.label}
            x={item.x}
            y={item.y}
            textAnchor={item.anchor}
            dominantBaseline="hanging"
            fontSize="9"
            fontWeight={item.muted ? '500' : '600'}
            fill={item.muted ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.86)'}
            paintOrder="stroke"
            stroke="rgba(15,23,42,0.82)"
            strokeWidth="1"
          >
            {item.label}
          </text>
        ))}

        {CENTER_ALIGNMENT_GUIDE_LEFT_LABELS.map(item => (
          <g key={item.label}>
            <text
              x="6"
              y={item.y}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize="9"
              fontWeight={item.muted ? '500' : '600'}
              fill={item.muted ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.86)'}
              paintOrder="stroke"
              stroke="rgba(15,23,42,0.82)"
              strokeWidth="1"
            >
              {item.label}
            </text>
            {item.percent ? (
              <text
                x="6"
                y={item.y + 7}
                textAnchor="start"
                dominantBaseline="middle"
                fontSize="6"
                fill="rgba(255,255,255,0.42)"
                paintOrder="stroke"
                stroke="rgba(15,23,42,0.82)"
                strokeWidth="0.8"
              >
                {item.percent}
              </text>
            ) : null}
          </g>
        ))}

        {CENTER_ALIGNMENT_GUIDE_POINTS.map(point => (
          <g key={point.label}>
            <circle
              cx={point.x}
              cy={point.y}
              r="1.75"
              fill="#7dd3fc"
              stroke="rgba(15,23,42,0.92)"
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={point.x + point.dx}
              y={point.y + point.dy}
              textAnchor={point.anchor}
              dominantBaseline="middle"
              fontSize="8"
              fill="rgba(255,255,255,0.86)"
              paintOrder="stroke"
              stroke="rgba(15,23,42,0.88)"
              strokeWidth="1"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function VerticalDirectionIcon({
  direction,
  className = 'w-10 h-10'
}: {
  direction: 'up' | 'down';
  className?: string;
}) {
  return direction === 'up' ? (
      <svg className={className} viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M511.879529 0L60.235294 477.906824l290.514824-0.120471 0.783058 545.731765 321.355295 0.481882V477.786353L963.764706 478.027294 511.879529 0z"
            fill="#46bc4e"
        />
      </svg>
  ) : (
      <svg className={className} viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M512.120471 1024L963.764706 546.093176l-290.514824 0.120471-0.783058-545.731765L351.111529 0v546.213647L60.235294 545.972706 512.120471 1024z"
            fill="#46bc4e"
        />
      </svg>
  );
}

function HorizontalDirectionIcon({
  direction,
  className = 'w-10 h-10'
}: {
  direction: 'left' | 'right';
  className?: string;
}) {
  return direction === 'left' ? (
      <svg className={className} viewBox="0 0 1137 1024" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M1051.648 728.860444H552.732444v265.936593a61.591704 61.591704 0 0 1-87.115851 0.113778l-0.113778-0.113778-436.148148-439.333926a62.65363 62.65363 0 0 1 0-88.026074L465.464889 28.48237a60.946963 60.946963 0 0 1 86.167704-1.061926l1.061926 1.061926v265.519408h498.953481c40.997926 0 74.258963 33.261037 74.258963 74.258963v286.34074a74.221037 74.221037 0 0 1-74.258963 74.258963z"
            fill="#46bc4e"
        />
      </svg>
  ) : (
      <svg className={className} viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M997.052632 512L458.105263 0v323.368421H26.947368v377.263158h431.157895v323.368421l538.947369-512z"
            fill="#46bc4e"
        />
        <path
            d="M929.738105 512l-431.157894-404.210526v260.473263l-430.618948 0.377263-0.538947 287.312842 431.157895-2.479158V916.210526l431.157894-404.210526z"
            fill="#46bc4e"
        />
      </svg>
  );
}

function RotateDirectionIcon({
  direction,
  className = 'w-8 h-8'
}: {
  direction: 'clockwise' | 'counterclockwise';
  className?: string;
}) {
  return direction === 'clockwise' ? (
      <svg className={className} viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M846.7456 272.3328L808.0384 128l-40.5504 70.2976A405.9648 405.9648 0 0 0 563.2 142.4384a409.6 409.6 0 0 0-173.1584 780.9024 25.6 25.6 0 1 0 21.76-46.1824 358.4 358.4 0 0 1 151.5008-683.3152 355.2768 355.2768 0 0 1 178.7392 48.8448l-39.5264 68.5056z"
            fill="#46bc4e"
            opacity=".2"
        />
        <path
            d="M846.7456 246.784l-38.7072-144.3328-40.5504 70.2976A405.9648 405.9648 0 0 0 563.2 116.8896a409.6 409.6 0 0 0-173.1584 780.9024 25.6 25.6 0 1 0 21.76-46.1824 358.4 358.4 0 0 1 151.5008-683.3152 355.2768 355.2768 0 0 1 178.7392 48.8448l-39.5264 68.5056z"
            fill="#46bc4e"
        />
      </svg>
  ) : (
      <svg className={className} viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M153.6 272.3328L192.256 128l40.6016 70.2976a405.76 405.76 0 0 1 204.2368-55.8592 409.6 409.6 0 0 1 173.2096 780.9024 25.6 25.6 0 1 1-21.6576-46.3872 358.4 358.4 0 0 0-151.552-683.3152 355.2768 355.2768 0 0 0-178.7392 48.8448l39.5776 68.5056z"
            fill="#46bc4e"
            opacity=".2"
        />
        <path
            d="M153.6 246.784l38.656-144.3328 40.6016 70.2976a405.76 405.76 0 0 1 204.2368-55.8592 409.6 409.6 0 0 1 173.2096 780.9024 25.6 25.6 0 1 1-21.6576-46.3872 358.4 358.4 0 0 0-151.552-683.3152 355.2768 355.2768 0 0 0-178.7392 48.8448l39.5776 68.5056z"
            fill="#46bc4e"
        />
      </svg>
  );
}

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
  type: 'alignment_person';
  templateKey: string;
  streamUrl: string;
  scene: string;
  bodyRange: string;
  ratioMin: string;
  ratioMax: string;
  orientation: string;
  compositionMethod: string;
  compositionObject: string;
  cameraHeight: string;
  eyeStatus: string;
  mouthStatus: string;
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
      return null;
    }
    next[key] = key === 'compositionObject' ? normalizeCompositionObjectValue(rawValue) : normalizeOptionValue(rawValue);
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
  type AlgoType = 'upload_template' | 'alignment_person';
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
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(true);
  const [isAnalysisPanelExpanded, setIsAnalysisPanelExpanded] = useState(true);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [activeMode, setActiveMode] = useState<'image_search' | 'alignment_person' | null>(null);
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
  const [moveGuide, setMoveGuide] = useState<{
    pitch?: number;
    roll?: number;
    yaw?: number;
    throttle?: number;
  } | null>(null);
  const [gimbalGuide, setGimbalGuide] = useState<{
    horizontal?: number;
    vertical?: number;
  } | null>(null);
  const [renderAspect, setRenderAspect] = useState<string | null>(null);
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number } | null>(null);
  const [rawInfo, setRawInfo] = useState<{
    ratio?: number;
    bbox?: [number, number, number, number];
    centerPoint?: [number, number];
    heightReferencePoint?: [number, number];
    targetBox?: [number, number, number, number];
    compositionObjectBox?: [number, number, number, number];
    compositionObjectCenterPoint?: [number, number];
    compositionObjectName?: string;
    yaw?: number;
  } | null>(null);
  const [imageSearchInfo, setImageSearchInfo] = useState<{
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
  } | null>(null);
  const [currentAlgoType, setCurrentAlgoType] = useState<AlgoType | null>(null);
  const [taskOffNotice, setTaskOffNotice] = useState(false);
  const taskOffTimerRef = useRef<number | null>(null);
  const notifyTimerRef = useRef<number | null>(null);
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
  useEffect(() => {
    alignmentRunCompletedRef.current = alignmentRunCompleted;
  }, [alignmentRunCompleted]);
  const selectedAlignmentTemplate =
      alignmentTemplates.find(item => item.key === selectedAlignmentTemplateKey) || null;
  const currentAlgoLabel =
      currentAlgoType === 'upload_template'
          ? '以图搜景'
          : currentAlgoType === 'alignment_person'
              ? '对准-人'
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
  const hasAlignmentAnalysis =
      Boolean(rawInfo?.bbox) ||
      Boolean(rawInfo?.centerPoint) ||
      Boolean(rawInfo?.targetBox) ||
      Boolean(rawInfo?.compositionObjectBox) ||
      Boolean(rawInfo?.compositionObjectCenterPoint) ||
      rawInfo?.ratio !== undefined ||
      rawInfo?.yaw !== undefined;
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
  const shouldShowAnalysisPanel =
      (isActiveAlignmentRun &&
        (Boolean(currentStage) || hasAlignmentAnalysis)) ||
      (activeMode === 'image_search' &&
        currentAlgoType === 'upload_template' &&
        Boolean(imageSearchInfo));
  const shouldShowCenterAlignmentGuide = isCenterAlignmentStage;
  const shouldShowHeightRangeGuide = isHeightAlignmentStage;
  const shouldShowPersonBoundingBox = isDistanceAlignmentStage;
  const shouldShowCenterPointMarkers = isCenterAlignmentStage;
  const shouldShowCompositionOverlay =
      shouldShowCenterPointMarkers &&
      (Boolean(rawInfo?.targetBox) ||
        Boolean(rawInfo?.compositionObjectBox) ||
        Boolean(rawInfo?.compositionObjectCenterPoint));
  const isDroneControl = controlDevice === 'drone';
  const movementSuggestions: Array<{ key: string; label: string; icon: JSX.Element }> = [];
  if (moveGuide?.pitch !== undefined && moveGuide.pitch !== 0) {
    movementSuggestions.push({
      key: 'pitch',
      label: moveGuide.pitch > 0 ? '向前' : '向后',
      icon: <VerticalDirectionIcon direction={moveGuide.pitch > 0 ? 'up' : 'down'} />
    });
  }
  if (moveGuide?.roll !== undefined && moveGuide.roll !== 0) {
    movementSuggestions.push({
      key: 'roll',
      label: moveGuide.roll > 0 ? '向右' : '向左',
      icon: <HorizontalDirectionIcon direction={moveGuide.roll > 0 ? 'right' : 'left'} />
    });
  }
  if (moveGuide?.yaw !== undefined && moveGuide.yaw !== 0) {
    movementSuggestions.push({
      key: 'yaw',
      label: moveGuide.yaw > 0 ? '顺时针转' : '逆时针转',
      icon: <RotateDirectionIcon direction={moveGuide.yaw > 0 ? 'clockwise' : 'counterclockwise'} />
    });
  }
  if (moveGuide?.throttle !== undefined && moveGuide.throttle !== 0) {
    movementSuggestions.push({
      key: 'throttle',
      label: moveGuide.throttle > 0 ? '向上' : '向下',
      icon: <VerticalDirectionIcon direction={moveGuide.throttle > 0 ? 'up' : 'down'} />
    });
  }
  const gimbalSuggestions: Array<{ key: string; label: string; icon: JSX.Element }> = [];
  if (gimbalGuide?.vertical !== undefined && gimbalGuide.vertical !== 0) {
    gimbalSuggestions.push({
      key: 'gimbal-vertical',
      label: gimbalGuide.vertical > 0 ? '云台调整-上' : '云台调整-下',
      icon: <VerticalDirectionIcon direction={gimbalGuide.vertical > 0 ? 'up' : 'down'} />
    });
  }
  if (gimbalGuide?.horizontal !== undefined && gimbalGuide.horizontal !== 0) {
    gimbalSuggestions.push({
      key: 'gimbal-horizontal',
      label: gimbalGuide.horizontal > 0 ? '云台调整-右' : '云台调整-左',
      icon: <HorizontalDirectionIcon direction={gimbalGuide.horizontal > 0 ? 'right' : 'left'} />
    });
  }
  const controlSuggestions = [...movementSuggestions, ...gimbalSuggestions];

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
          const incomingAlgoType: AlgoType | null =
              parsed?.algoType === 'upload_template' || parsed?.algoType === 'alignment_person'
                  ? parsed.algoType
                  : null;
          if (incomingAlgoType && incomingAlgoType !== currentAlgoTypeRef.current) {
            // 算法类型切换时，清空上一轮展示
            setRawInfo(null);
            setImageSearchInfo(null);
            setMoveGuide(null);
            setGimbalGuide(null);
            setTaskOffNotice(false);
            setCurrentStage('');
            setCurrentStageCode('');
            alignmentRunCompletedRef.current = false;
            setAlignmentRunCompleted(false);
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
            setMoveGuide(null);
            setGimbalGuide(null);
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
            setMoveGuide({
              pitch: parsed.param.pitch,
              roll: parsed.param.roll,
              yaw: undefined,
              throttle: undefined
            });
          }

          if (!isAlignmentDoneMessage && !shouldIgnoreCompletedAlignmentUpdate && parsed?.command === 'adjust' && parsed?.param) {
            setMoveGuide({
              pitch: undefined,
              roll: undefined,
              yaw: parsed.param.yaw,
              throttle: parsed.param.throttle
            });
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
            setGimbalGuide({
              horizontal,
              vertical
            });
          }

          if (!isAlignmentDoneMessage && !shouldIgnoreCompletedAlignmentUpdate && parsed && parsed.type === 'move') {
            // 兼容旧协议（type=move, move/raw）
            if (parsed.move) {
              setMoveGuide(prev => ({
                ...(prev || {}),
                pitch: parsed.move.pitch,
                roll: parsed.move.roll,
                yaw: parsed.move.circle
              }));
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
      setAlignmentError(err.message || '获取模版失败');
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
    if (activeMode === 'alignment_person') {
      void loadAlignmentTemplates();
    }
  }, [activeMode]);

  useEffect(() => {
    if (activeMode === 'alignment_person') return;
    setCurrentStage('');
    setCurrentStageCode('');
    alignmentRunCompletedRef.current = false;
    setAlignmentRunCompleted(false);
    setGimbalGuide(null);
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
    fileInputRef.current?.click();
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
    setMoveGuide(null);
    setGimbalGuide(null);
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
        type: 'alignment_person',
        templateKey: selectedAlignmentTemplate.key,
        streamUrl: getStreamUrlBySource(controlDevice),
        scene: concreteScene,
        bodyRange: concreteBodyRange,
        ratioMin: matchedSubjectRatioScore.ratioMin,
        ratioMax: matchedSubjectRatioScore.ratioMax,
        orientation: concreteOrientation,
        compositionMethod: concreteCompositionMethod,
        compositionObject: selectedTemplate.compositionObject,
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
    const cameras = list
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
        {notifyMessage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="max-w-[80vw] rounded-xl bg-black/75 px-6 py-3 text-lg font-semibold text-white">
                {notifyMessage}
              </div>
            </div>
        )}
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
            {shouldShowAnalysisPanel && (
                <div className="absolute right-3 top-3 z-20 max-w-[min(78vw,320px)] text-xs text-white">
                  <div className="rounded-xl bg-black/60 backdrop-blur-md shadow-[0_8px_24px_rgba(15,23,42,0.28)]">
                    <button
                        type="button"
                        onClick={() => setIsAnalysisPanelExpanded(prev => !prev)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                    >
                      <span className="font-medium">分析结果和画面说明</span>
                      {isAnalysisPanelExpanded ? (
                          <ChevronUp className="h-4 w-4 shrink-0" />
                      ) : (
                          <ChevronDown className="h-4 w-4 shrink-0" />
                      )}
                    </button>
                    {isAnalysisPanelExpanded && (
                        <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-2">
                          {currentAlgoType === 'alignment_person' && (
                              <>
                                <div className="rounded bg-black/35 px-2 py-1">
                                  当前算法：
                                  <span className="ml-1 font-medium text-sky-200">{currentAlgoLabel}</span>
                                </div>
                                <div className="rounded bg-black/35 px-2 py-1">
                                  当前算法阶段：
                                  <span className="ml-1 font-medium text-sky-200">{currentStage || '--'}</span>
                                </div>
                                <div className="rounded bg-black/35 px-2 py-1">
                                  人体占比：
                                  {rawInfo?.ratio !== undefined
                                      ? `${(rawInfo.ratio * 100).toFixed(2)}%`
                                      : '--'}
                                  <span className="ml-2">
                                    人脸相对镜头偏移角度：
                                    {rawInfo?.yaw !== undefined
                                        ? `${rawInfo.yaw.toFixed(2)}°`
                                        : '--'}
                                  </span>
                                </div>
                                {shouldShowPersonBoundingBox ? (
                                  <div className="rounded bg-black/35 px-2 py-1 space-y-1">
                                    <div className="font-medium">画面说明</div>
                                    <div>绿色框：当前识别到的人体范围</div>
                                  </div>
                                ) : null}
                                {shouldShowHeightRangeGuide ? (
                                  <div className="rounded bg-black/35 px-2 py-1 space-y-1">
                                    <div className="font-medium">画面说明</div>
                                    <div>红色虚线：以画面中心为基准的定高范围</div>
                                    <div>绿色线：当前人物的{effectiveAlignmentCameraHeight || '--'}位置</div>
                                  </div>
                                ) : null}
                                {shouldShowCenterPointMarkers ? (
                                  <div className="rounded bg-black/35 px-2 py-1 space-y-1">
                                    <div className="font-medium">画面说明</div>
                                    {shouldShowCompositionOverlay ? (
                                      <>
                                        <div>红色框：构图对象中心点需要到达的位置</div>
                                        <div>绿色框：构图对象（{rawInfo?.compositionObjectName || personCenterPosition}）</div>
                                        <div>绿色点：构图对象中心点</div>
                                      </>
                                    ) : (
                                      <>
                                        <div>绿色点：人像-{personCenterPosition}的中心点</div>
                                        <div>红色点 + 红色圆：画面中心与居中偏差范围（{personCenterPositionOffsetPercent}%）</div>
                                      </>
                                    )}
                                  </div>
                                ) : null}
                              </>
                          )}
                          {currentAlgoType === 'upload_template' && imageSearchInfo && (
                              <div className="rounded bg-black/35 px-2 py-1 space-y-1">
                                <div>
                                  定位状态：
                                  {imageSearchInfo.statusCode === 201
                                      ? '发现目标'
                                      : imageSearchInfo.statusCode === 202
                                          ? '定位成功'
                                          : imageSearchInfo.statusCode === 203
                                              ? '未发现目标'
                                              : '--'}
                                </div>
                                <div>状态码：{imageSearchInfo.statusCode ?? '--'}</div>
                                <div>匹配点：{imageSearchInfo.matchedPoints ?? '--'}</div>
                                {imageSearchInfo.statusMessage && <div>说明：{imageSearchInfo.statusMessage}</div>}
                              </div>
                          )}
                        </div>
                    )}
                  </div>
                </div>
            )}

            {shouldShowCenterAlignmentGuide && <CenterAlignmentGuideOverlay />}

            {(currentAlgoType === 'alignment_person') &&
                hasAlignmentAnalysis &&
                sourceSize &&
                containerSize && (
                <div className="absolute inset-0 pointer-events-none">
                  {(() => {
                    const scaleX = containerSize.width / sourceSize.width;
                    const scaleY = containerSize.height / sourceSize.height;
                    return (
                        <>
                          {shouldShowPersonBoundingBox && rawInfo.bbox && (() => {
                            const [originX, originY, boxWidth, boxHeight] = rawInfo.bbox!;
                            const left = originX * scaleX;
                            const top = originY * scaleY;
                            const width = boxWidth * scaleX;
                            const height = boxHeight * scaleY;
                            return (
                                <div
                                    className="absolute border-2 border-emerald-400"
                                    style={{
                                      left,
                                      top,
                                      width,
                                      height
                                    }}
                                />
                            );
                          })()}
                          {shouldShowHeightRangeGuide && (() => {
                            const centerY = containerSize.height / 2;
                            const bandHalfHeight = Math.max(
                                containerSize.height * HEIGHT_STAGE_RANGE_HALF_RATIO,
                                10
                            );
                            const topLineY = Math.max(centerY - bandHalfHeight, 0);
                            const bottomLineY = Math.min(
                                centerY + bandHalfHeight,
                                containerSize.height
                            );
                            return (
                                <>
                                  <div
                                      className="absolute left-0 right-0 border-t-2 border-dashed border-red-500/80"
                                      style={{ top: topLineY }}
                                  />
                                  <div
                                      className="absolute left-0 right-0 border-t-2 border-dashed border-red-500/80"
                                      style={{ top: bottomLineY }}
                                  />
                                  {rawInfo.heightReferencePoint ? (
                                      <div
                                          className="absolute left-0 right-0 border-t-2 border-emerald-400/90"
                                          style={{ top: rawInfo.heightReferencePoint[1] * scaleY }}
                                      />
                                  ) : null}
                                </>
                            );
                          })()}
                          {shouldShowCompositionOverlay && rawInfo.targetBox && (() => {
                            const [originX, originY, boxWidth, boxHeight] = rawInfo.targetBox!;
                            const left = originX * scaleX;
                            const top = originY * scaleY;
                            const width = boxWidth * scaleX;
                            const height = boxHeight * scaleY;
                            return (
                                <div
                                    className="absolute border-2 border-red-500/80"
                                    style={{
                                      left,
                                      top,
                                      width,
                                      height
                                    }}
                                />
                            );
                          })()}
                          {shouldShowCompositionOverlay && rawInfo.compositionObjectBox && (() => {
                            const [originX, originY, boxWidth, boxHeight] = rawInfo.compositionObjectBox!;
                            const left = originX * scaleX;
                            const top = originY * scaleY;
                            const width = boxWidth * scaleX;
                            const height = boxHeight * scaleY;
                            return (
                                <div
                                    className="absolute border-2 border-emerald-400"
                                    style={{
                                      left,
                                      top,
                                      width,
                                      height
                                    }}
                                />
                            );
                          })()}
                          {shouldShowCompositionOverlay && rawInfo.compositionObjectCenterPoint && (() => {
                            const [cx, cy] = rawInfo.compositionObjectCenterPoint!;
                            const left = cx * scaleX;
                            const top = cy * scaleY;
                            return (
                                <div
                                    className="absolute w-3 h-3 bg-emerald-400 rounded-full -translate-x-1/2 -translate-y-1/2"
                                    style={{
                                      left,
                                      top
                                    }}
                                />
                            );
                          })()}
                          {shouldShowCenterPointMarkers && !shouldShowCompositionOverlay && rawInfo.centerPoint && (() => {
                            const [cx, cy] = rawInfo.centerPoint!;
                            const left = cx * scaleX;
                            const top = cy * scaleY;
                            return (
                                <div
                                    className="absolute w-3 h-3 bg-emerald-400 rounded-full -translate-x-1/2 -translate-y-1/2"
                                    style={{
                                      left,
                                      top
                                    }}
                                />
                            );
                          })()}
                          {shouldShowCenterPointMarkers && !shouldShowCompositionOverlay && (() => {
                            const centerX = containerSize.width / 2;
                            const centerY = containerSize.height / 2;
                            const diag = Math.hypot(
                                containerSize.width,
                                containerSize.height
                            );
                            const offsetLen =
                                (diag * personCenterPositionOffsetPercent) / 100;
                            const boxSize = offsetLen * 2;
                            return (
                                <>
                                  <div
                                      className="absolute w-3 h-3 bg-red-500/70 rounded-full -translate-x-1/2 -translate-y-1/2"
                                      style={{
                                        left: centerX,
                                        top: centerY
                                      }}
                                  />
                                  <div
                                      className="absolute border-2 border-red-500/60 rounded-full border-dashed"
                                      style={{
                                        left: centerX - boxSize / 2,
                                        top: centerY - boxSize / 2,
                                        width: boxSize,
                                        height: boxSize
                                      }}
                                  />
                                </>
                            );
                          })()}
                        </>
                    );
                  })()}
                </div>
            )}

            {(currentAlgoType === 'upload_template') &&
                imageSearchInfo &&
                sourceSize &&
                containerSize && (
                <div className="absolute inset-0 pointer-events-none">
                  {imageSearchInfo.quad && (() => {
                    const scaleX = containerSize.width / sourceSize.width;
                    const scaleY = containerSize.height / sourceSize.height;
                    const clamp = (v: number, min: number, max: number) =>
                        Math.max(min, Math.min(max, v));
                    const mapPoint = (p: [number, number]): [number, number] => [
                      clamp(p[0] * scaleX, 0, containerSize.width),
                      clamp(p[1] * scaleY, 0, containerSize.height)
                    ];
                    const p1 = mapPoint(imageSearchInfo.quad!.leftTop);
                    const p2 = mapPoint(imageSearchInfo.quad!.rightTop);
                    const p3 = mapPoint(imageSearchInfo.quad!.rightBottom);
                    const p4 = mapPoint(imageSearchInfo.quad!.leftBottom);
                    const lineIntersection = (
                        a: [number, number],
                        b: [number, number],
                        c: [number, number],
                        d: [number, number]
                    ): [number, number] | null => {
                      const x1 = a[0], y1 = a[1];
                      const x2 = b[0], y2 = b[1];
                      const x3 = c[0], y3 = c[1];
                      const x4 = d[0], y4 = d[1];
                      const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
                      if (Math.abs(den) < 1e-6) return null;
                      const px =
                          ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den;
                      const py =
                          ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
                      return [
                        clamp(px, 0, containerSize.width),
                        clamp(py, 0, containerSize.height)
                      ];
                    };
                    const focus =
                        lineIntersection(p1, p3, p2, p4) ||
                        (imageSearchInfo.targetCenter
                            ? mapPoint(imageSearchInfo.targetCenter)
                            : null);

                    return (
                        <svg
                            className="absolute inset-0 w-full h-full"
                            viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
                        >
                          <polygon
                              points={`${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]} ${p4[0]},${p4[1]}`}
                              fill="none"
                              stroke="#34d399"
                              strokeWidth="2"
                          />
                          <line x1={p1[0]} y1={p1[1]} x2={p3[0]} y2={p3[1]} stroke="#34d399" strokeWidth="1.5" strokeDasharray="6 4" />
                          <line x1={p2[0]} y1={p2[1]} x2={p4[0]} y2={p4[1]} stroke="#34d399" strokeWidth="1.5" strokeDasharray="6 4" />
                          {focus && <circle cx={focus[0]} cy={focus[1]} r="5" fill="#34d399" />}
                        </svg>
                    );
                  })()}
                </div>
            )}
            {!isStreaming && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                  <Video className="w-14 h-14" />
                </div>
            )}

            {controlSuggestions.length > 0 && (
                <div className="absolute inset-0 pointer-events-none text-white">
                  <div className="absolute inset-x-0 bottom-[12%] flex justify-center px-4 sm:bottom-[10%]">
                    <div className="flex max-w-full flex-wrap items-center justify-center gap-3">
                      {controlSuggestions.map(item => (
                          <div
                              key={item.key}
                              className="flex min-w-[120px] items-center justify-center gap-2 rounded-xl bg-black/60 px-3 py-2 text-sm text-white shadow-[0_8px_24px_rgba(15,23,42,0.28)] backdrop-blur-md sm:min-w-[132px]"
                          >
                            {item.icon}
                            <span className="whitespace-nowrap">{item.label}</span>
                          </div>
                      ))}
                    </div>
                  </div>
                </div>
            )}

            {activeMode === 'alignment_person' && taskOffNotice && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-3xl md:text-4xl font-bold text-emerald-400 bg-black/60 px-6 py-3 rounded-xl">
                    算法启动成功，开始识别中
                  </div>
                </div>
            )}

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
                        </div>
                    )}
                  </div>

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
