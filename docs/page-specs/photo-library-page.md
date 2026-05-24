# 照片库页 Spec

## Source

- 组件：`src/components/PhotoLibrary.tsx`

## Purpose

照片库用于保存少量调试图片，选择图片后发起 `点线构图-LLM` Lite 算法，并展示 WebSocket 返回的标注结果。

## Layout

- 页面标题为 `照片库`。
- 内容最大宽度为桌面 `max-w-5xl`，手机端单列堆叠。
- 页面区块顺序固定为：
  1. 已上传照片
  2. 当前选择
  3. 算法结果
  4. 上传照片
- 上传照片区必须放在页面最底部。
- 主预览和算法结果预览使用 `object-contain` 完整显示图片。
- 缩略图列表可以使用 `object-cover` 保持卡片稳定。

## Data Model

- 配置服务：`https://www.uiofield.top/config_server`
- KV 类型：`photo_library`
- 单条照片值包含：
  - `filename`
  - `contentType`
  - `data`
  - `size`
  - `createdAt`
- 最多保存 10 张照片。

## Loading Behavior

- 页面挂载后请求 `/kvs?type=photo_library`。
- `404` 视为空列表。
- 非数组或异常内容需要被安全过滤，不应导致页面报错。
- 刷新按钮重新拉取列表。
- 选择照片后清空上一张照片的算法结果和错误。

## Upload Behavior

- 仅接受 `image/*` 文件。
- 如果文件超过目标体积或最长边过大，上传前用 canvas 压缩：
  - 最长边目标：1280px
  - 目标体积：约 900KB
  - JPEG 初始质量：0.72
  - JPEG 最低质量：0.5
- 压缩后保存为 JPEG 和 `.jpg` 文件名。
- 上传成功后重新加载列表并选中新照片。
- 达到 10 张上限后，上传入口禁用并提示先删除旧照片。

## Algorithm Behavior

- 点击 `点线构图-LLM` 打开 modal。
- modal 包含 `Prompt`、`传递结构线`、`传递汇聚点` 两个开关；两个开关每次打开 modal 时默认开启。不要加入 API Auth、LLM API Key 或其他密钥输入。
- Prompt 不能为空。
- 两个开关不能同时关闭；否则阻止提交并提示至少选择一种候选。
- 点击提交并通过前端校验后，立即清除上一轮算法结果，结果区域进入等待态。
- 请求体同时发送 `includeConstructionLines` 和 `includeConvergePoints`；兼容字段 `includeMlsd` 跟随 `includeConvergePoints`。
- 提交地址：`https://www.uiofield.top/meya/push`。
- 请求体：

```json
{
  "type": "点线构图Lite",
  "taskId": "<selected photo key>",
  "prompt": "<trimmed prompt>",
  "includeConstructionLines": true,
  "includeConvergePoints": true,
  "includeMlsd": true,
  "imageBase64": "<base64 payload without data URL prefix>"
}
```

- HTTP 成功只表示任务已下发，结果通过 WebSocket 返回。
- 页面挂载后连接 `wss://www.uiofield.top/meya/ws`，每 5 秒心跳。
- 只处理返回事件 `guide_line_lite_result`，并按 `taskId` 匹配当前 pending 任务；该返回事件类型保持不变。
- 60 秒未收到结果时，退出等待态并显示超时提示。

## Result Display

- 结果读取 `imageDataUrl`。
- 展示候选结构线数量、候选汇聚点数量、选中结构线、选中汇聚点、任务 ID、状态码、状态消息和 `llm` JSON。
- 新结果优先读取 `selectedConstructionIds` 和 `selectedConvergePoints` / `selectConvergePoints`；旧结果兼容 `selectedOptionIds` / `selectedIds`、`selectedGuideLineIds` 和 `selectedMlsdPoints`。
- LLM JSON 结果框支持一键复制，并允许用户纵向拖拽调整高度；默认高度保持当前展示高度。
- 后端英文状态 `llm selected candidate(s); selected candidates marked green and other candidates marked blue` 在页面展示为中文。
- 解析失败、WebSocket 异常、HTTP 异常均展示错误，不应卡死 modal 或按钮。

## Constraints

- 不要把算法结果改为同步依赖 HTTP response。
- 不要保存未压缩的大 base64 图。
- 不要裁切主预览图或算法结果图。
- 不要改变 `photo_library` 字段结构，除非同步迁移读取兼容和文档。

## Acceptance

- 大图上传后 payload 明显压缩，页面仍能完整预览。
- 竖图、横图、超宽图都不被主预览裁切。
- WebSocket 返回正确 taskId 后结果展示；其他 taskId 被忽略。
- 空照片库、接口 404、上传上限和删除流程都有稳定 UI。
