---
title: ADR-009 Simulator Display Transport and GPU Rejection for the Interactive Path
description: Historical transport decision for interactive simulation, with Theme F supersession context for Gazebo and retained noVNC path for Turtlesim.
author: jmservera
ms.date: 2026-07-23
ms.topic: concept
---

## ADR-009: Simulator Display Transport and GPU Rejection for the Interactive Path

- Status: Accepted, partially superseded for Gazebo by Theme F implementation
- Implementation (historical baseline): `services/simulator` (Xvfb `:99`, `LIBGL_ALWAYS_SOFTWARE=1`) + `services/vnc` (x11vnc/noVNC sidecar sharing the sim netns)
- Supersession context: Gazebo now uses `services/gazebo` scene-state streaming through `/gzweb/` and `/gzweb/ws/`; noVNC transport remains active for `turtlesim` via `/sim/turtlesim/novnc/`
- Date: 2026-07-19
- Deciders: jmservera (product), Neo, Trinity (technical)
- Related: PRD FR-E1..E3 (G-006), BRD Theme E (BR-GPU-1..3), spike PR #5, issue #12, docs/specs/04-gazebo-gpu-wsl2-research.md, ADR-002 (proxy)

## Context

This ADR captured the original interactive transport decision when Gazebo was
delivered through an Xvfb plus noVNC path behind the single proxy (INV-04).
Two questions had to be settled: how to transport the GUI to the browser, and
whether to render on the GPU on the primary WSL2 Intel host.

The Theme E spike (PR #5) confirmed GPU passthrough on WSL2 **works** (`glxinfo -B`
reports the Intel Iris Xe via Mesa D3D12/dozen, accelerated). But with the GPU
active, interactive browser latency **regressed ~20x** (from ~1 s on llvmpipe to
20 s+): the display is delivered by screen-scraping the Xvfb framebuffer with
x11vnc, and GPU rendering forces a per-frame GPU→CPU readback across the
`/dev/dxg` paravirt boundary, compounded by damage-less full-screen polling.

## Decision

- Transport decision at the time: deliver the simulator GUI by scraping the
  headless Xvfb framebuffer with **x11vnc**, exposed to the browser through a
  **noVNC** sidecar that shares the simulator's network namespace (so VNC is
  never published to any network).
- Keep **software rendering (llvmpipe)** as the default for the interactive,
  browser-delivered path. Reject GPU rendering for the interactive path on WSL2
  because the per-frame readback makes it slower, not faster. The GPU overlay
  (`compose.override.wsl.yaml`) is retained, clearly warning-labelled, for
  compute or a future GPU-encode streaming path only.

Theme F transport reality:

- Gazebo transport moved from noVNC pixel streaming to native `gzweb` scene
  state streaming through `/gzweb/` and `/gzweb/ws/`
- Turtlesim keeps the noVNC path through `/sim/turtlesim/novnc/`
- The GPU rejection finding for the interactive screen-scrape path remains
  valid historical evidence and still informs future transport choices

## Alternatives considered

- GPU rendering for the interactive display on WSL2: rejected, because readback
  across `/dev/dxg` dominates and regresses latency ~20x (PR #5).
- VirtualGL + TurboVNC / VA-API HW encode: deferred on WSL2, no reliable
  `/dev/dri` for hardware encode.
- A damage-aware capture server (TurboVNC/Xvnc, KasmVNC) or a WebRTC
  GPU-encode path: a higher-ceiling replacement for screen-scrape, deferred
  to a strategic decision (Section 18 AE-P1) and tracked as the software-path
  latency attack in issue #12.

## Consequences

- The original noVNC-based Gazebo path documented here has been superseded by
  Theme F implementation for Gazebo transport.
- Turtlesim continues to use a noVNC path that stays off the host network.
- Any future move to a damage-aware or GPU-encode transport is an ADR-worthy
  change (AE-P1) and would supersede the transport half of this decision.
