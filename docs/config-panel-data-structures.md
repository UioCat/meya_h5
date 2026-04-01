# 配置页数据结构说明

本文档整理当前 [ConfigPanel.tsx](/Users/hanxun/Downloads/project/src/components/ConfigPanel.tsx) 中各个配置块的数据结构，区分：
- 写入后端 `config_server` 的配置
- 仅前端静态展示或本地状态的配置

配置服务基础地址：
- `https://www.uiofield.top/config_server`

## 1. 一、构图关键参数

当前状态：
- 仅静态展示
- 不读取后端
- 不保存后端

展示项：
- 身体范围（A）
- 景别类型（B）
- 方位角（C）
- 构图方法（D）
- 机位高度（E）
- 空间关系（K）

## 2. 二、景别与主体占比

后端存储：
- `type`: `basic_config`
- `key`: `shot_subject_ratio_table`

当前前端编辑模型：
```json
[
  { "scene": "B1特写", "range": "A1头部", "ratioMin": "50", "ratioMax": "60" },
  { "scene": "B2近景", "range": "A2肩部及以上", "ratioMin": "45", "ratioMax": "60" },
  { "scene": "B3中近景", "range": "A3髋部及以上", "ratioMin": "32", "ratioMax": "45" },
  { "scene": "B4中景", "range": "A4膝部及以上", "ratioMin": "22", "ratioMax": "32" },
  { "scene": "B6远景", "range": "A5全身", "ratioMin": "1", "ratioMax": "8" }
]
```

写入后端格式：
```json
[
  { "scene": "B1特写", "range": "A1头部", "ratioMin": "50", "ratioMax": "60" },
  { "scene": "B2近景", "range": "A2肩部及以上", "ratioMin": "45", "ratioMax": "60" },
  { "scene": "B3中近景", "range": "A3髋部及以上", "ratioMin": "32", "ratioMax": "45" },
  { "scene": "B4中景", "range": "A4膝部及以上", "ratioMin": "22", "ratioMax": "32" },
  { "scene": "B6远景", "range": "A5全身", "ratioMin": "1", "ratioMax": "8" }
]
```

保存校验：
- `范围`、`最小比例`、`最大比例` 不能为空
- `最小比例`、`最大比例` 必须是数字
- `最小比例 <= 最大比例`
- `scene`、`range` 存储完整编码值，例如 `B1特写`、`A1头部`
- 所有编码值中间不带空格

## 3. 三、主体占比评价标准

当前状态：
- 未实现
- 不读取后端
- 不保存后端

## 4. 四、主体偏离度评分标准

后端存储：
- `type`: `basic_config`
- `key`: `subject_offset_score_table`

当前前端编辑模型：
```json
{
  "B1": { "scene": "B1特写", "x1": "12", "x2": "20" },
  "B2": { "scene": "B2近景", "x1": "10", "x2": "16" },
  "B3": { "scene": "B3中近景", "x1": "7.5", "x2": "12.5" },
  "B4": { "scene": "B4中景", "x1": "5.5", "x2": "9.5" },
  "B5": { "scene": "B5远景", "x1": "3", "x2": "6" }
}
```

含义：
- `x1`: `好~中 阈值`
- `x2`: `中~差 阈值`

页面展示规则：
- `[0～x1] = 好`
- `(x1～x2) = 中`
- `[x2～100] = 差`

写入后端格式：
```json
[
  { "特写": { "X1": 12, "X2": 20 } },
  { "近景": { "X1": 10, "X2": 16 } },
  { "中近景": { "X1": 7.5, "X2": 12.5 } },
  { "中景": { "X1": 5.5, "X2": 9.5 } },
  { "远景": { "X1": 3, "X2": 6 } }
]
```

保存校验：
- `好~中 阈值`、`中~差 阈值` 不能为空
- 两者必须是数字
- `好~中 阈值 < 中~差 阈值`
- 两者取值范围在 `0 ~ 100`

