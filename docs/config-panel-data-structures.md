# 配置页数据结构说明

本文档整理当前 [ConfigPanel.tsx](/Users/hanxun/Downloads/project/src/components/ConfigPanel.tsx) 中各个配置块的数据结构，区分：
- 写入后端 `config_server` 的配置
- 仅前端静态展示或本地状态的配置

配置服务基础地址：
- `https://www.uiofield.top/config_server`

## 1. 一、构图关键参数

当前状态：
- A. 身体范围（A）读取并保存后端
- B. 景别类型（B）读取并保存后端
- 其余项当前仍为静态展示

展示项：
- 身体范围（A）
- 景别类型（B）
- 方位角（C）
- 构图方法（D）
- 机位高度（E）
- 空间关系（K）

身体范围（A）后端存储：
- `type`: `basic_config`
- `key`: `composition_body_range_options`

身体范围（A）写入后端格式：
```json
[
  { "code": "A6", "name": "半身" },
  { "code": "A7", "name": "脚部及以上" }
]
```

身体范围（A）页面规则：
- 默认固定展示 5 项：`A1头部`、`A2胸部及以上`、`A3腰部及以上`、`A4膝盖及以上`、`A5全身`
- 默认 5 项不可删除、不可修改
- 用户新增项支持新增、修改、删除
- 模版页和景别与主体占比页共用同一套身体范围选项

景别类型（B）后端存储：
- `type`: `basic_config`
- `key`: `composition_shot_type_options`

景别类型（B）页面规则：
- 默认固定展示 5 项：`B1特写`、`B2近景`、`B3中近景`、`B4中景`、`B5远景`
- 默认 5 项不可删除、不可修改
- 用户新增项支持新增、修改、删除
- 模版页和景别与主体占比页共用同一套景别类型选项

## 2. 二、景别与主体占比

后端存储：
- `type`: `basic_config`
- `key`: `shot_subject_ratio_table`

当前前端编辑模型：
```json
{
  "B1特写": {
    "A1头部": "-",
    "A2胸部及以上": "-",
    "A3腰部及以上": "-",
    "A4膝盖及以上": "-",
    "A5全身": "-"
  },
  "B2近景": {
    "A1头部": "-",
    "A2胸部及以上": "50",
    "A3腰部及以上": "-",
    "A4膝盖及以上": "-",
    "A5全身": "-"
  }
}
```

写入后端格式：
```json
{
  "B1特写": {
    "A1头部": "-",
    "A2胸部及以上": "-",
    "A3腰部及以上": "-",
    "A4膝盖及以上": "-",
    "A5全身": "-"
  },
  "B2近景": {
    "A1头部": "-",
    "A2胸部及以上": "50",
    "A3腰部及以上": "-",
    "A4膝盖及以上": "-",
    "A5全身": "-"
  }
}
```

保存校验：
- 行来自 `B`，列来自 `A`
- 单元格只填写一个 `0 ~ 100` 的数字，展示时自动补 `%`
- 留空或 `-` 表示该格未配置
- 运行时会解析成所需的 `ratioMin / ratioMax`
- `50` 会被解析为 `ratioMin = 50`、`ratioMax = 50`
- 行列标题存储完整编码值，例如 `B1特写`、`A1头部`
- 所有编码值中间不带空格

## 3. 三、主体占比评价标准

后端存储：
- `type`: `basic_config`
- `key`: `subject_ratio_score_table`

当前前端编辑模型：
```json
{
  "B1特写": {
    "A1头部": null,
    "A2胸部及以上": null,
    "A3腰部及以上": null,
    "A4膝盖及以上": null,
    "A5全身": null
  },
  "B2近景": {
    "A1头部": null,
    "A2胸部及以上": { "min": "45", "max": "60" },
    "A3腰部及以上": null,
    "A4膝盖及以上": null,
    "A5全身": null
  },
  "B3中近景": {
    "A1头部": null,
    "A2胸部及以上": null,
    "A3腰部及以上": { "min": "32", "max": "45" },
    "A4膝盖及以上": null,
    "A5全身": null
  },
  "B4中景": {
    "A1头部": null,
    "A2胸部及以上": null,
    "A3腰部及以上": null,
    "A4膝盖及以上": { "min": "22", "max": "32" },
    "A5全身": { "min": "8", "max": "22" }
  },
  "B5远景": {
    "A1头部": null,
    "A2胸部及以上": null,
    "A3腰部及以上": null,
    "A4膝盖及以上": null,
    "A5全身": { "min": "1", "max": "8" }
  }
}
```

