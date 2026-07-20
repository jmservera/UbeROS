# ADR-003: Terminal Transport

- Status: Accepted — Implemented
- Implementation: `services/ros` (ttyd 1.7.7 + tmux via `uberos-term.sh`); terminal ports stay internal
- Date: 2026-07-17
- Deciders: jmservera (product), Switch (technical)
- Related: PRD U-D3, research R7

## Context

Browser terminals must reach shells in the ROS container. A `docker exec`-based
design would require mounting `/var/run/docker.sock`, effectively granting
root-on-host. Candidates were ttyd inside the ROS container, a custom
xterm.js + node-pty bridge, and SSH via Apache Guacamole.

## Decision

Use **ttyd running inside the `ros` container**. It provides a WebSocket PTY
with bundled xterm.js, needs no Docker socket exposure, and requires minimal
custom code. Each browser connection gets an independent shell (F-05).

## Consequences

- No Docker socket exposure; terminal ports stay internal behind the proxy.
- The pinned ttyd binary is selected per architecture via `TARGETARCH` to avoid
  an arm64/x86_64 mismatch (research RISK-7).
- Guacamole/SSH remains an option only if enterprise access control is needed
  later.
