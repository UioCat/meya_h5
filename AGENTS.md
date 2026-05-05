# AGENTS.md

## Scope

- 本文件用于约束本仓库内后续 Agent 的页面、交互、接口和文档改动。
- 在没有明确用户指示的情况下，默认优先保持现有功能、接口、页面映射、字段结构和交互语义不变。
- 本仓库当前是 Vite + React + TypeScript 前端，主入口在 `src/App.tsx`，核心页面组件在 `src/components/`。
- 进行判断时，优先级为：用户本轮明确指令 > 当前源码 > `docs/` 内现有协议/结构文档 > 历史 Codex 对话结论。
- 如果历史对话与当前源码不一致，不要暗中按历史重写功能；应在改动说明中明确指出差异，并选择最小风险方案。

## Active Page Map

- `App` 是页面壳，负责底部导航、全局 toast 和三页隐藏/显示。
- `拍摄` 对应 `src/components/LivePusher.tsx`。
- `照片库` 对应 `src/components/PhotoLibrary.tsx`，当前已经实现，不是占位页。
- `配置` 对应 `src/components/ConfigPanel.tsx`，其中 `意图模版` 子页嵌入 `src/components/TemplateManager.tsx`。
- `配置 -> 分析结果` 当前只提示“目前当前还未支持”，不要接入伪功能。
- 旧组件 `LivePusher_ali.tsx`、`LivePusher_show_local.tsx` 不是当前入口；除非用户明确要求，不要基于旧组件推断当前页面行为。

## Frontend Requirements

- 页面必须同时适配手机端和电脑端。
- 做页面样式或布局调整时，默认同时检查移动端和桌面端展示，不允许只针对单一端完成改动。
- 手机端保持相机应用式的底部导航体验，电脑端保持更宽的内容区域，不要把桌面端压成固定窄竖屏。
- 做 UI 重构时，优先调整布局和视觉层，不要随意改动业务逻辑、接口字段或已有控制流程。
- 每次新增功能或调整功能时，风格必须与现有深色 Slate 系界面保持一致。
- 相邻页面区块与底部导航区的背景色需要保持统一的视觉体系，避免页面主体与底部区域明显断层。
- 交互控件应保持已有图标按钮、下拉、折叠面板、表格编辑、toast 和 modal 的语义，不要换成另一套视觉语言。

## Navigation Rules

- 底部标签固定为三个入口：`拍摄`、`照片库`、`配置`。
- 标签切换必须使用“隐藏/显示”方式保留页面实例，不要通过卸载组件实现切换。
- `LivePusher` 切换标签时不得卸载，否则会中断腾讯直播 SDK、WebSocket、旁观播放和算法运行状态。
- `PhotoLibrary` 当前也会在挂载后建立 WebSocket 和加载照片；如调整挂载策略，必须评估照片库长连接和待返回算法结果。
- 不要新增路由或改变底部标签映射，除非用户明确要求。

## Live Page Constraints

- `LivePusher` 页面承载腾讯直播 SDK、无人机旁观、WebSocket 消息、算法结果叠加、拍照和运动提示，改动时默认视为高风险页面。
- 在不影响现有功能的前提下再做样式优化，避免破坏：
  - 推流、旁观、摄像头切换
  - `notify` 弹窗
  - `algoType` 驱动的展示隔离
  - `upload_template`、`alignment_person`、`guide_line` 三类算法展示
  - 算法结果叠加层、右上角分析说明、视频内运动提示
  - 指令控制台和 WebSocket 消息列表
- `notify` WebSocket 消息格式为 `{ "type": "notify", "message": "..." }`，用于居中提示用户信息。
- `algoType` 切换时必须清理上一算法的展示状态，避免不同算法结果混在同一画面。
- “对准-人”模式只通过模版下拉选择参数，不恢复为手填参数模式。
- `alignment_person` 提交必须完整解析模版字段，不得漏掉 `compositionObject`、`cameraHeight`、`eyeStatus`、`mouthStatus`。
- `alignment_person` 请求协议以 `docs/alignment-person-api.md` 为准；如改字段，必须同步更新该文档。
- 画面状态文案中，未开始推流或旁观时的“未连接”默认隐藏；做视觉调整时保留这一规则。
- 指令控制台的产品约束是默认折叠、展开后功能不变。当前 worktree 源码仍有默认展开的历史漂移；如果触碰该区域，应顺手修正为默认折叠并在说明中标出影响范围。
- 历史 Codex worktree `9703` 曾引入统一 `display.version = 1` 展示协议，但当前 worktree 未落 `LiveDisplay.tsx`。如要迁移统一 display，必须原子化完成渲染层、WebSocket 解析、协议文档和回归检查，不要半套混用。

## Photo Library Constraints

