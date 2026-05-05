import { ChevronDown, ChevronUp } from 'lucide-react';

export type DisplaySize = {
  width: number;
  height: number;
};

export type DisplaySpace = 'source' | 'normalized' | 'container';

export type DisplayTone = 'result' | 'target' | 'secondary' | 'info';

export type DisplayPoint = {
  x: number;
  y: number;
  space?: DisplaySpace;
};

export type DisplayRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  space?: DisplaySpace;
};

export type DisplayRadius = {
  value: number;
  unit?: 'container' | 'axisRatio' | 'diagonalRatio';
  axis?: 'x' | 'y';
};

type DisplayPrimitiveBase = {
  id: string;
  tone?: DisplayTone;
  label?: string;
  dashed?: boolean;
  sourceSize?: DisplaySize;
};

export type DisplayPrimitive =
  | (DisplayPrimitiveBase & {
      kind: 'box';
      rect: DisplayRect;
      fillOpacity?: number;
      strokeWidth?: number;
    })
  | (DisplayPrimitiveBase & {
      kind: 'point';
      point: DisplayPoint;
      radius?: number;
    })
  | (DisplayPrimitiveBase & {
      kind: 'line';
      from: DisplayPoint;
      to: DisplayPoint;
      showEndpoints?: boolean;
      strokeWidth?: number;
    })
  | (DisplayPrimitiveBase & {
      kind: 'polygon';
      points: DisplayPoint[];
      fillOpacity?: number;
      strokeWidth?: number;
    })
  | (DisplayPrimitiveBase & {
      kind: 'circle';
      center: DisplayPoint;
      radius: DisplayRadius;
      strokeWidth?: number;
    })
  | (DisplayPrimitiveBase & {
      kind: 'axisBand';
      axis: 'x' | 'y';
      center: number;
      centerSpace?: 'normalized' | 'container';
      tolerance: number;
      toleranceUnit?: 'container' | 'axisRatio' | 'diagonalRatio';
      minTolerancePx?: number;
      showFill?: boolean;
      showCenter?: boolean;
      showBoundaries?: boolean;
      boundaryDashed?: boolean;
      fillOpacity?: number;
      strokeWidth?: number;
    })
  | {
      id: string;
      kind: 'centerAlignmentGuide';
    };

export type DisplayPanelRow = {
  id: string;
  label?: string;
  value?: string | number;
  text?: string;
  tone?: 'default' | 'accent' | 'muted';
  href?: string;
  hrefLabel?: string;
};

export type DisplayPanelSection = {
  id: string;
  title?: string;
  rows: DisplayPanelRow[];
  subtle?: boolean;
};

export type DisplayPanel = {
  title: string;
  sections: DisplayPanelSection[];
};

export type DisplayPromptIcon =
  | { kind: 'vertical'; direction: 'up' | 'down' }
  | { kind: 'horizontal'; direction: 'left' | 'right' }
  | { kind: 'rotate'; direction: 'clockwise' | 'counterclockwise' };

export type DisplayPrompt = {
  id: string;
  text: string;
  placement: 'viewport-center' | 'video-center' | 'video-bottom';
  tone?: 'toast' | 'success' | 'instruction';
  icon?: DisplayPromptIcon;
};

