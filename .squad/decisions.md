# Squad Decisions

## Active Decisions

### 2026-07-17: UbeROS Init architecture and stack

**By:** copilot (RPI Agent)
**Scope:** UbeROS Init milestone — full Docker Compose scaffold and first-pass services

Initial implementation of the UbeROS Init milestone landed the full Docker
Compose scaffold and first-pass service implementations. Key decisions (recorded
as ADRs under `docs/decisions/`):

- ADR-001 ROS distribution: **Lyrical** (`ROS_DISTRO=lyrical`, `GZ_RELEASE=jetty`).
  SPIKE-A passed on 2026-07-17 — `ros:lyrical-ros-base`, `rosbridge-suite` 4.2.0,
  `rosapi`, `ros-gz` 3.0.9, and the Jetty image all verified. Jazzy/Harmonic
  remain a one-line `.env` fallback.
- ADR-002 Reverse proxy: **Nginx** (single ingress, WebSocket, auth_basic).
- ADR-003 Terminal transport: **ttyd inside the ros container** (no Docker socket).
- ADR-004 Frontend: **Svelte + Golden Layout v2**; browsers Chrome/Edge only.
- ADR-005 Auth: **Nginx auth_basic** for Init (off on localhost), OAuth2-Proxy
  upgrade path; single-user Init must not preclude future multi-user.

**Why:** Establishes the baseline architecture. Scope: localhost-only S1-S6
acceptance; streaming perf (N-08) deferred.

### 2026-07-19: Native Golden Layout pop-out fixed via determinate constructor

**By:** Switch (Frontend Engineer), requested by jmservera
**Scope:** Theme A native pop-out (FR-A1..A6), PR #6, branch `squad/theme-a-native-popout`
**File:** `services/frontend/src/App.svelte` (`onMount`)

**Root cause:** Popped-out child windows (`/?gl-window=...`) rendered BLANK. The app
built `new GoldenLayout(container)` with NO `bindComponentEventHandler`, so GL v2.6
treated the constructor as *indeterminate*. In a sub-window, `VirtualLayout.init()`
then took the indeterminate path: deferred 7ms, then called
`clearHtmlAndAdjustStylesForSubWindow()` which runs `document.body.innerHTML = ''`.
That wiped the Svelte-rendered DOM — including the `bind:this={container}` element —
so `super.init()` built the ground item inside a now-detached container → nothing in
the child `<body>`. The `isSubWindow` guard on `loadLayout` was necessary but not
sufficient; the body wipe was the real culprit.

**Decision / fix:** Use the GL v2 *determinate constructor* pattern — pass a
`bindComponentEventHandler` (and `unbindComponentEventHandler`) to the
`GoldenLayout` constructor. This sets `_bindComponentEventHanlderPassedInConstructor
= true`, which makes init run synchronously and SKIPS the body wipe, preserving the
Svelte-managed DOM. The bind handler dispatches to the existing `factories` map to
build panels; the old `registerComponentFactoryFunction` loop was removed. GL still
sets `window.__glInstance = this` in the sub-window, so parent dock-back /
`popInOnClose` keeps working. Sub-window "suitability" (hiding chrome) remains handled
by the `body.uberos-subwindow` class + CSS. `withNativePopout` (popInOnClose +
header.popout) and the `isSub` guard on `loadLayout` are unchanged.

**Validation:** `npm run build` (vite v5.4.21) passes — 125 modules transformed,
built in 36s. No custom pop-out button code reintroduced (native pop-out only, FR-A6).

### 2026-07-19: Pop-out sub-window UI polish (chrome + title)

**By:** Switch (Frontend Engineer), requested by jmservera
**Scope:** services/frontend/src/App.svelte, services/frontend/src/app.css — sub-window (popped-out) path only. Follow-up polish on the native pop-out entry above.

**What:**
1. **Conditional header render** — Added a URL-derived `isSubWindow` flag
   (`new URLSearchParams(window.location.search).has('gl-window')`) computed
   independently of Golden Layout. Wrapped the entire `<header class="uberos-titlebar">`
   in `{#if !isSubWindow} … {/if}` so the UbeROS brand/menubar is omitted from the
   DOM in popped-out windows rather than hidden via competing CSS. The
   `.uberos-canvas` container is always rendered (GL needs it). Removed the now-dead
   `body.uberos-subwindow .uberos-titlebar { display:none }` rule from app.css and
   updated the adjacent comment; the `uberos-subwindow` body class is still set in
   onMount as a hook for potential future sub-window-only styling.
