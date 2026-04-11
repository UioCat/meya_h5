# 对准-人任务提交 API 文档

本文档描述前端在“拍摄 -> 对准-人”模式下，选择意图模版并点击“提交”后，发给外部系统的请求协议。

## 1. 接口信息

- Method: `POST`
- URL: `https://www.uiofield.top/meya/push`
- Content-Type: `application/json`

## 2. 触发时机

当前端页面满足以下条件时会发起本请求：

1. 用户进入 `对准-人` 模式
2. 用户从模版下拉框中选择一个意图模版
3. 用户点击 `提交`

在真正提交前，前端会先读取配置服务中的：

- 意图模版：`type = intent_template`
- 景别与主体占比配置：`type = basic_config`，`key = shot_subject_ratio_table`
- 主体占比评价标准：`type = basic_config`，`key = subject_ratio_score_table`

## 3. 请求体结构

请求体固定为：

```json
{
  "type": "alignment_person",
  "templateKey": "室内模版V1",
  "scene": "近景",
  "bodyRange": "胸部及以上",
  "ratioMin": "45",
  "ratioMax": "60",
  "orientation": "左侧45度",
  "compositionMethod": "居中构图",
  "compositionObject": "双眼中心点",
  "cameraHeight": "齐肩",
  "eyeStatus": "睁眼",
  "mouthStatus": "不笑"
}
```

## 4. 字段说明

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `string` | 是 | 固定值：`alignment_person` |
| `templateKey` | `string` | 是 | 当前选中的意图模版名称 |
| `scene` | `string` | 是 | 由模版中的 `shotType` 解析得到，例如 `B1特写 -> 特写` |
| `bodyRange` | `string` | 是 | 由模版中的 `bodyRange` 解析得到，例如 `A1头部 -> 头部` |
| `ratioMin` | `string` | 是 | 由 `subject_ratio_score_table` 中命中单元格解析得到的最小比例 |
| `ratioMax` | `string` | 是 | 由 `subject_ratio_score_table` 中命中单元格解析得到的最大比例 |
| `orientation` | `string` | 是 | 由模版中的 `orientation` 解析得到，例如 `C1正脸 -> 正脸` |
| `compositionMethod` | `string` | 是 | 由模版中的 `compositionMethod` 解析得到，例如 `D1居中构图 -> 居中构图` |
| `compositionObject` | `string` | 是 | 模版中的构图对象，当前直接下发，例如 `双眼中心点` |
| `cameraHeight` | `string` | 是 | 由模版中的 `cameraHeight` 解析得到，例如 `E4齐眼 -> 齐眼` |
| `eyeStatus` | `string` | 是 | 模版中的眼睛状态，当前直接下发，例如 `睁眼` |
| `mouthStatus` | `string` | 是 | 模版中的嘴巴状态，当前直接下发，例如 `微笑` |

## 4.1 字段枚举值（当前前端实现）

以下枚举值以当前前端实现和当前配置结构为准。

### 4.1.1 固定值或无固定枚举的字段

- `type`
  固定值：`alignment_person`
- `templateKey`
  无固定枚举。
  取值来源：配置服务中 `type = intent_template` 的 `key`。
- `ratioMin`
  无固定枚举。
  取值来源：`subject_ratio_score_table` 命中单元格解析后的最小比例，字符串形式下发，例如 `45`、`32`、`22`。
- `ratioMax`
  无固定枚举。
  取值来源：`subject_ratio_score_table` 命中单元格解析后的最大比例，字符串形式下发，例如 `60`、`45`、`32`。

### 4.1.2 来自模版字段的枚举值

- `scene`
  由模版中的 `shotType` 去掉编码前缀后得到。
  当前默认枚举值：
  `特写`、`近景`、`中近景`、`中景`、`远景`
- `bodyRange`
  由模版中的 `bodyRange` 去掉编码前缀后得到。
  当前默认枚举值：
  `头部`、`胸部及以上`、`腰部及以上`、`膝盖及以上`、`全身`
- `orientation`
  由模版中的 `orientation` 去掉编码前缀后得到。
  当前枚举值：
  `正脸`、`左侧45度`、`右侧45度`、`背身`