兼容说明：
- 当前前端兼容读取旧版 `good / normal / bad` 矩阵结构
- 读取后会自动转换为 `X1 / X2` 编辑模型

## 5. 五、引导线配置

当前状态：
- 未实现
- 不读取后端
- 不保存后端

## 6. 六、笑容检测参数

后端存储：
- `type`: `basic_config`
- `key`: `smile_detection_settings`

写入后端格式：
```json
{
  "scoreWeightPercent": 50,
  "mouthWidthMicroSmile": 0.65,
  "mouthWidthBigSmile": 0.7,
  "mouthCornerMicroSmile": -0.04,
  "mouthCornerBigSmile": -0.07
}
```

字段说明：
- `scoreWeightPercent`: 上扬权重百分比，`0 ~ 100`
- `mouthWidthMicroSmile`: 嘴巴宽度微笑阈值，`0 ~ 1`
- `mouthWidthBigSmile`: 嘴巴宽度大笑阈值，`0 ~ 1`
- `mouthCornerMicroSmile`: 嘴角上扬微笑阈值，`-0.2 ~ 0`
- `mouthCornerBigSmile`: 嘴角上扬大笑阈值，`-0.2 ~ 0`

## 7. 七、拍照阈值设置

后端存储：
- `type`: `basic_config`
- `key`: `photo_threshold_settings`

写入后端格式：
```json
{
  "body_overlap": { "enabled": true, "operator": ">", "value": "90" },
  "face_orientation": { "enabled": true, "operator": ">", "value": "70" },
  "eye_status": { "enabled": true, "operator": ">", "value": "95" },
  "overall_score": { "enabled": true, "operator": ">", "value": "80" }
}
```

字段说明：
- `enabled`: 是否启用
- `operator`: 比较符，当前支持 `>`, `>=`, `<`, `<=`, `=`
- `value`: 阈值，当前按字符串存储，界面中允许输入数字

## 8. 八、拍摄终端设置

当前状态：
- 仅前端本地状态
- 不读取后端
- 不保存后端
- 后续预留为“切换终端时调用接口或修改本地变量”

当前前端本地状态结构：
```json
{
  "phoneDeviceName": "本机 Mac",
  "phoneStatus": "已连接",
  "droneModel": "DJI AIR2",
  "droneDeviceName": "DJI AIR2",
  "droneStatus": "连接"
}
```

当前交互规则：
- `移动终端` 与 `无人机` 互斥连接
- 点击一方 `连接` 后，另一方自动切回 `连接`
- 该状态目前不会持久化

## 9. 意图模版

后端存储：
- `type`: `intent_template`
- `key`: 模版名称，由用户输入

当前前端编辑模型：
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

取值规则：
- `bodyRange`、`shotType`、`orientation`、`compositionMethod`、`cameraHeight` 使用完整编码值
- 例如：`A1头部`、`B1特写`、`C1正脸`、`D1居中构图`、`E4齐眼`
- 所有编码值中间不带空格

每次保存到后端的模版 JSON：
```json
{
  "type": "intent_template",
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

选项来源：
- `身体范围（A）`：读取“一、构图关键参数”中的 A 选项
- `景别类型（B）`：读取“一、构图关键参数”中的 B 选项
- `方位角（C）`：读取“一、构图关键参数”中的 C 选项
- `构图方法（D）`：读取“一、构图关键参数”中的 D 选项
- `机位高度（E）`：读取“一、构图关键参数”中的 E 选项
- `眼睛状态`：当前使用固定枚举 `闭眼 / 一睁一闭 / 睁眼`
- `嘴巴状态`：当前使用固定枚举 `不笑 / 微笑 / 大笑`

保存校验：
- 7 个字段都必须有值
- 7 个字段的值都必须在各自下拉可选范围内

对准-人模式提交转换示例：
- 当意图模版中 `shotType = "B1特写"` 时，前端会去读取 `shot_subject_ratio_table`
- 找到对应 `scene = "B1特写"` 的配置后，转换出具体参数再发送

示例提交体：
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