2. **Panel-named window title** — In onMount, when `layout.isSubWindow` is true, set
   `document.title` from the popped component's title (`layout.rootItem?.title`, with a
   `forEachComponent` walk fallback), so the pop-out window/tab reads the panel name
   (e.g. "Terminal", "Code Editor") instead of the static "UbeROS - Work".

**Why:** Once the determinate constructor stopped wiping document.body, App.svelte's
scoped `.uberos-titlebar { display:flex }` competed with the global hide rule, so the
titlebar leaked into pop-outs. Not rendering the header at all is robust against CSS
specificity. Panel-named titles make multi-display workflows legible.

**Constraints honored:** Main window unchanged (header + title intact). No custom
pop-out button reintroduced; `withNativePopout` (popInOnClose + header.popout) and the
determinate constructor left intact.

**Validation:** `npm run build` (vite) passes — 125 modules, built clean.

### 2026-07-19: All popped-out panels dock back on window close (layout-agnostic net) — SUPERSEDED

> ⚠️ **SUPERSEDED (2026-07-19)** by *"Own native pop-out dock-back via addComponent
> (popInOnClose off)"* and its E2E validation below. This entry cooperated WITH
> `popInOnClose: true` and only filled gaps GL left; it did not correct GL's
> zero-size re-dock (the panel was present but 0×0, so the presence-check skipped
> it). The superseding decision turns `popInOnClose` OFF and OWNS dock-back
> outright. Retained for root-cause history (last-sibling branch destruction).

**By:** Switch (Frontend Engineer), requested by jmservera
**Scope:** Theme A native pop-out dock-back (FR-A2), branch `squad/theme-a-native-popout`
**File:** `services/frontend/src/App.svelte` (`onMount` event wiring + helpers)

**Bug:** With Golden Layout v2.6 native pop-out + `settings.popInOnClose: true`,
closing a popped-out Terminal or Code Editor docked it back into the canvas, but
closing a popped-out Simulator or ROS Status left them closed. All four panels
must dock back on window close.

**Root cause:** GL's `popInOnClose` path (`BrowserPopout.popIn()`) re-docks a
closed pop-out by locating the origin parent it tagged at pop-out time via
`ContentItem.addPopInParentId(parentId)`, then calling
`parentItem.addChild(newItem, indexInParent)`. The tagged parent is the nearest
ancestor that still had more than one child when the panel popped out (the
`createPopoutFromContentItem` walk-up stops there). When a panel is the *last
sibling* in its stack/column, popping it out empties that branch —
`ContentItem.removeChild` destroys a node once it has zero children — so the node
carrying the `popInParentId` no longer exists at close time.
`getItemsByPopInParentId()` then returns nothing and the fallback re-insert uses
a stale `indexInParent` against a re-shaped tree, so the panel is never grafted
back and stays closed. Terminal and Editor kept a sibling in their group (their
parent survived), so GL re-docked them; in the user's saved (localStorage)
layout, Simulator and ROS Status did not — hence the asymmetry. It was never
about iframe-vs-DOM or singleton-vs-multi; it was purely about whether the origin
branch survived the pop-out.

