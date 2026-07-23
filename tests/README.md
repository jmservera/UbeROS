<!-- markdownlint-disable-file -->
# UbeROS Acceptance Tests (WP-15)

Machine-verification of the six Initial Success Criteria (S1–S6) from
[`docs/specs/01-Init.md`](../docs/specs/01-Init.md), the workspace-management
criteria (S7–S9) from
[`docs/brds/uberos-workspace-management-brd.md`](../docs/brds/uberos-workspace-management-brd.md),
and the simulation-visualization criteria (S10) from
[`docs/prds/uberos-simulation-visualization.md`](../docs/prds/uberos-simulation-visualization.md)
against a **running** stack.

## Prerequisites

- The full stack is up and healthy, including the on-demand simulators: from the
  repo root run `docker compose --profile simulators up -d`. All nine services
  (`discovery-server, ros, gazebo, gzweb-client, turtlesim, editor, frontend,
  control, proxy`) must report `healthy`.
- Node.js 18+ (uses the built-in `fetch`).
- Docker CLI available on `PATH` (the S1/S4b/S5/S6/S9/S10 checks inspect and
  drive container state).

## Install

Direct npmjs.org access is not permitted; install through the corporate proxy
registry:

```bash
cd tests
npm install --registry https://packagefeedproxy.microsoft.io/npm/
npx playwright install chromium
```

## Run

```bash
# Fast curl-style smoke (S1 health + proxy routing)
npm run smoke          # cross-platform (Node fetch)
./smoke.sh             # bash/curl variant for CI

# Full browser acceptance suite (S1–S6)
npm test
npm run report         # open the HTML report
```

Override the ingress with `UBEROS_PORT` or `UBEROS_BASE_URL` if you changed the
proxy port.

## Criteria mapping

| Criterion | Spec intent | Machine-testable check | File |
|-----------|-------------|------------------------|------|
| S1 | `docker compose up` starts all services without error | The S1 health assertion checks 7 runtime services (`discovery-server`, `ros`, `simulator`, `vnc`, `editor`, `frontend`, `proxy`) report `healthy`; `/healthz` returns `200 "ok"` | `acceptance/s1-stack-health.spec.js` |
| S2 | Window manager with ≥ 1 panel | Root returns 200; ≥ 1 `iframe.panel-frame[src]` in the DOM | `acceptance/s2-window-manager.spec.js` |
| S3 | ROS command in a terminal shows output | ttyd endpoint serves; `/rosout` visible via rosbridge within 5s | `acceptance/s3-terminal-ros.spec.js` |
| S4a | Gazebo GUI reaches the browser via gzweb | `/gzweb/` client opens the `/gzweb/ws/` scene-state WebSocket and mounts a Three.js `<canvas>` | `acceptance/s4a-gazebo-gzweb.spec.js` |
| S4b | Turtlesim GUI visible in noVNC | Non-blank noVNC canvas at `/sim/turtlesim/novnc/` within 30s (> 5% non-black pixels) | `acceptance/s4b-turtlesim-novnc.spec.js` |
| S5 | Pop-out does not terminate the session | All services stay healthy after a detached window closes | `acceptance/s5-popout-isolation.spec.js` |
| S6 | Editor opens, edits, saves in the ROS workspace | A file written via the editor container is readable from the ROS container | `acceptance/s6-editor-workspace.spec.js` |
| S7 | System menu recovers/hides/rearranges panels | Close+reopen a panel, add a terminal, apply a layout via the menu (BR-001/003/005/006) | `acceptance/s7-system-menu.spec.js` |
| S8 | Optional auth toggles; health stays open | `/healthz` always 200; `/control/config` reports auth mode; `/logout` challenges (BR-008/010) | `acceptance/s8-auth-toggle.spec.js` |
| S9 | Individual service reset | Restart one allowlisted service to healthy; others keep running; non-allowlisted rejected (BR-007) | `acceptance/s9-service-reset.spec.js` |
| S10 | Simulator menu + lifecycle | `GET /control/simulators` lists gazebo+turtlesim with state; the SPA "Simulators" menu renders them; a stop→launch cycle transitions state (Themes A/B) | `acceptance/s10-simulator-menu.spec.js` |

S4a exercises the gzweb scene-state path (Theme F: headless `gz sim -s` +
WebsocketServer streamed to a client-side Three.js renderer). S4b covers the
noVNC Turtlesim path (Theme C).
