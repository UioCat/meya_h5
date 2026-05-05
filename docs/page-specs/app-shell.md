# App 壳与底部导航 Spec

## Source

- 组件：`src/App.tsx`
- 子页面：`LivePusher`、`PhotoLibrary`、`ConfigPanel`

## Purpose

`App` 提供应用外壳、底部三入口导航和跨页面 toast。它不承载业务接口，只负责保留页面实例并切换可见性。

## Layout

- 根节点使用整页 `bg-slate-900` 深色背景。
- 页面内容区占满宽度。
- 底部导航固定在页面流底部，三列等宽：`拍摄`、`照片库`、`配置`。
- 导航区与页面主体背景保持同一 Slate 体系，不能出现明显断层。
- toast 固定在顶部居中，约 2.2 秒后自动消失。

## Behavior

- 初始选中 `拍摄`。
- 点击 `拍摄` 显示 `LivePusher`。
- 点击 `照片库` 显示 `PhotoLibrary`。
- 点击 `配置` 显示 `ConfigPanel`。
- 三个子页面始终挂载，只通过 `block` / `hidden` 切换可见性。
- `PhotoLibrary` 和 `ConfigPanel` 可通过 `notify` 回调触发 App 级 toast。

## Constraints

- 不要改成条件渲染卸载页面实例。
- 不要改变底部入口数量、名称或映射，除非用户明确要求。
- 新增入口前必须评估手机端底部导航拥挤问题。
- 不要把桌面端内容区域固定成手机竖屏宽度。

## Acceptance

- 切换标签后，`LivePusher` 的 WebSocket、推流/旁观状态和算法状态不会因为组件卸载而丢失。
- 手机端底部导航可触达且不被安全区遮挡。
- 桌面端内容区域保持较宽展示。
