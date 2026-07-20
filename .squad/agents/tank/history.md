# Project Context

- **Owner:** jmservera
- **Project:** Browser-accessible ROS and simulator environment on Docker Compose
- **Stack:** ROS, Gazebo, Docker Compose, noVNC, browser-based VS Code, web terminals, Nginx or Traefik, web frontend
- **Created:** 2026-07-17T09:22:05.804+02:00

## Learnings

- Quality coverage must span Compose health, ROS behavior, browser streaming, editor and terminal access, and multi-display pop-outs.
- Reconnect, persistence, and failure recovery need explicit acceptance criteria.
- **Testing GL native pop-out dock-back (2026-07-19):** To exercise Golden Layout's
  dock-back in Playwright, use a script-initiated `window.close()` (the real-user
  unload path) — NOT `popup.close({ runBeforeUnload: true })`. GL registers its
  dock-back trigger as a `beforeunload` listener on the CHILD window from the PARENT
  realm; `popup.close({runBeforeUnload})` does not deliver that parent-registered
  listener, so `reconcilePopoutWindows` never sees `getWindow().closed === true`
  (checked once ~50ms after unload, no retry) and `windowClosed` never fires →
  FALSE NEGATIVE. Also: the integrated VS Code browser blocks click-initiated
  `window.open`, so pop-out E2E must run in Playwright's bundled headless Chromium.
  Drive the real control via `.lm_header` → `.lm_popout` click +
  `context.waitForEvent('page')`. Spec `tests/acceptance/s5b-popout-dockback.spec.js`
  — one independent `test()` per panel, fresh clean-localStorage context each; all
  4 panels validated docking back at full size, count 1.
- **⚠️ Headless Chromium masks stuck-until-resize (2026-07-19, s5b was a
  FALSE-POSITIVE):** The s5b PASS above validated the `addComponent` dock-back approach,
  but that PASS did NOT catch the real defect — panels docking back at a stale/zero size
  until a manual resize. Headless Chromium can measure a mid-reflow re-added panel as
  non-zero even when a real browser (Edge) paints it at stale/zero size until the user
  resizes/drags. So the s5b assertion (docked-back size non-zero in headless) is NOT a
  reliable gate for this symptom, and it green-lit a broken build. **For sizing/reflow
  symptoms, require real-browser (Edge) validation OR a resize-free assertion** (e.g.
  assert the panel paints correctly WITHOUT triggering any window resize / splitter /
  tab drag between dock-back and measurement). The actual root cause was the embedded GL
  container missing `resizeWithContainerAutomatically = true` (see Switch's history); the
  `addComponent` net was reverted.
- **FINAL — s5b rewritten for the native pop-in button model (2026-07-20):** Root cause
  was confirmed (via Switch's real-Chrome beacons) as GL's `beforeunload`-bound dock-back
  not firing for passive panels; final fix is `popInOnClose:false` +
  `layout.checkAddDefaultPopinButton()` (GL's native `.lm_popin` button, `popIn` event
  path). Rewrote `tests/acceptance/s5b-popout-dockback.spec.js` for this model — per
  panel: pop out via `.lm_popout`, assert `.lm_popin` visible in the popup, click it,
  assert the popup closes + panel back in main canvas at non-zero size, no duplicate; plus
  a test that OS-close (`window.close()`) leaves the panel closed. `npx playwright test
  s5b-popout-dockback` → **5 passed** (Simulator, Terminal, Code Editor, ROS Status,
  OS-close-no-dock). **Key testing insight:** because the pop-in BUTTON uses GL's `popIn`
  event (NOT `beforeunload`), headless Chromium validates it faithfully — no
  false-positive risk, unlike the earlier reverted `addComponent`/close-based approach
  where headless masked the stuck-until-resize symptom. Beacon-based diagnosis (routing
  `[UBEROS-DIAG]` beacons through nginx access logs) was how the beforeunload root cause
  was proven in the user's real browser when Playwright could not reproduce it.
