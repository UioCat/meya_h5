# 页面 Spec 索引

本文档目录描述当前前端页面的预期行为。后续改页面、接口或交互时，需要同步更新对应 spec。

## 页面清单

| 页面 | 入口 | 组件 | Spec |
| --- | --- | --- | --- |
| App 壳与底部导航 | 应用根节点 | `src/App.tsx` | [app-shell.md](app-shell.md) |
| 拍摄 | 底部 `拍摄` | `src/components/LivePusher.tsx` | [capture-page.md](capture-page.md) |
| 照片库 | 底部 `照片库` | `src/components/PhotoLibrary.tsx` | [photo-library-page.md](photo-library-page.md) |
| 配置 | 底部 `配置` | `src/components/ConfigPanel.tsx` | [config-page.md](config-page.md) |

## 全局规则

- 三个底部页面必须通过隐藏/显示保留实例，不使用卸载重建。
- 页面均使用深色 Slate 视觉体系，并需要同时适配手机端与桌面端。
- 当前没有 React Router；不要为现有三页引入路由，除非用户明确要求。
- 涉及外部协议时，以 `docs/alignment-person-api.md` 和 `docs/config-panel-data-structures.md` 为当前协议依据。
- 历史 Codex worktree 中存在统一 display 协议探索，但当前 worktree 仍以 `LivePusher.tsx` 内现有渲染逻辑为准。
