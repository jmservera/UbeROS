# Project Context

- **Owner:** jmservera
- **Project:** Browser-accessible ROS and simulator environment on Docker Compose
- **Stack:** ROS, Gazebo, Docker Compose, noVNC, browser-based VS Code, web terminals, Nginx or Traefik, web frontend
- **Created:** 2026-07-17T09:22:05.804+02:00

## Learnings

- The workspace must manage multiple GUI, editor, and terminal windows inside a browser canvas.
- noVNC sessions must also open independently in separate browser windows for multi-display workflows.
- **Golden Layout v2 sub-window body wipe (2026-07-19):** A blank GL pop-out
  (`/?gl-window=...`) is caused by the *indeterminate* constructor path. When
  `new GoldenLayout(container)` is built WITHOUT a `bindComponentEventHandler`, GL v2
  treats init as indeterminate; in a sub-window it calls
  `clearHtmlAndAdjustStylesForSubWindow()` → `document.body.innerHTML = ''`, which
  destroys any framework-managed (Svelte) container element before `super.init()`
  runs. Fix: use the **determinate constructor** — pass
  `bindComponentEventHandler` (+ `unbindComponentEventHandler`). This sets
  `_bindComponentEventHanlderPassedInConstructor = true`, makes init synchronous, and
  SKIPS the body wipe. `window.__glInstance` is still set in the sub-window, so
  dock-back / `popInOnClose` keep working. The `isSubWindow` guard on `loadLayout`
  alone is necessary but NOT sufficient — the body wipe is the real culprit.
- **GL sub-window chrome & title (2026-07-19):** With the *determinate* constructor
  the framework DOM is preserved (no `document.body` wipe), so a global CSS hide rule
  competes with App.svelte's scoped `.uberos-titlebar { display:flex }` and the
  titlebar leaks into pop-outs. Robust fix: hide non-panel chrome via **conditional
  render** (`{#if !isSubWindow}` around the header, flag from `?gl-window`) instead of
  CSS. Also set `document.title` from `layout.rootItem?.title` (with a
  `forEachComponent` fallback) in the sub-window branch so the pop-out window/tab
  reads the panel name rather than the static app title.
- **GL `popInOnClose` is fragile for last-sibling panels (2026-07-19):** GL only
  re-docks a closed pop-out when the origin parent it tagged with `popInParentId`
  still exists AND `indexInParent` is still valid at close time. A panel that is the
  *last sibling* in its stack/column destroys that branch on pop-out, so
  `getItemsByPopInParentId` returns nothing and the stale-index fallback drops it —
  the panel stays closed (this is why Simulator/ROS Status didn't dock back but
  Terminal/Editor did). Fix: a **layout-agnostic `windowOpened`/`windowClosed`
  presence-check net** — capture the popped component config on open, and on close
  re-add via `layout.addComponent` ONLY if the component is MISSING from the main
  layout. Cooperates with `popInOnClose` without double-docking. Match terminals by
  tmux `session` id in component state to preserve the shell and avoid one terminal
  masking a missing one.- **REAL root cause — GL `popInOnClose` re-docks at 0×0 (2026-07-19, supersedes the
  net above):** The earlier presence-check net was NOT the fix. GL's
  `settings.popInOnClose: true` re-docks a closed pop-out SYNCHRONOUSLY on the
  child `beforeunload`, inserting into `groundItem.contentItems[0]` while the parent
  is mid-reflow — so `updateNodeSize` reads the box as 0×0 and the panel is
  present-but-zero-size until a later global `updateSize`. The `windowClosed` net saw
  `componentPresent === true` and skipped, never correcting it (a 0×0 noVNC canvas
  paints nothing + reconnects ~1s → LOOKS broken; a 0-sized iframe self-corrects →
  Editor/Terminal looked fine). **Fix: set `popInOnClose: false` (KEEP
  `header.popout`) and OWN dock-back** — on `windowClosed`, if genuinely absent,
  `layout.addComponent(type, state, title)` (re-adds at full size as active tab,
  ~810×660, no resize needed), then `updateRootSize(true)` as insurance.
  `componentPresent` stays purely as duplicate/idempotency insurance. Source-traced
  chain (popInOnClose:false): `beforeunload` → `BrowserPopout._onClose()` →
  `setTimeout(emit('closed'), 50)` → `reconcilePopoutWindows()` → `windowClosed`.
  `npm run build` passes; validated E2E by Tank (all 4 panels dock back full-size).
- **ACTUAL root cause — embedded GL missing `resizeWithContainerAutomatically`
  (2026-07-19, supersedes the `addComponent` net above):** The `addComponent` dock-back
  net was NOT the fix either — it treated the symptom for the popped panel and regressed
  EVERY panel to stuck-until-resize. Real defect: the app mounts GL into a non-`<body>`
  container (`.uberos-canvas`), so GL leaves `resizeWithContainerAutomatically = false`
  by default. GL's internal `ResizeObserver` still observes the container, but
  `handleContainerResize()` gates on that flag → no-op. So GL reflowed ONLY when the app
  called `updateSize()`, which happened solely in a `window 'resize'` handler. Any panel
  entering the tree via a structural change (native pop-in dock-back) was sized
  mid-reflow and never re-flowed until the next window resize or splitter/tab drag →
  docked back but rendered invisibly (stale/zero size). **Fix: set
  `layout.resizeWithContainerAutomatically = true` after construction** (the idiomatic
  embedded setup — `.uberos-canvas` is `flex:1; min-height:0` in a `height:100%` flex
  column, so a resize changes the container box → GL's own observer debounce-reflows),
  restore native `popInOnClose: true`, and DELETE the entire custom net (~100 LOC:
  `popoutConfigs`, `readComponentState`, `findComponentInConfig`, `readPoppedConfig`,
  `componentPresent`, `windowOpened`/`windowClosed`, and the manual `window 'resize'`
  handler which is redundant once RWCA is on). Verified vs golden-layout `layout-manager.ts`.
  Determinate constructor + sub-window header omission + sub-window title unchanged.
  `npm run build` passes; deployed (bundle `index-CAYET3wX.js`, `/healthz` 200). **PENDING
  real-browser (Edge) validation** — automated gating unreliable for this symptom.