- `compositionMethod`
  由模版中的 `compositionMethod` 去掉编码前缀后得到。
  当前枚举值：
  `居中构图`、`三分线构图H1V1`、`三分线构图H1V2`、`三分线构图H2V1`、`三分线构图H2V2`、`三分线构图H1`、`三分线构图H2`、`三分线构图V1`、`三分线构图V2`、`对角线构图-H0V0-H3V3`、`对角线构图-H0V3-H3V0`、`对称构图V1.5`、`对称构图H1.5`
- `compositionObject`
  直接使用模版中的枚举值。
  当前枚举值：
  `人体头部中心点`、`双眼中心点`
- `cameraHeight`
  由模版中的 `cameraHeight` 去掉编码前缀后得到。
  当前枚举值：
  `齐眼`、`齐肩`、`齐髋`、`齐膝`
- `eyeStatus`
  直接使用模版中的枚举值。
  当前枚举值：
  `闭眼`、`一睁一闭`、`睁眼`
- `mouthStatus`
  直接使用模版中的枚举值。
  当前枚举值：
  `不笑`、`微笑`、`大笑`

## 5. 模版到请求体的转换规则

### 5.1 意图模版原始数据

前端从配置服务读取到的意图模版 `value` 形如：

```json
{
  "bodyRange": "A1头部",
  "shotType": "B1特写",
  "orientation": "C1正脸",
  "compositionMethod": "D1居中构图",
  "compositionObject": "双眼中心点",
  "cameraHeight": "E4齐眼",
  "eyeStatus": "睁眼",
  "mouthStatus": "微笑"
}
```

其中：

- `bodyRange` / `shotType` / `orientation` / `compositionMethod` / `cameraHeight`
  都是完整编码值，且中间不带空格
- 例如：`A1头部`、`B1特写`、`C1正脸`、`D1居中构图`、`E4齐眼`

### 5.2 直接解析规则

前端会去掉这些字段前面的编码前缀：

- `A1头部 -> 头部`
- `B1特写 -> 特写`
- `C1正脸 -> 正脸`
- `D1居中构图 -> 居中构图`
- `E4齐眼 -> 齐眼`

对应到请求体中的：

- `scene`
- `bodyRange`
- `orientation`
- `compositionMethod`
- `cameraHeight`

其中 `compositionObject` 不带编码，直接使用模版中的枚举值，例如 `双眼中心点` 或 `人体头部中心点`。

### 5.3 景别与主体占比校验规则

前端会根据意图模版中的 `shotType + bodyRange`，去配置服务读取：

- `type = basic_config`
- `key = shot_subject_ratio_table`

该配置当前结构为：

```json
{
  "B2近景": {
    "A2胸部及以上": "50%"
  },
  "B3中近景": {
    "A3腰部及以上": "40%"
  },
  "B4中景": {
    "A4膝盖及以上": "30%",
    "A5全身": "15%"
  },
  "B5远景": {
    "A5全身": "<=5%"
  }
}
```

匹配规则：

1. 用模版中的 `shotType` 去匹配配置里的行
2. 用模版中的 `bodyRange` 去匹配配置里的列
3. 找到对应项后，说明这组 `景别 + 身体范围` 是有效组合，前端允许继续提交

### 5.4 主体占比评价标准取值规则

前端会再根据同一组 `shotType + bodyRange`，去配置服务读取：

- `type = basic_config`
- `key = subject_ratio_score_table`

该配置当前结构为：

```json
{
  "B2近景": {
    "A2胸部及以上": { "min": 45, "max": 60 }
  },
  "B3中近景": {
    "A3腰部及以上": { "min": 32, "max": 45 }
  }
}
```

匹配规则：

1. 用模版中的 `shotType` 去匹配配置里的行
2. 用模版中的 `bodyRange` 去匹配配置里的列
3. 找到对应项后：
   - `min` 作为 `ratioMin`
   - `max` 作为 `ratioMax`
4. 如果单元格是字符串区间，例如 `(45%,60%]`，前端会解析为 `ratioMin = 45`、`ratioMax = 60`

