# ADR-009: Simulator Display Transport and GPU Rejection for the Interactive Path

- Status: Accepted — Implemented (Gazebo via gzweb scene-state streaming; Turtlesim via software display + noVNC; GPU rejected for the interactive path; damage-aware transport superseded by gzweb for Gazebo, AE-P1)
- Implementation: `services/gazebo` (headless `gz sim -s` + gz-launch WebsocketServer on :9002) streamed to the self-hosted `services/gazebo/client` (gzweb SceneManager + Three.js) served by `services/gzweb-client`, wired through the proxy at `/gzweb/` + `/gzweb/ws/`; `services/turtlesim` (Xvfb + turtlesim_node + x11vnc + websockify) still uses noVNC at `/sim/turtlesim/novnc/`. The retired `services/simulator` (Xvfb `gz sim`) + `services/vnc` noVNC-for-Gazebo path and the `/novnc` route are gone.
- Date: 2026-07-19
- Deciders: jmservera (product), Neo, Trinity (technical)
- Related: PRD FR-E1..E3 (G-006), BRD Theme E (BR-GPU-1..3), spike PR #5, issue #12, docs/specs/04-gazebo-gpu-wsl2-research.md, ADR-002 (proxy)

## Context

Gazebo runs headless in the `simulator` container against an Xvfb display
(`:99`) and must reach the browser through the single proxy (INV-04). Two
questions had to be settled: how to transport the GUI to the browser, and
whether to render on the GPU on the primary WSL2 Intel host.

The Theme E spike (PR #5) confirmed GPU passthrough on WSL2 **works** (`glxinfo -B`
reports the Intel Iris Xe via Mesa D3D12/dozen, accelerated). But with the GPU
active, interactive browser latency **regressed ~20x** (from ~1 s on llvmpipe to
20 s+): the display is delivered by screen-scraping the Xvfb framebuffer with
x11vnc, and GPU rendering forces a per-frame GPU→CPU readback across the
`/dev/dxg` paravirt boundary, compounded by damage-less full-screen polling.

## Decision

- **Transport:** deliver the simulator GUI by scraping the headless Xvfb
  framebuffer with **x11vnc**, exposed to the browser through a **noVNC**
  sidecar that shares the simulator's network namespace (so VNC is never
  published to any network), routed via `/novnc` on the proxy.
- **Rendering:** keep **software rendering (llvmpipe)** as the default for the
  interactive, browser-delivered path. **Reject GPU rendering for the
  interactive path** on WSL2 because the per-frame readback makes it slower, not
  faster. The GPU overlay (`compose.override.wsl.yaml`) is retained, clearly
  warning-labelled, for compute or a future GPU-encode streaming path only.

## Alternatives considered

- **GPU rendering for the interactive display on WSL2.** Rejected — readback
  across `/dev/dxg` dominates and regresses latency ~20x (PR #5).
- **VirtualGL + TurboVNC / VA-API HW encode.** Deferred on WSL2: no reliable
  `/dev/dri` for hardware encode.
- **A damage-aware capture server (TurboVNC/Xvnc, KasmVNC) or a WebRTC
  GPU-encode path.** The higher-ceiling replacement for screen-scrape; deferred
  to a strategic decision (Section 18 AE-P1) and tracked as the software-path
  latency attack in issue #12.

## Consequences

- The interactive simulator stays on the software path with ~1 s latency today;
  driving that toward interactive (<200 ms) via SHM/resolution/transport levers
  is tracked in issue #12, not by enabling the GPU.
- VNC stays off the network entirely (namespace sharing); only `/novnc` is
  proxied.
- Any future move to a damage-aware or GPU-encode transport is an ADR-worthy
  change (AE-P1) and would supersede the transport half of this decision.