export type LiveDisplayModel = {
  sourceSize?: DisplaySize;
  panel?: DisplayPanel | null;
  overlays: DisplayPrimitive[];
  videoPrompts: DisplayPrompt[];
  viewportPrompts: DisplayPrompt[];
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

const TONE_STYLES: Record<DisplayTone, { stroke: string; fill: string; label: string }> = {
  result: {
    stroke: '#34D399',
    fill: '#34D399',
    label: '#A7F3D0'
  },
  target: {
    stroke: '#EF4444',
    fill: 'rgba(239, 68, 68, 0.7)',
    label: '#FECACA'
  },
  secondary: {
    stroke: '#3B82F6',
    fill: '#3B82F6',
    label: '#BFDBFE'
  },
  info: {
    stroke: '#7DD3FC',
    fill: '#7DD3FC',
    label: '#E0F2FE'
  }
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getToneStyle = (tone?: DisplayTone) => TONE_STYLES[tone || 'result'];

const normalizeSize = (value: unknown): DisplaySize | null => {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (!isFiniteNumber(obj.width) || !isFiniteNumber(obj.height)) return null;
  if (obj.width <= 0 || obj.height <= 0) return null;
  return { width: obj.width, height: obj.height };
};

const normalizeSpace = (value: unknown): DisplaySpace | undefined =>
  value === 'source' || value === 'normalized' || value === 'container'
    ? value
    : undefined;

const normalizeTone = (value: unknown): DisplayTone | undefined =>
  value === 'result' || value === 'target' || value === 'secondary' || value === 'info'
    ? value
    : undefined;

const normalizePoint = (value: unknown): DisplayPoint | null => {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (!isFiniteNumber(obj.x) || !isFiniteNumber(obj.y)) return null;
  return {
    x: obj.x,
    y: obj.y,
    space: normalizeSpace(obj.space)
  };
};

const normalizeRect = (value: unknown): DisplayRect | null => {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (
    !isFiniteNumber(obj.x) ||
    !isFiniteNumber(obj.y) ||
    !isFiniteNumber(obj.width) ||
    !isFiniteNumber(obj.height)
  ) {
    return null;
  }
  return {
    x: obj.x,
    y: obj.y,
    width: obj.width,
    height: obj.height,
    space: normalizeSpace(obj.space)
  };
};

const normalizePromptIcon = (value: unknown): DisplayPromptIcon | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  if (
    obj.kind === 'vertical' &&
    (obj.direction === 'up' || obj.direction === 'down')
  ) {
    return { kind: obj.kind, direction: obj.direction };
  }
  if (
    obj.kind === 'horizontal' &&
    (obj.direction === 'left' || obj.direction === 'right')
  ) {
    return { kind: obj.kind, direction: obj.direction };
  }
  if (
    obj.kind === 'rotate' &&
    (obj.direction === 'clockwise' || obj.direction === 'counterclockwise')
  ) {
    return { kind: obj.kind, direction: obj.direction };
  }
  return undefined;
};

const normalizeDisplayPrompt = (value: unknown): DisplayPrompt | null => {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.text !== 'string') return null;
  if (
    obj.placement !== 'viewport-center' &&
    obj.placement !== 'video-center' &&
    obj.placement !== 'video-bottom'
  ) {
    return null;
  }
  return {
    id: obj.id,
    text: obj.text,
    placement: obj.placement,
    tone:
      obj.tone === 'toast' || obj.tone === 'success' || obj.tone === 'instruction'
        ? obj.tone
        : undefined,
    icon: normalizePromptIcon(obj.icon)
  };
};

const normalizePanelRow = (value: unknown): DisplayPanelRow | null => {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'string') return null;
  const hasContent =
    typeof obj.text === 'string' ||
    typeof obj.label === 'string' ||
    typeof obj.value === 'string' ||
    typeof obj.value === 'number';
  if (!hasContent) return null;
  return {
    id: obj.id,
    label: typeof obj.label === 'string' ? obj.label : undefined,
    value:
      typeof obj.value === 'string' || typeof obj.value === 'number'
        ? obj.value
        : undefined,
    text: typeof obj.text === 'string' ? obj.text : undefined,
    tone:
      obj.tone === 'accent' || obj.tone === 'muted' || obj.tone === 'default'
        ? obj.tone
        : undefined,
    href: typeof obj.href === 'string' ? obj.href : undefined,
    hrefLabel: typeof obj.hrefLabel === 'string' ? obj.hrefLabel : undefined
  };
};

const normalizePanelSection = (value: unknown): DisplayPanelSection | null => {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !Array.isArray(obj.rows)) return null;
  const rows = obj.rows
    .map(normalizePanelRow)
    .filter((row): row is DisplayPanelRow => Boolean(row));
  if (rows.length === 0) return null;
  return {
    id: obj.id,
    title: typeof obj.title === 'string' ? obj.title : undefined,
    rows,
    subtle: typeof obj.subtle === 'boolean' ? obj.subtle : undefined
  };
};

const normalizePanel = (value: unknown): DisplayPanel | null => {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.sections)) return null;
  const sections = obj.sections
    .map(normalizePanelSection)
    .filter((section): section is DisplayPanelSection => Boolean(section));
  if (sections.length === 0) return null;
  return {
    title: typeof obj.title === 'string' ? obj.title : '分析结果和画面说明',
    sections
  };
};