**Decision / fix:** Add a layout-agnostic dock-back safety net alongside (not
replacing) `popInOnClose`. On GL's `windowOpened`, capture the pop-out's
`{componentType, componentState, title}` from `popout.toConfig().root` (walking
for the first component node) keyed by the `BrowserPopout`. On `windowClosed`
(which fires after GL's own popIn has run), if that component is MISSING from the
main layout (checked via the existing `forEachComponent` walk), re-add it with
`layout.addComponent(type, state, title)`; if GL already docked it, do nothing —
preventing double-docking of Terminal/Editor. Terminals are matched by their tmux
`session` id in component state so the exact shell is preserved on re-add (FR-A4)
and a second terminal cannot mask a missing one. No custom "open in new window"
button or `openPanelWindow` logic was reintroduced — native pop-out only.

**Validation:** `npm run build` (vite v5.4.21) passes — 125 modules transformed,
built in ~18s. Manual acceptance (native header pop-out icon AND menu "Pop out"):
pop out and close each of Simulator, Terminal, Editor, ROS Status one at a time;
each docks back; Terminal keeps its shell/session; no panel docks back twice.

### 2026-07-19: Own native pop-out dock-back via addComponent (popInOnClose off) — SUPERSEDED

> ⚠️ **SUPERSEDED (2026-07-19)** by *"Root-fix embedded Golden Layout sizing — remove
> custom dock-back net"* below. Turning `popInOnClose` OFF and owning dock-back via
> `addComponent` fixed the popped-back panel but regressed EVERY panel to
> stuck-until-resize, because the real defect was elsewhere: the embedded (non-`<body>`)
> GL container never had `resizeWithContainerAutomatically` enabled, so GL only reflowed
> on the app's `window 'resize'` handler. The custom net (~100 LOC) was reverted; native
> `popInOnClose: true` restored. Retained for root-cause history.

**By:** Switch (Frontend Engineer), requested by jmservera (repo owner)
**Scope:** services/frontend/src/App.svelte — branch squad/theme-a-native-popout
**Supersedes:** *"All popped-out panels dock back on window close (layout-agnostic net)"* above.

**Root cause.** Golden Layout's `settings.popInOnClose: true` re-docks a closed
pop-out SYNCHRONOUSLY on the child window's `beforeunload`, inserting the
component into `groundItem.contentItems[0]` via a freshly created stack while the
parent is mid-collapse/reflow. GL's `updateNodeSize` reads that element's box as
0×0 at that instant, so the panel is present-in-tree but rendered at ZERO SIZE
until a later global `updateSize` (tab switch / resize / another pop-out). The
previous `windowClosed` net cooperated with popInOnClose and only filled gaps GL
left; it found the panel already present (`componentPresent === true`) and
skipped, so the zero-size re-dock was never corrected. This is NOT panel
identity — the code path is identical for Editor and Simulator singletons. A 0×0
noVNC canvas paints nothing and reconnects (~1s) so Simulator/ROS Status LOOK
broken; a 0-sized code-server iframe flashes and self-corrects, so Editor/Terminal
merely looked fine.

**Fix.** Set `popInOnClose: false` in `withNativePopout` (KEEP `header.popout` so
the native pop-out icon stays — FR-A1). We now OWN dock-back: on `windowClosed`,
after a settle tick, if the component is genuinely absent
(`!componentPresent(cfg)`) we re-add it with
`layout.addComponent(cfg.componentType, cfg.componentState, cfg.title)`, then
`refreshOpenPanels()` + `scheduleInject()` + `layout.updateRootSize(true)` as
force-size insurance. `componentPresent` stays as idempotency insurance (no
duplicates; terminals match on the tmux `session` id so the exact shell is
restored). Determinate constructor, sub-window header omission, and sub-window
title are all unchanged.

**Why this renders correctly.** `layout.addComponent(...)` re-adds a panel at full
size as the active tab immediately (Simulator returned 810×660, no resize needed),
avoiding GL's zero-size popIn path entirely.

**Source-traced event chain (popInOnClose:false).** Confirmed in the installed
golden-layout source: child-window `beforeunload` → `BrowserPopout._onClose()`
directly (no throwing `popIn()`) → `setTimeout(() => emit('closed'), 50)` →
layout-manager `browserPopout.on('closed', () => reconcilePopoutWindows())` →
emits `windowClosed`. (`src/ts/controls/browser-popout.ts` ~223 & ~322;
`src/ts/layout-manager.ts` ~916.)

**FR-A2 note.** A docked-back panel may land in a reasonable stack rather than its
exact original slot — acceptable per the PRD's "sensible fallback" clause.

**Validation:** `npm run build` passes (vite, 125 modules, dist emitted). See the
end-to-end validation below.

### 2026-07-19: Native pop-out DOCK-BACK validated end-to-end (all 4 panels PASS) — QUALIFIED (false-positive)

> ⚠️ **QUALIFIED (2026-07-19):** This PASS was a **false-positive**. Headless Chromium
> masks the stuck-until-resize symptom — a panel re-added mid-reflow can measure
> non-zero in headless even while a real browser (Edge) paints it at a stale/zero size
> until a manual resize. The `addComponent` approach it validated was subsequently
> reverted (see the root-fix decision below). Real-browser validation, or a resize-free
> assertion, is required to gate this symptom. Retained for history.

**By:** Tank (Integration & Test Engineer), requested by jmservera
**Branch:** squad/theme-a-native-popout
**Scope:** Empirical E2E validation of the App.svelte dock-back fix above
(`settings.popInOnClose = false` + our own `windowClosed` → `layout.addComponent(...)`).

**What was added:** New spec `tests/acceptance/s5b-popout-dockback.spec.js` (ESM,
matches existing suite; no existing specs modified). Drives Golden Layout's REAL
native pop-out control (`.lm_header` → `.lm_popout` click →
`context.waitForEvent('page')`), then closes the detached window and asserts
dock-back at non-zero size with no duplicate. One independent `test()` per panel
(fresh clean-localStorage context each) so a failure in one still reports the
others. Ran with Playwright bundled headless Chromium (honors click-initiated
`window.open`; the integrated VS Code browser blocks it).

**Deploy:** `docker compose build frontend` + `docker compose up -d frontend`;
frontend healthy, `GET /healthz` = 200. New bundle confirmed serving.

**Per-panel result — ALL PASS (docked back, count:1, non-zero):**

| Panel | Identifier | Docked-back size | Verdict |
|-------|-----------|------------------|---------|
| Simulator | `iframe.panel-frame` src~`novnc` | 636×660 | ✅ PASS |
| Terminal | `iframe.panel-frame` src~`/terminal/` | 636×660 | ✅ PASS |
| Code Editor | `iframe.panel-frame` src~`/editor/` | 635×660 | ✅ PASS |
| ROS Status | `.panel-body` (non-iframe) | 635×660 | ✅ PASS |

The previous bug (Simulator/ROS Status docked present-but-0×0) is NOT reproduced —
every panel returns at full size, exactly one instance each (no duplicate).

**Key testing finding (documented in the spec).** GL registers its dock-back
trigger as a `beforeunload` listener on the CHILD window from the PARENT realm, and
`reconcilePopoutWindows` only emits `windowClosed` when `getWindow().closed ===
true` (checked once, ~50ms after unload, no retry). Playwright's `popup.close({
runBeforeUnload: true })` does NOT deliver that parent-registered listener →
dock-back never fires (FALSE NEGATIVE). A script-initiated `window.close()` (the
real-user unload path) reliably triggers it. The spec uses `window.close()`.

**Conclusion:** The App.svelte fix WORKS for all four panels — dock-back is real,
at full size, no duplicates.

**Follow-ups:** Pre-existing console noise in editor popout (github auth provider
timeout, package.json 404) is unrelated to dock-back; not investigated. Consider
adding s5b to the default acceptance run if pop-out is a release-gated contract.

### 2026-07-19: Root-fix embedded Golden Layout sizing — remove custom dock-back net

**By:** Switch (Frontend Engineer), requested by jmservera
**Scope:** `services/frontend/src/App.svelte` (branch `squad/theme-a-native-popout`)
**Supersedes:** *"Own native pop-out dock-back via addComponent (popInOnClose off)"* and
qualifies *"Native pop-out DOCK-BACK validated end-to-end (all 4 panels PASS)"* above.

**Root cause:**
The app mounts Golden Layout into a non-`<body>` container (`.uberos-canvas`), so GL
left `resizeWithContainerAutomatically = false` (its default for non-body containers).
GL's internal `ResizeObserver` still observes the container from `init()`, but
`handleContainerResize()` gates on that flag, so it was a no-op. GL therefore reflowed
ONLY when the app called `updateSize()` — which happened solely in a `window 'resize'`
handler. Any panel entering the tree via a structural change (native pop-in dock-back)
was sized mid-reflow and never re-flowed until the next window resize or splitter/tab
drag → panels docked back but rendered invisibly. The prior `addComponent` net
treated the symptom for the popped panel and regressed all panels to
stuck-until-resize.

**Decision:**
Fix the cause, not the symptom. Enable GL's native container auto-resize and delete the
custom dock-back machinery entirely.

- Set `layout.resizeWithContainerAutomatically = true` right after construction — the
  idiomatic embedded setup. `.uberos-canvas` is `flex:1; min-height:0` inside a
  `height:100%` flex column, so a window resize changes the container box → GL's own
  observer debounce-reflows from the real box. This also covers structural dock-back.
- Restore native dock-back: `withNativePopout` now sets `popInOnClose: true` (was
  `false`). GL re-inserts the panel itself; RWCA makes it size immediately.
- Removed the entire custom net: `popoutConfigs` map, helpers `readComponentState`,
  `findComponentInConfig`, `readPoppedConfig`, `componentPresent`, the
  `windowOpened`/`windowClosed` handlers, and the manual `window 'resize'` handler
  (redundant once RWCA is on) plus its cleanup.

**Net effect:** Code shrinks (≈100 net LOC removed). Verified against golden-layout v2
source (`layout-manager.ts`): the flag is the exact on/off switch, the observer is
attached to our container, and `updateSizeFromContainer()` reads the container's real
box. Determinate constructor, sub-window header omission, and sub-window title are all
unchanged.

**Deploy:** Coordinator ran `docker compose build frontend` + `docker compose up -d
frontend`; frontend healthy, `/healthz` 200, bundle `index-CAYET3wX.js` live.

**Validation status:** `npm run build` passes (no unused-var warnings) and the fix is
deployed, but behavior is **PENDING real-browser (Edge) validation by the user**.
Automated gating is unreliable for this symptom — the integrated VS Code browser blocks
`window.open`, and headless Chromium masks the stuck-until-resize symptom (Tank's
earlier s5b PASS was a false-positive on the broken build). Do not claim it works until
Edge confirms.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
