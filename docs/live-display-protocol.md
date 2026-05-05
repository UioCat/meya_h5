# 拍摄页统一 Display 协议

拍摄页前端现在只渲染一套 `display` 模型。后端新增或调整算法时，不再需要前端为每个算法单独开发 point、line、box、右侧文本和弹窗逻辑，只要在 WebSocket 消息里带上 `display.version = 1`。

## WebSocket 消息外层

```json
{
  "type": "display_update",
  "algoType": "alignment_person",
  "display": {
    "version": 1,
    "sourceSize": { "width": 480, "height": 640 },
    "panel": {},
    "overlays": [],
    "videoPrompts": [],
    "viewportPrompts": []
  }
}
```

## display 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | `1` | 必填，当前协议版本 |
| `sourceSize` | `{ width, height }` | 可选，原始视频/图片坐标系尺寸；当 overlay 使用 `space: "source"` 时需要提供 |
| `panel` | `DisplayPanel` | 可选，右上角“分析结果和画面说明” |
| `overlays` | `DisplayOverlay[]` | 可选，统一画面叠加图元 |
| `videoPrompts` | `DisplayPrompt[]` | 可选，视频容器内提示，如运动方向、算法启动提示 |
| `viewportPrompts` | `DisplayPrompt[]` | 可选，全屏居中弹窗提示 |

## 坐标空间

每个点或矩形都支持 `space`：

| 值 | 含义 |
| --- | --- |
| `source` | 原始视频/图片像素坐标，按 `sourceSize` 映射到页面容器 |
| `normalized` | 归一化坐标，`x/y/width/height` 范围通常为 `0~1` |
| `container` | 页面容器像素坐标 |

## overlay 图元

### Box

```json
{
  "id": "person_bbox",
  "kind": "box",
  "tone": "result",
  "rect": { "x": 168, "y": 108, "width": 146, "height": 184, "space": "source" }
}
```

### Point

```json
{
  "id": "person_center",
  "kind": "point",
  "tone": "result",
  "point": { "x": 0.5, "y": 0.5, "space": "normalized" },
  "radius": 6
}
```

### Line

```json
{
  "id": "guide_line_1",
  "kind": "line",
  "tone": "result",
  "from": { "x": 0.12, "y": 0.3, "space": "normalized" },
  "to": { "x": 0.82, "y": 0.34, "space": "normalized" },
  "showEndpoints": true,
  "label": "L1"
}
```

### 其他图元

- `polygon`：四边形或多边形，字段为 `points: DisplayPoint[]`
- `circle`：圆形范围，字段为 `center` 和 `radius`
- `axisBand`：横向/纵向目标线和容忍范围，适合引导线、定高范围
- `centerAlignmentGuide`：前端内置的中心构图网格

`tone` 统一语义：`result` 绿色识别结果，`target` 红色目标/容忍范围，`secondary` 蓝色次要结果，`info` 浅蓝信息。

## 右上角面板

```json
{
  "title": "分析结果和画面说明",
  "sections": [
    {
      "id": "summary",
      "rows": [
        { "id": "algo", "label": "当前算法", "value": "对准-人", "tone": "accent" },
        { "id": "stage", "label": "当前算法阶段", "value": "中心点对准", "tone": "accent" }
      ]
    },
    {
      "id": "help",
      "title": "画面说明",
      "rows": [
        { "id": "green_point", "text": "绿色点：构图对象中心点" },
        { "id": "red_box", "text": "红色框：构图对象中心点需要到达的位置" }
      ]
    }
  ]
}
```

## 弹窗和视频内提示

```json
{
  "id": "task_started",
  "text": "算法启动成功，开始识别中",
  "placement": "video-center",
  "tone": "success"
}
```

`placement` 可选值：

- `viewport-center`：全屏居中弹窗
- `video-center`：视频画面居中提示
- `video-bottom`：视频底部方向提示

方向提示可以加 `icon`：

```json
{
  "id": "move_right",
  "text": "向右",
  "placement": "video-bottom",
  "tone": "instruction",
  "icon": { "kind": "horizontal", "direction": "right" }
}
```

`icon.kind` 支持 `vertical`、`horizontal`、`rotate`。
