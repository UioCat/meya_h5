# 拍摄页 Spec

## Source

- 组件：`src/components/LivePusher.tsx`
- 对外 API：`docs/alignment-person-api.md`

## Purpose

拍摄页是实时视频分析页面，负责手机推流、无人机旁观、算法任务下发、WebSocket 结果接收、视频画面叠加和运动控制提示。

## Layout

- 页面标题为 `Meya`。
- 顶部主体是视频容器，未推流时显示视频占位图标。
- 视频容器上可叠加：
  - 居中通知弹窗
  - 右上角“分析结果和画面说明”
  - 人体框、中心点、构图目标、点线构图、追踪区域等 overlay
  - 底部运动/云台调整提示
  - 拍照按钮
- 视频下方显示流状态、WebSocket 状态和直播/旁观状态。
- 下方依次为指令控制台、控制设备、模式选择和当前模式表单。

## Stream Behavior

- 控制设备为 `手机` 时使用腾讯 `TXLivePusher` 开摄像头并推流。
- 控制设备为 `无人机` 时进入旁观模式，通过 WHEP/FLV 播放无人机视频。
- 手机推流算法流地址：`http://play.uiofield.top/live/stream.flv`。
- 无人机算法流地址：`http://localhost:8080/live/stream.flv`。
- 无人机旁观地址：`http://localhost:1985/rtc/v1/whep/?app=live&stream=stream.flv`。
- 未开始推流或旁观时，不展示“未连接”文字。

## WebSocket Behavior

- 页面挂载后连接 `wss://www.uiofield.top/meya/ws`。
- 连接成功后每 5 秒发送 `{ "type": "ping", "ts": ... }` 心跳。
- 最近 10 条 WebSocket 消息展示在指令控制台。
- `{ "type": "notify", "message": "..." }` 显示为居中提示。
- `algoType` 用于区分当前算法；算法类型切换时必须清理上一轮展示状态。

## Modes

### 以图搜景

- 只有在推流或旁观中可选。
- 点击按钮后选择图片，前端压缩成 JPEG 并 POST 到 `https://www.uiofield.top/meya/push`。
- 请求体包含 `type: "upload_template"`、`filename`、`contentType`、`streamUrl`、`data`。
- WebSocket 回传后展示定位状态、匹配点、目标四边形和目标中心点。

### 对准-人

- 只有在推流或旁观中可选。
- 进入模式后加载 `intent_template` 模版列表。
- 用户只能通过模版下拉选择参数，不提供手填参数模式。
- 点击提交前读取：
  - `shot_subject_ratio_table`
  - `subject_ratio_score_table`
- 前端根据模版中的 `shotType + bodyRange` 校验有效组合，并解析 `ratioMin / ratioMax`。
- 提交体必须完整包含 `templateKey`、`streamUrl`、`scene`、`bodyRange`、`ratioMin`、`ratioMax`、`orientation`、`compositionMethod`、`compositionObject`、`structureLineAlignmentLine`、`structureLineAlignmentPoint`、`cameraHeight`、`eyeStatus`、`mouthStatus`。
- 旧模版缺少 `structureLineAlignmentLine` / `structureLineAlignmentPoint` 时，读取层使用默认值 `H1` / `H1V1`，不应导致模版从下拉中消失。
- 具体字段定义以 `docs/alignment-person-api.md` 为准。
- WebSocket 回传阶段包括定高、定距、中心点对准等；页面据此显示相应 overlay。

### 点线构图

- 只有在推流或旁观中可选。
- 进入模式后复用 `intent_template` 模版下拉；用户必须选择模版后才能提交，未选择时提交按钮禁用并提示先选择模版。
- 当前源码固定使用跟踪与对准流程；UI 保留是否展示其他线条、位置容忍比例和角度容忍度配置。
- UI 不再提供「点线构图对准方向」和「参考线位置（0~1）」手动控件；这两个运行时兼容值由所选模版的 `structureLineAlignmentLine` 推导：
  - `H1` / `H2` / `水平中心` -> `alignmentOrientation: "horizontal"`，`alignmentPosition: 1/3` / `2/3` / `0.5`
  - `V1` / `V2` / `竖直中心` -> `alignmentOrientation: "vertical"`，`alignmentPosition: 1/3` / `2/3` / `0.5`
- 提交到 `https://www.uiofield.top/meya/push`，请求体 `type: "guide_line"`，且必须包含 `templateKey`、`structureLineAlignmentLine`、`structureLineAlignmentPoint`。
- WebSocket 回传后展示识别线、目标线、容忍范围、追踪区域和角度信息。
- `isAlignmentLine === true` 或命中选中线的线条显示为绿色；其他线条显示为蓝色。

## Console

- 指令控制台应支持清空和展开/收起。
- 产品约束要求默认折叠；当前源码默认展开是历史漂移，后续触碰该区域时应修正。

## Constraints

- 不要卸载 `LivePusher` 来切换标签。
- 不要擅自修改 WebSocket 消息格式、算法下发地址或流地址。
- 不要把不同算法 overlay 混在同一状态里。
- 如引入统一 display 协议，必须一次性完成协议文档、解析和渲染，不要半迁移。

## Acceptance

- 手机端和桌面端视频容器、控制区和底部导航不重叠。
- 推流/旁观启动、停止后状态文案正确。
- `alignment_person` 只通过模版提交，且字段不缺失。
- `guide_line` 只通过模版提交，且下发 `templateKey`、`structureLineAlignmentLine`、`structureLineAlignmentPoint`。
- `guide_line` 绿色/蓝色线条语义正确。
- `notify` 和运动提示不会遮挡关键控制按钮。