例如：

- 模版中 `shotType = B2近景`
- 模版中 `bodyRange = A2胸部及以上`
- 在 `shot_subject_ratio_table` 中命中 `B2近景 / A2胸部及以上`
- 在 `subject_ratio_score_table` 中命中 `B2近景 / A2胸部及以上 = { min: 45, max: 60 }`

最终得到：

```json
{
  "scene": "近景",
  "bodyRange": "胸部及以上",
  "ratioMin": "45",
  "ratioMax": "60"
}
```

## 6. 对准过程回传消息

当前 `mainController_v3` 在执行 `alignment_person` 过程中，会通过：

- HTTP POST `https://www.uiofield.top/meya/push`

向平台持续回传控制消息。

平台侧如果有 WebSocket 转发链路，则前端最终看到的运行时消息也会带上以下阶段字段。

### 6.1 新增阶段字段

对准-人的运行时回传消息会新增两个字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `currentStageCode` | `string` | 当前阶段代码 |
| `currentStage` | `string` | 当前阶段中文名称 |

当前阶段枚举如下：

| `currentStageCode` | `currentStage` | 说明 |
| --- | --- | --- |
| `height` | `定高` | 根据 `cameraHeight` 对应的人体关键点做上下对准 |
| `distance` | `定距` | 根据 `ratioMin / ratioMax` 调整人物占画面比例 |
| `orientation` | `朝向调整` | 根据 `orientation` 调整人物朝向 |
| `center` | `中心点对准` | 根据 `compositionMethod + compositionObject` 做构图点位对准 |

### 6.2 回传消息范围

上述字段会出现在所有 `algoType = alignment_person` 的运行时回传消息里，包括但不限于：

- `move`
- `adjust`
- `gimbal_adjust`
- `notify`
- `alignment_done`

### 6.3 回传消息示例

#### 6.3.1 阶段内控制消息

```json
{
  "taskId": "123",
  "command": "adjust",
  "param": {
    "yaw": 0,
    "throttle": 1
  },
  "algoType": "alignment_person",
  "识别时间": "14:23:11",
  "currentStageCode": "height",
  "currentStage": "定高"
}
```

#### 6.3.2 阶段完成通知

```json
{
  "type": "notify",
  "message": "定距完成",
  "algoType": "alignment_person",
  "识别时间": "14:23:18",
  "currentStageCode": "distance",
  "currentStage": "定距"
}
```

#### 6.3.3 最终完成消息

```json
{
  "type": "alignment_done",
  "taskId": "123",
  "message": "aligned",
  "algoType": "alignment_person",
  "识别时间": "14:23:26",
  "currentStageCode": "center",
  "currentStage": "中心点对准"
}
```

## 7. 完整示例

### 7.1 前端当前所选模版

```json
{
  "key": "portrait_intent_default",
  "value": {
    "bodyRange": "A1头部",
    "shotType": "B1特写",
    "orientation": "C1正脸",
    "compositionMethod": "D1居中构图",
    "compositionObject": "双眼中心点",
    "cameraHeight": "E4齐眼",
    "eyeStatus": "睁眼",
    "mouthStatus": "微笑"
  }
}
```

### 7.2 对外提交体

```json
{
  "type": "alignment_person",
  "templateKey": "portrait_intent_default",
  "scene": "近景",
  "bodyRange": "胸部及以上",
  "ratioMin": "45",
  "ratioMax": "60",
  "orientation": "正脸",
  "compositionMethod": "居中构图",
  "compositionObject": "双眼中心点",
  "cameraHeight": "齐眼",
  "eyeStatus": "睁眼",
  "mouthStatus": "微笑"
}
```

## 8. 前端校验与失败场景

前端在提交前会做以下检查：

1. 必须先选中一个意图模版
2. 必须能根据模版中的 `shotType + bodyRange` 找到对应的 `shot_subject_ratio_table` 配置
3. 必须能根据模版中的 `shotType + bodyRange` 找到对应的 `subject_ratio_score_table` 配置

若失败，前端不会发请求，并在页面上显示错误提示。