写入后端格式：
```json
{
  "B2近景": {
    "A2胸部及以上": { "min": 45, "max": 60 }
  },
  "B3中近景": {
    "A3腰部及以上": { "min": 32, "max": 45 }
  },
  "B4中景": {
    "A4膝盖及以上": { "min": 22, "max": 32 },
    "A5全身": { "min": 8, "max": 22 }
  },
  "B5远景": {
    "A5全身": { "min": 1, "max": 8 }
  }
}
```

页面展示规则：
- 行来自 `B`，列来自 `A`
- 每个单元格默认是前开后闭区间：`(x%, y%]`
- 用户只填写两个 `0 ~ 100` 的整数，百分号和括号由页面自动补全
- 两个输入都留空表示该格未配置

保存校验：
- 两个值都必须是 `0 ~ 100` 的整数
- 必须满足左值 `<` 右值，才能形成前开后闭区间
- 行列标题存储完整编码值，例如 `B2近景`、`A2胸部及以上`
- 所有编码值中间不带空格

输入规则：
- 前端输入框不显示浏览器自带的上下调节按钮
- 手机端优先压缩单元格间距，桌面端恢复更舒展的留白
- 读取到历史小数值时，前端会按四舍五入归整为整数后再展示和编辑

## 4. 四、主体偏离度评分标准

后端存储：
- `type`: `basic_config`
- `key`: `subject_offset_score_table`

当前前端编辑模型：
```json
{
  "B1": { "scene": "B1特写", "x1": "12", "x2": "20" },
  "B2": { "scene": "B2近景", "x1": "10", "x2": "16" },
  "B3": { "scene": "B3中近景", "x1": "8", "x2": "13" },
  "B4": { "scene": "B4中景", "x1": "6", "x2": "10" },
  "B5": { "scene": "B5远景", "x1": "3", "x2": "6" }
}
```

页面展示规则：
- 表格列固定为 `好`、`一般`、`差`
- 每行仍然只维护两个分界点：
  - `x1`: `好 / 一般` 分界点
  - `x2`: `一般 / 差` 分界点
- 页面展示为：
  - `好 = [0%, x1%]`
  - `一般 = (x1%, x2%]`
  - `差 = (x2%, 100%]`
- 编辑时只需填写两个 `0 ~ 100` 的数字，百分号和区间括号由页面自动补全

写入后端格式：
```json
[
  { "特写": { "X1": 12, "X2": 20 } },
  { "近景": { "X1": 10, "X2": 16 } },
  { "中近景": { "X1": 8, "X2": 13 } },
  { "中景": { "X1": 6, "X2": 10 } },
  { "远景": { "X1": 3, "X2": 6 } }
]
```

保存校验：
- 两个分界点不能为空
- 两者必须是整数
- `x1 < x2`
- 两者取值范围在 `0 ~ 100`

输入规则：
- 前端输入框不显示浏览器自带的上下调节按钮
- 只允许录入整数
- 读取到历史小数值时，前端会按四舍五入归整为整数后再展示和编辑

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
  "compositionObject": "双眼中心点",
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
    "compositionObject": "双眼中心点",
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
- `构图对象`：当前使用固定枚举 `人体头部中心点 / 双眼中心点`
- `机位高度（E）`：读取“一、构图关键参数”中的 E 选项
- `眼睛状态`：当前使用固定枚举 `闭眼 / 一睁一闭 / 睁眼`
- `嘴巴状态`：当前使用固定枚举 `不笑 / 微笑 / 大笑`

保存校验：
- 8 个字段都必须有值
- 8 个字段的值都必须在各自下拉可选范围内

对准-人模式提交转换示例：
- 当意图模版中 `shotType = "B2近景"` 且 `bodyRange = "A2胸部及以上"` 时，前端会去读取 `shot_subject_ratio_table`
- 找到对应 `scene = "B2近景"`、`range = "A2胸部及以上"` 的单元格后，转换出具体参数再发送

示例提交体：
```json
{
  "type": "alignment_person",
  "templateKey": "portrait_intent_default",
  "scene": "近景",
  "bodyRange": "胸部及以上",
  "range": "胸部及以上",
  "ratioMin": "50",
  "ratioMax": "50",
  "orientation": "正脸",
  "compositionMethod": "居中构图",
  "compositionObject": "双眼中心点",
  "cameraHeight": "齐眼",
  "eyeStatus": "睁眼",
  "mouthStatus": "微笑"
}
```
