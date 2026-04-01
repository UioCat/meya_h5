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

## 3. 请求体结构

请求体固定为：

```json
{
  "type": "alignment_person",
  "templateKey": "室内模版V1",
  "scene": "中近景",
  "bodyRange": "肩部及以上",
  "range": "髋部及以上",
  "ratioMin": "32",
  "ratioMax": "45",
  "orientation": "左侧45度",
  "compositionMethod": "居中构图",
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
| `range` | `string` | 是 | 由 `scene` 去查询 `shot_subject_ratio_table` 后得到的主体范围，例如 `B1特写 -> A1头部 -> 头部` |
| `ratioMin` | `string` | 是 | 由 `scene` 去查询 `shot_subject_ratio_table` 后得到的最小比例 |
| `ratioMax` | `string` | 是 | 由 `scene` 去查询 `shot_subject_ratio_table` 后得到的最大比例 |
| `orientation` | `string` | 是 | 由模版中的 `orientation` 解析得到，例如 `C1正脸 -> 正脸` |
| `compositionMethod` | `string` | 是 | 由模版中的 `compositionMethod` 解析得到，例如 `D1居中构图 -> 居中构图` |
| `cameraHeight` | `string` | 是 | 由模版中的 `cameraHeight` 解析得到，例如 `E4齐眼 -> 齐眼` |
| `eyeStatus` | `string` | 是 | 模版中的眼睛状态，当前直接下发，例如 `睁眼` |
| `mouthStatus` | `string` | 是 | 模版中的嘴巴状态，当前直接下发，例如 `微笑` |

## 5. 模版到请求体的转换规则

### 5.1 意图模版原始数据

前端从配置服务读取到的意图模版 `value` 形如：

```json
{
  "bodyRange": "A1头部",
  "shotType": "B1特写",
  "orientation": "C1正脸",
  "compositionMethod": "D1居中构图",
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

### 5.3 景别与主体占比映射规则

前端会根据意图模版中的 `shotType`，去配置服务读取：

- `type = basic_config`
- `key = shot_subject_ratio_table`

该配置当前结构为：

```json
[
  { "scene": "B1特写", "range": "A1头部", "ratioMin": "50", "ratioMax": "60" },
  { "scene": "B2近景", "range": "A2肩部及以上", "ratioMin": "45", "ratioMax": "60" },
  { "scene": "B3中近景", "range": "A3髋部及以上", "ratioMin": "32", "ratioMax": "45" },
  { "scene": "B4中景", "range": "A4膝部及以上", "ratioMin": "22", "ratioMax": "32" },
  { "scene": "B6远景", "range": "A5全身", "ratioMin": "1", "ratioMax": "8" }
]
```

匹配规则：

1. 用模版中的 `shotType` 去匹配配置里的 `scene`
2. 找到对应项后：
   - `range` = 去掉编码前缀后的 `range`
   - `ratioMin` = 配置中的 `ratioMin`
   - `ratioMax` = 配置中的 `ratioMax`

例如：

- 模版中 `shotType = B1特写`
- 命中配置项 `{ "scene": "B1特写", "range": "A1头部", "ratioMin": "50", "ratioMax": "60" }`

最终得到：

```json
{
  "scene": "特写",
  "range": "头部",
  "ratioMin": "50",
  "ratioMax": "60"
}
```

## 6. 完整示例

### 6.1 前端当前所选模版

```json
{
  "key": "portrait_intent_default",
  "value": {
    "bodyRange": "A1头部",
    "shotType": "B1特写",
    "orientation": "C1正脸",
    "compositionMethod": "D1居中构图",
    "cameraHeight": "E4齐眼",
    "eyeStatus": "睁眼",
    "mouthStatus": "微笑"
  }
}
```

### 6.2 对外提交体

```json
{
  "type": "alignment_person",
  "templateKey": "portrait_intent_default",
  "scene": "特写",
  "bodyRange": "头部",
  "range": "头部",
  "ratioMin": "50",
  "ratioMax": "60",
  "orientation": "正脸",
  "compositionMethod": "居中构图",
  "cameraHeight": "齐眼",
  "eyeStatus": "睁眼",
  "mouthStatus": "微笑"
}
```

## 7. 前端校验与失败场景

前端在提交前会做以下检查：

1. 必须先选中一个意图模版
2. 必须能根据模版中的 `shotType` 找到对应的 `shot_subject_ratio_table` 配置

若失败，前端不会发请求，并在页面上显示错误提示。