- `PhotoLibrary` 页面管理 `photo_library` KV 数据，最多保存 10 张照片。
- 上传前会对大图压缩：最长边目标 1280px，目标体积约 900KB，保存为 JPEG；不要退回直接保存超大 base64 的模式。
- 主预览和算法结果预览必须使用完整显示，不要裁切主体；缩略图列表可以裁剪以保持卡片稳定。
- `引导线-LLM` 只提交 `Prompt + imageBase64 + taskId`，不要重新加入 API Auth 或 LLM API Key。
- `引导线-LLM` 的 HTTP 下发地址为 `https://www.uiofield.top/meya/push`，结果通过 `wss://www.uiofield.top/meya/ws` 返回 `guide_line_lite_result`。
- WebSocket 结果必须按 `taskId` 匹配当前待处理任务；超时、解析失败和连接异常都要稳定展示错误，不应卡在等待态。

## Config Page Constraints

- `ConfigPanel` 是配置页入口，包含 `基础配置`、`意图模版` 和未支持的 `分析结果`。
- `基础配置` 的 A/B 默认选项来自 `src/shared/intentTemplateOptions.ts`，默认项锁定，不可编辑或删除。
- 历史上已移除进入配置页时对 `composition_body_range_options` 和 `composition_shot_type_options` 的自动拉取；不要重新加回页面加载时的噪声请求，除非用户明确要求。
- A/B 自定义项仍使用配置服务 KV 保存能力；删除或修改前必须检查是否被比例表、评价表或意图模版引用。
- `五、引导线配置` 和 `七、拍照阈值设置` 当前在基础配置 UI 中按“数据还未接入到主控”禁用展示；不要接入假保存。
- `八、拍摄终端设置` 当前仅为前端本地状态，不持久化。
- 基础配置的数据结构说明以 `docs/config-panel-data-structures.md` 为准；修改字段、key、存储格式或校验规则时必须同步更新。

## Template Management

- `TemplateManager` 页面职责是管理“对准-人”意图模版。
- 页面进入后默认查询 `intent_template` 模版列表，并支持新增、删除、修改、查看详情和模版名编辑。
- 模版名修改当前通过“创建新 key + 删除旧 key”实现，不要假设后端存在 rename 接口。
- 模版字段结构必须与 `LivePusher` 的“对准-人”当前使用字段保持一致，不要单独发散另一套字段定义。
- 当前模版字段固定为：
  - `bodyRange`
  - `shotType`
  - `orientation`
  - `compositionMethod`
  - `compositionObject`
  - `cameraHeight`
  - `eyeStatus`
  - `mouthStatus`
- 模版值中的编码项使用完整编码值且中间不带空格，例如 `A1头部`、`B2近景`、`C1正脸`、`D1居中构图`、`E5齐眼`。
- 选择 `bodyRange` 后，`shotType` 必须按当前可用 A/B 组合过滤，不要展示所有 B。
- 当模版列表为空或接口返回异常内容时，页面应稳定展示空状态或错误态，不应前端报错。

## Service Endpoints

- 配置服务基础地址固定为 `https://www.uiofield.top/config_server`，不要回退到基于 `window.location` 的动态拼接。
- 算法下发地址固定为 `https://www.uiofield.top/meya/push`，除非用户明确要求修改。
- WebSocket 地址固定为 `wss://www.uiofield.top/meya/ws`，除非用户明确要求修改。
- 手机流地址当前为 `http://play.uiofield.top/live/stream.flv`。
- 无人机算法流地址当前为 `http://localhost:8080/live/stream.flv`。
- 无人机旁观 WHEP 地址当前为 `http://localhost:1985/rtc/v1/whep/?app=live&stream=stream.flv`。
- 腾讯直播推流 URL 当前在 `LivePusher` 内配置；如需改动线上地址、协议或路径，必须同步检查页面中所有使用点，避免部分页面仍指向旧地址。

## Documentation Rules

- 每个页面的行为 spec 放在 `docs/page-specs/`。
- 改动页面行为时，必须同步更新对应页面 spec。
- 改动对外接口时，必须同步更新协议文档：
  - `docs/alignment-person-api.md`
  - 相关页面 spec
  - 如引入统一 display 协议，补齐或更新对应 display 协议文档
- 文档要区分“当前源码实现”和“历史目标/未来迁移建议”，不要把未落地的历史 worktree 功能写成当前事实。

## Verification

- 页面或逻辑改动后优先运行 `npm run build`。
- 涉及 TypeScript 类型、共享字段、配置结构时，尝试运行 `npm run typecheck`；如果失败来自既有旧组件问题，需要在回复中说明。
- 仅文档改动可以不跑构建，但需要检查链接、文件名、页面映射和字段名是否与源码一致。
- 做 UI 改动时默认检查移动端与桌面端展示。

## Safety Rules

- 不要为了“优化结构”而删除当前可用功能。
- 不要在未说明影响的情况下改动 WebSocket 消息格式、推流流程、模版字段名、配置 key 或页面入口映射。
- 如果改动可能影响手机端直播稳定性，优先选择保守方案，并在提交说明中明确写出影响范围。
- 不要把未实现功能做成看似可用的假入口；未支持的入口保持明确提示。
