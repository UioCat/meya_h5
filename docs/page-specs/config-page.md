# 配置页 Spec

## Source

- 入口组件：`src/components/ConfigPanel.tsx`
- 意图模版组件：`src/components/TemplateManager.tsx`
- 共享选项：`src/shared/intentTemplateOptions.ts`
- 数据结构文档：`docs/config-panel-data-structures.md`

## Purpose

配置页管理拍摄/算法相关基础配置和“对准-人”意图模版。它是后台管理页，但仍需要适配手机端。

## Layout

- 页面标题为 `Meya`。
- 顶部为三段式配置页签：`基础配置`、`意图模版`、`分析结果`。
- `基础配置` 和 `意图模版` 使用隐藏/显示方式切换。
- `分析结果` 当前未实现，只触发 toast：`目前当前还未支持`。
- 内容容器使用深色卡片，桌面最大宽度 `max-w-4xl`。

## 基础配置

### 一、构图关键参数

- 默认折叠。
- 包含 A/B/C/D/E/K 参数。
- A 身体范围和 B 景别类型可展开管理。
- A/B 默认项来自 `intentTemplateOptions.ts`，默认项锁定，不可修改或删除。
- A/B 新增项支持保存、修改、删除。
- A/B 值存储为完整编码值且中间不带空格，例如 `A1头部`、`B6远景`。
- K 空间关系当前显示为未接入主控，不可展开编辑。
- 历史上已移除页面加载时自动读取 `composition_body_range_options` 和 `composition_shot_type_options`，不要重新引入自动噪声请求。

### 二、景别与主体占比

- 读取/保存 `basic_config / shot_subject_ratio_table`。
- 行来自 B，列来自 A。
- 单元格保存单个 `0~100` 数字或 `-`。
- 展示时自动补 `%`。
- 编辑态需要支持手机端横向滚动和桌面端较宽表格。

### 三、主体占比评价标准

- 读取/保存 `basic_config / subject_ratio_score_table`。
- 行来自 B，列来自 A。
- 每个单元格为前开后闭区间 `(min%, max%]`。
- 保存时校验两个值均为 `0~100` 整数且 `min < max`。
- 输入框必须足够宽，不能截断多位数值，例如 `100`。

### 四、主体偏离度评分标准

- 读取/保存 `basic_config / subject_offset_score_table`。
- 每行维护 `x1 / x2` 两个分界点。
- 展示为 `好 / 一般 / 差` 三档。
- 保存时校验整数、范围和 `x1 < x2`。

### 五、点线构图配置

- 当前 UI 标记为“数据还未接入到主控”。
- 不读取后端，不保存后端，不接入假功能。

### 六、笑容检测参数

- 读取/保存 `basic_config / smile_detection_settings`。
- 管理上扬权重、嘴巴宽度阈值和嘴角上扬阈值。
- 滑杆和数字展示需要保持移动端可操作。

### 七、拍照阈值设置

- 当前 UI 标记为“数据还未接入到主控”。
- 不读取后端，不保存后端，不接入假功能。

### 八、拍摄终端设置

- 当前仅前端本地状态。
- 移动终端和无人机连接状态互斥展示。
- 不读取后端，不保存后端。

## 意图模版

- `ConfigPanel` 在 `意图模版` 页签内嵌 `TemplateManager`。
- 进入后查询 `intent_template` 列表。
- 支持列表、查看详情、新增、修改、删除。
- 模版名可编辑；重命名使用“创建新 key + 删除旧 key”。
- 删除前需要用户确认。
- 列表为空时展示稳定空状态。

## Template Fields

模版字段固定为：

```json
{
  "bodyRange": "A1头部",
  "shotType": "B1特写",
  "orientation": "C1正脸",
  "compositionMethod": "D1居中构图",
  "compositionObject": "双眼中心点",
  "structureLineAlignmentLine": "H1",
  "structureLineAlignmentPoint": "H1V1",
  "cameraHeight": "E5齐眼",
  "eyeStatus": "睁眼",
  "mouthStatus": "微笑"
}
```

- 所有字段提交前不能为空。
- 所有字段必须在当前可选范围内。
- `compositionObject` 兼容旧值 `眼睛`，规范化为 `双眼中心点`。
- `structureLineAlignmentLine` 中文业务名为「点线构图对准-线」，可选值为 `H1`、`H2`、`水平中心`、`V1`、`V2`、`竖直中心`。
- `structureLineAlignmentPoint` 中文业务名为「点线构图对准-点」，可选值为 `H1V1`、`H1V2`、`H2V1`、`H2V2`。
- 点线关系：H 表示水平分割线，V 表示竖直分割线；`H1` 为 `y = 1/3`，`H2` 为 `y = 2/3`，`V1` 为 `x = 1/3`，`V2` 为 `x = 2/3`；`H1V1` 是 `(x = 1/3, y = 1/3)`，其他点同理。
- 选择 A 后，B 必须按当前可用 A/B 组合过滤。
- 老模版缺 `cameraHeight`、`compositionObject`、`structureLineAlignmentLine` 或 `structureLineAlignmentPoint` 时，读取层使用默认值兜底，避免列表读挂；其中线默认 `H1`，点默认 `H1V1`。

## Data Contracts

- 配置服务固定为 `https://www.uiofield.top/config_server`。
- 数据结构细节以 `docs/config-panel-data-structures.md` 为准。
- 改动任何配置 key、存储 shape、默认枚举或校验规则时，必须同步更新该文档和本 spec。

## Constraints

- 不要把 `配置` 底部入口直接改成 `TemplateManager`，当前入口是 `ConfigPanel`。
- 不要删除默认 A/B 枚举或改变编码含义。
- 不要让“分析结果”变成伪页面。
- 不要在未说明影响的情况下改变模版字段名，因为 `LivePusher` 的 `alignment_person` 提交流程依赖这些字段。

## Acceptance

- 手机端基础配置表格可滚动、输入不被截断。
- 桌面端配置页不被压成窄竖屏。
- 空模版列表和异常 value 都不会导致前端崩溃。
- 新增/编辑模版后，`拍摄 -> 对准-人` 能读取并提交完整参数。