const normalizePrimitiveBase = (obj: Record<string, unknown>) => {
  if (typeof obj.id !== 'string') return null;
  return {
    id: obj.id,
    tone: normalizeTone(obj.tone),
    label: typeof obj.label === 'string' ? obj.label : undefined,
    dashed: typeof obj.dashed === 'boolean' ? obj.dashed : undefined,
    sourceSize: normalizeSize(obj.sourceSize) || undefined
  };
};

const normalizePrimitive = (value: unknown): DisplayPrimitive | null => {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (obj.kind === 'centerAlignmentGuide') {
    return typeof obj.id === 'string' ? { id: obj.id, kind: obj.kind } : null;
  }
  const base = normalizePrimitiveBase(obj);
  if (!base) return null;

  if (obj.kind === 'box') {
    const rect = normalizeRect(obj.rect);
    if (!rect) return null;
    return {
      ...base,
      kind: obj.kind,
      rect,
      fillOpacity: isFiniteNumber(obj.fillOpacity) ? obj.fillOpacity : undefined,
      strokeWidth: isFiniteNumber(obj.strokeWidth) ? obj.strokeWidth : undefined
    };
  }
  if (obj.kind === 'point') {
    const point = normalizePoint(obj.point);
    if (!point) return null;
    return {
      ...base,
      kind: obj.kind,
      point,
      radius: isFiniteNumber(obj.radius) ? obj.radius : undefined
    };
  }
  if (obj.kind === 'line') {
    const from = normalizePoint(obj.from);
    const to = normalizePoint(obj.to);
    if (!from || !to) return null;
    return {
      ...base,
      kind: obj.kind,
      from,
      to,
      showEndpoints: typeof obj.showEndpoints === 'boolean' ? obj.showEndpoints : undefined,
      strokeWidth: isFiniteNumber(obj.strokeWidth) ? obj.strokeWidth : undefined
    };
  }
  if (obj.kind === 'polygon') {
    if (!Array.isArray(obj.points)) return null;
    const points = obj.points
      .map(normalizePoint)
      .filter((point): point is DisplayPoint => Boolean(point));
    if (points.length < 3) return null;
    return {
      ...base,
      kind: obj.kind,
      points,
      fillOpacity: isFiniteNumber(obj.fillOpacity) ? obj.fillOpacity : undefined,
      strokeWidth: isFiniteNumber(obj.strokeWidth) ? obj.strokeWidth : undefined
    };
  }
  if (obj.kind === 'circle') {
    const center = normalizePoint(obj.center);
    const radius = obj.radius;
    if (!center || !radius || typeof radius !== 'object') return null;
    const radiusObj = radius as Record<string, unknown>;
    if (!isFiniteNumber(radiusObj.value)) return null;
    return {
      ...base,
      kind: obj.kind,
      center,
      radius: {
        value: radiusObj.value,
        unit:
          radiusObj.unit === 'axisRatio' ||
          radiusObj.unit === 'diagonalRatio' ||
          radiusObj.unit === 'container'
            ? radiusObj.unit
            : undefined,
        axis: radiusObj.axis === 'x' || radiusObj.axis === 'y' ? radiusObj.axis : undefined
      },
      strokeWidth: isFiniteNumber(obj.strokeWidth) ? obj.strokeWidth : undefined
    };
  }
  if (obj.kind === 'axisBand') {
    if (
      (obj.axis !== 'x' && obj.axis !== 'y') ||
      !isFiniteNumber(obj.center) ||
      !isFiniteNumber(obj.tolerance)
    ) {
      return null;
    }
    return {
      ...base,
      kind: obj.kind,
      axis: obj.axis,
      center: obj.center,
      centerSpace:
        obj.centerSpace === 'normalized' || obj.centerSpace === 'container'
          ? obj.centerSpace
          : undefined,
      tolerance: obj.tolerance,
      toleranceUnit:
        obj.toleranceUnit === 'axisRatio' ||
        obj.toleranceUnit === 'diagonalRatio' ||
        obj.toleranceUnit === 'container'
          ? obj.toleranceUnit
          : undefined,
      minTolerancePx: isFiniteNumber(obj.minTolerancePx) ? obj.minTolerancePx : undefined,
      showFill: typeof obj.showFill === 'boolean' ? obj.showFill : undefined,
      showCenter: typeof obj.showCenter === 'boolean' ? obj.showCenter : undefined,
      showBoundaries: typeof obj.showBoundaries === 'boolean' ? obj.showBoundaries : undefined,
      boundaryDashed: typeof obj.boundaryDashed === 'boolean' ? obj.boundaryDashed : undefined,
      fillOpacity: isFiniteNumber(obj.fillOpacity) ? obj.fillOpacity : undefined,
      strokeWidth: isFiniteNumber(obj.strokeWidth) ? obj.strokeWidth : undefined
    };
  }

  return null;
};

