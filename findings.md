# Findings

## Source Findings

- `src/App.tsx` renders three bottom-tab entries with hidden/show classes: `拍摄` -> `LivePusher`, `照片库` -> `PhotoLibrary`, `配置` -> `ConfigPanel`.
- All tab components are mounted at once, so tab switching preserves page state and long-lived effects.
- `PhotoLibrary` is implemented. It loads/saves `photo_library` KV items, compresses large images before upload, previews with `object-contain`, submits `guide_line_lite` to `https://www.uiofield.top/meya/push`, and receives `guide_line_lite_result` over `wss://www.uiofield.top/meya/ws`.
- `ConfigPanel` is the active config page, not bare `TemplateManager`. It has `基础配置`, `意图模版`, and unsupported `分析结果` tabs.
- `TemplateManager` manages `intent_template` KV records and supports list/detail modes, create/view/edit/delete, and key rename by create-new + delete-old.
- `LivePusher` carries Tencent live pusher, drone spectator/WHEP, WebSocket parsing, upload-template, alignment-person, guide-line overlays, notifications, command console, and movement hints.
- Current `LivePusher` source initializes `isConsoleExpanded` to `true`, while existing AGENTS/history say command console should default to collapsed. This is a known drift.

## Codex Conversation Findings

- March 2026 history established `notify` WS messages, `algoType`-based display separation, and clearing previous algorithm state when `algoType` changes.
- Template/config history standardized English keys, no-space coded option values such as `A1头部` and `B1特写`, A/B option filtering, `cameraHeight`, and complete `alignment_person` payload documentation.
- April 2026 history added editable template names, A-to-B filtering in templates, guide-line line colors, and WebSocket StrictMode context.
- May 4 history made photo library submit `guide_line_lite` by HTTP and consume results over WebSocket.
- May 5 history compressed large photo uploads and fixed main preview display to contain images.
- Worktree `9703` contains a completed unified display refactor and `docs/live-display-protocol.md`, but current worktree `6628` does not have `LiveDisplay.tsx`; docs should avoid pretending it is implemented here.

## Documentation Targets

- Update `AGENTS.md` to reflect active app/page mapping, implemented photo library, config panel shape, service endpoints, and known display/refactor constraints.
- Add page specs for app shell, capture page, photo library page, and config page.