export const normalizeLiveDisplayPayload = (value: unknown): LiveDisplayModel | null => {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) return null;

  const overlays = Array.isArray(obj.overlays)
    ? obj.overlays
        .map(normalizePrimitive)
        .filter((primitive): primitive is DisplayPrimitive => Boolean(primitive))
    : [];
  const videoPrompts = Array.isArray(obj.videoPrompts)
    ? obj.videoPrompts
        .map(normalizeDisplayPrompt)
        .filter((prompt): prompt is DisplayPrompt => Boolean(prompt))
    : [];
  const viewportPrompts = Array.isArray(obj.viewportPrompts)
    ? obj.viewportPrompts
        .map(normalizeDisplayPrompt)
        .filter((prompt): prompt is DisplayPrompt => Boolean(prompt))
    : [];
  const panel = normalizePanel(obj.panel);
  const sourceSize = normalizeSize(obj.sourceSize) || undefined;

  if (!panel && overlays.length === 0 && videoPrompts.length === 0 && viewportPrompts.length === 0) {
    return null;
  }

  return {
    sourceSize,
    panel,
    overlays,
    videoPrompts,
    viewportPrompts
  };
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

const resolvePoint = (
  point: DisplayPoint,
  containerSize: DisplaySize,
  fallbackSourceSize?: DisplaySize,
  primitiveSourceSize?: DisplaySize
): [number, number] | null => {
  const space = point.space || 'source';
  if (space === 'container') {
    return [
      clamp(point.x, 0, containerSize.width),
      clamp(point.y, 0, containerSize.height)
    ];
  }
  if (space === 'normalized') {
    return [
      clamp(point.x * containerSize.width, 0, containerSize.width),
      clamp(point.y * containerSize.height, 0, containerSize.height)
    ];
  }

  const base = primitiveSourceSize || fallbackSourceSize;
  if (!base) return null;
  return [
    clamp((point.x / base.width) * containerSize.width, 0, containerSize.width),
    clamp((point.y / base.height) * containerSize.height, 0, containerSize.height)
  ];
};

const resolveRect = (
  rect: DisplayRect,
  containerSize: DisplaySize,
  fallbackSourceSize?: DisplaySize,
  primitiveSourceSize?: DisplaySize
): [number, number, number, number] | null => {
  const space = rect.space || 'source';
  let left: number;
  let top: number;
  let width: number;
  let height: number;

  if (space === 'container') {
    left = rect.x;
    top = rect.y;
    width = rect.width;
    height = rect.height;
  } else if (space === 'normalized') {
    left = rect.x * containerSize.width;
    top = rect.y * containerSize.height;
    width = rect.width * containerSize.width;
    height = rect.height * containerSize.height;
  } else {
    const base = primitiveSourceSize || fallbackSourceSize;
    if (!base) return null;
    left = (rect.x / base.width) * containerSize.width;
    top = (rect.y / base.height) * containerSize.height;
    width = (rect.width / base.width) * containerSize.width;
    height = (rect.height / base.height) * containerSize.height;
  }

  left = clamp(left, 0, containerSize.width);
  top = clamp(top, 0, containerSize.height);
  width = clamp(width, 0, containerSize.width - left);
  height = clamp(height, 0, containerSize.height - top);
  return width > 0 && height > 0 ? [left, top, width, height] : null;
};

const resolveRadius = (radius: DisplayRadius, containerSize: DisplaySize) => {
  const unit = radius.unit || 'container';
  if (unit === 'diagonalRatio') {
    return radius.value * Math.hypot(containerSize.width, containerSize.height);
  }
  if (unit === 'axisRatio') {
    const axisLength =
      radius.axis === 'x' ? containerSize.width : containerSize.height;
    return radius.value * axisLength;
  }
  return radius.value;
};

export function DisplayOverlayLayer({
  overlays,
  containerSize,
  sourceSize
}: {
  overlays: DisplayPrimitive[];
  containerSize: DisplaySize | null;
  sourceSize: DisplaySize | null;
}) {
  if (overlays.length === 0) return null;

  const centerGuides = overlays.filter(item => item.kind === 'centerAlignmentGuide');
  const drawableOverlays = overlays.filter(item => item.kind !== 'centerAlignmentGuide');

  return (
    <div className="absolute inset-0 pointer-events-none">
      {centerGuides.map(item => (
        <CenterAlignmentGuideOverlay key={item.id} />
      ))}
      {containerSize && drawableOverlays.length > 0 ? (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
        >
          {drawableOverlays.map(primitive => {
            const tone = getToneStyle(primitive.tone);
            const strokeWidth = 'strokeWidth' in primitive && primitive.strokeWidth
              ? primitive.strokeWidth
              : primitive.kind === 'line'
                ? 3
                : 2;
            const dash = primitive.dashed ? '8 6' : undefined;

            if (primitive.kind === 'box') {
              const rect = resolveRect(
                primitive.rect,
                containerSize,
                sourceSize || undefined,
                primitive.sourceSize
              );
              if (!rect) return null;
              return (
                <rect
                  key={primitive.id}
                  x={rect[0]}
                  y={rect[1]}
                  width={rect[2]}
                  height={rect[3]}
                  fill={primitive.fillOpacity ? tone.fill : 'none'}
                  fillOpacity={primitive.fillOpacity}
                  stroke={tone.stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }

            if (primitive.kind === 'point') {
              const point = resolvePoint(
                primitive.point,
                containerSize,
                sourceSize || undefined,
                primitive.sourceSize
              );
              if (!point) return null;
              return (
                <g key={primitive.id}>
                  <circle cx={point[0]} cy={point[1]} r={primitive.radius || 5} fill={tone.fill} />
                  {primitive.label ? (
                    <text
                      x={point[0] + 8}
                      y={point[1] - 8}
                      fontSize="12"
                      fontWeight="600"
                      fill={tone.label}
                      paintOrder="stroke"
                      stroke="rgba(15,23,42,0.92)"
                      strokeWidth="1.2"
                    >
                      {primitive.label}
                    </text>
                  ) : null}
                </g>
              );
            }

            if (primitive.kind === 'line') {
              const from = resolvePoint(
                primitive.from,
                containerSize,
                sourceSize || undefined,
                primitive.sourceSize
              );
              const to = resolvePoint(
                primitive.to,
                containerSize,
                sourceSize || undefined,
                primitive.sourceSize
              );
              if (!from || !to) return null;
              return (
                <g key={primitive.id}>
                  <line
                    x1={from[0]}
                    y1={from[1]}
                    x2={to[0]}
                    y2={to[1]}
                    stroke={tone.stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={dash}
                    vectorEffect="non-scaling-stroke"
                  />
                  {primitive.showEndpoints ? (
                    <>
                      <circle cx={from[0]} cy={from[1]} r="4" fill={tone.fill} />
                      <circle cx={to[0]} cy={to[1]} r="4" fill={tone.fill} />
                    </>
                  ) : null}
                  {primitive.label ? (
                    <text
                      x={from[0] + 8}
                      y={from[1] - 8}
                      fontSize="12"
                      fontWeight="600"
                      fill={tone.label}
                      paintOrder="stroke"
                      stroke="rgba(15,23,42,0.92)"
                      strokeWidth="1.2"
                    >
                      {primitive.label}
                    </text>
                  ) : null}
                </g>
              );
            }

            if (primitive.kind === 'polygon') {
              const points = primitive.points
                .map(point =>
                  resolvePoint(
                    point,
                    containerSize,
                    sourceSize || undefined,
                    primitive.sourceSize
                  )
                )
                .filter((point): point is [number, number] => Boolean(point));
              if (points.length < 3) return null;
              return (
                <polygon
                  key={primitive.id}
                  points={points.map(point => `${point[0]},${point[1]}`).join(' ')}
                  fill={primitive.fillOpacity ? tone.fill : 'none'}
                  fillOpacity={primitive.fillOpacity}
                  stroke={tone.stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }

            if (primitive.kind === 'circle') {
              const center = resolvePoint(
                primitive.center,
                containerSize,
                sourceSize || undefined,
                primitive.sourceSize
              );
              if (!center) return null;
              return (
                <circle
                  key={primitive.id}
                  cx={center[0]}
                  cy={center[1]}
                  r={resolveRadius(primitive.radius, containerSize)}
                  fill="none"
                  stroke={tone.stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={dash}
                  vectorEffect="non-scaling-stroke"
                />
              );
            }

            if (primitive.kind === 'axisBand') {
              const axisLength = primitive.axis === 'x' ? containerSize.width : containerSize.height;
              const crossLength = primitive.axis === 'x' ? containerSize.height : containerSize.width;
              const centerPx =
                (primitive.centerSpace || 'normalized') === 'container'
                  ? primitive.center
                  : primitive.center * axisLength;
              const toleranceUnit = primitive.toleranceUnit || 'container';
              let tolerancePx =
                toleranceUnit === 'diagonalRatio'
                  ? primitive.tolerance * Math.hypot(containerSize.width, containerSize.height)
                  : toleranceUnit === 'axisRatio'
                    ? primitive.tolerance * axisLength
                    : primitive.tolerance;
              if (primitive.minTolerancePx !== undefined) {
                tolerancePx = Math.max(tolerancePx, primitive.minTolerancePx);
              }
              const start = clamp(centerPx - tolerancePx, 0, axisLength);
              const end = clamp(centerPx + tolerancePx, 0, axisLength);
              const showFill = primitive.showFill ?? true;
              const showCenter = primitive.showCenter ?? true;
              const showBoundaries = primitive.showBoundaries ?? true;
              const boundaryDash = primitive.boundaryDashed === false ? undefined : '8 6';
              const bandStrokeWidth = primitive.strokeWidth || 2;

              if (primitive.axis === 'x') {
                return (
                  <g key={primitive.id}>
                    {showFill ? (
                      <rect
                        x={start}
                        y="0"
                        width={end - start}
                        height={crossLength}
                        fill={tone.fill}
                        opacity={primitive.fillOpacity ?? 0.18}
                      />
                    ) : null}
                    {showCenter ? (
                      <line
                        x1={centerPx}
                        y1="0"
                        x2={centerPx}
                        y2={crossLength}
                        stroke={tone.stroke}
                        strokeWidth={bandStrokeWidth + 1}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {showBoundaries ? (
                      <>
                        <line
                          x1={start}
                          y1="0"
                          x2={start}
                          y2={crossLength}
                          stroke={tone.stroke}
                          strokeWidth={bandStrokeWidth}
                          strokeDasharray={boundaryDash}
                          vectorEffect="non-scaling-stroke"
                        />
                        <line
                          x1={end}
                          y1="0"
                          x2={end}
                          y2={crossLength}
                          stroke={tone.stroke}
                          strokeWidth={bandStrokeWidth}
                          strokeDasharray={boundaryDash}
                          vectorEffect="non-scaling-stroke"
                        />
                      </>
                    ) : null}
                  </g>
                );
              }

              return (
                <g key={primitive.id}>
                  {showFill ? (
                    <rect
                      x="0"
                      y={start}
                      width={crossLength}
                      height={end - start}
                      fill={tone.fill}
                      opacity={primitive.fillOpacity ?? 0.18}
                    />
                  ) : null}
                  {showCenter ? (
                    <line
                      x1="0"
                      y1={centerPx}
                      x2={crossLength}
                      y2={centerPx}
                      stroke={tone.stroke}
                      strokeWidth={bandStrokeWidth + 1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null}
                  {showBoundaries ? (
                    <>
                      <line
                        x1="0"
                        y1={start}
                        x2={crossLength}
                        y2={start}
                        stroke={tone.stroke}
                        strokeWidth={bandStrokeWidth}
                        strokeDasharray={boundaryDash}
                        vectorEffect="non-scaling-stroke"
                      />
                      <line
                        x1="0"
                        y1={end}
                        x2={crossLength}
                        y2={end}
                        stroke={tone.stroke}
                        strokeWidth={bandStrokeWidth}
                        strokeDasharray={boundaryDash}
                        vectorEffect="non-scaling-stroke"
                      />
                    </>
                  ) : null}
                </g>
              );
            }

            return null;
          })}
        </svg>
      ) : null}
    </div>
  );
}

export function AnalysisDisplayPanel({
  panel,
  expanded,
  onToggle
}: {
  panel: DisplayPanel | null | undefined;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!panel || panel.sections.length === 0) return null;

  return (
    <div className="absolute right-3 top-3 z-20 max-w-[min(78vw,320px)] text-xs text-white">
      <div className="rounded-xl bg-black/60 shadow-[0_8px_24px_rgba(15,23,42,0.28)] backdrop-blur-md">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        >
          <span className="font-medium">{panel.title}</span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
        </button>
        {expanded ? (
          <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-2">
            {panel.sections.map(section => (
              <div
                key={section.id}
                className={`rounded px-2 py-1 ${section.subtle ? 'bg-black/20' : 'bg-black/35'} space-y-1`}
              >
                {section.title ? <div className="font-medium">{section.title}</div> : null}
                {section.rows.map(row => {
                  const valueClass =
                    row.tone === 'accent'
                      ? 'font-medium text-sky-200'
                      : row.tone === 'muted'
                        ? 'text-slate-300'
                        : '';
                  if (row.href) {
                    return (
                      <div key={row.id} className="break-all">
                        {row.label ? `${row.label}：` : null}
                        <a
                          href={row.href}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 text-sky-200 underline"
                        >
                          {row.hrefLabel || row.value || row.href}
                        </a>
                      </div>
                    );
                  }
                  if (row.text) {
                    return <div key={row.id}>{row.text}</div>;
                  }
                  return (
                    <div key={row.id}>
                      {row.label ? `${row.label}：` : null}
                      <span className={valueClass}>{row.value ?? '--'}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function VerticalDirectionIcon({
  direction,
  className = 'h-10 w-10'
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
  className = 'h-10 w-10'
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
  className = 'h-8 w-8'
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

function PromptIcon({ icon }: { icon: DisplayPromptIcon }) {
  if (icon.kind === 'vertical') {
    return <VerticalDirectionIcon direction={icon.direction} />;
  }
  if (icon.kind === 'horizontal') {
    return <HorizontalDirectionIcon direction={icon.direction} />;
  }
  return <RotateDirectionIcon direction={icon.direction} />;
}

export function DisplayPromptLayer({
  prompts,
  placement
}: {
  prompts: DisplayPrompt[];
  placement: DisplayPrompt['placement'];
}) {
  const visiblePrompts = prompts.filter(prompt => prompt.placement === placement);
  if (visiblePrompts.length === 0) return null;

  if (placement === 'viewport-center') {
    return (
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="flex max-w-[80vw] flex-col items-center gap-2">
          {visiblePrompts.map(prompt => (
            <div
              key={prompt.id}
              className="rounded-xl bg-black/75 px-6 py-3 text-lg font-semibold text-white"
            >
              {prompt.text}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (placement === 'video-center') {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex max-w-[88%] flex-col items-center gap-2">
          {visiblePrompts.map(prompt => (
            <div
              key={prompt.id}
              className={`rounded-xl bg-black/60 px-6 py-3 text-center font-bold ${
                prompt.tone === 'success'
                  ? 'text-3xl text-emerald-400 md:text-4xl'
                  : 'text-lg text-white'
              }`}
            >
              {prompt.text}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none text-white">
      <div className="absolute inset-x-0 bottom-[12%] flex justify-center px-4 sm:bottom-[10%]">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-3">
          {visiblePrompts.map(prompt => (
            <div
              key={prompt.id}
              className="flex min-w-[120px] items-center justify-center gap-2 rounded-xl bg-black/60 px-3 py-2 text-sm text-white shadow-[0_8px_24px_rgba(15,23,42,0.28)] backdrop-blur-md sm:min-w-[132px]"
            >
              {prompt.icon ? <PromptIcon icon={prompt.icon} /> : null}
              <span className="whitespace-nowrap">{prompt.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
