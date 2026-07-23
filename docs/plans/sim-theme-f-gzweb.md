---
title: Theme F Gazebo Native Web Visualization (gzweb)
description: Implementation-synchronized status record for Theme F transport migration from Gazebo noVNC to gzweb scene-state streaming.
author: UbeROS Team
ms.date: 2026-07-23
ms.topic: reference
---

## Theme F Gazebo Native Web Visualization (gzweb)

Implementation-synchronized status record.

Source of truth: [Simulation and Visualization PRD](../prds/uberos-simulation-visualization.md) section 7.6.

## Scope (FR-F1 to FR-F5)

* FR-F1: Gazebo container runs headless `gz sim -s` with WebSocket scene-state streaming
* FR-F2: Self-hosted minimal `gzweb` client is served behind the proxy through `/gzweb/` and `/gzweb/ws/`
* FR-F3: Gazebo panel loads the `gzweb` client inside Golden Layout
* FR-F4: Gazebo VNC path is retired; VNC remains for Turtlesim
* FR-F5: Scene-state transport replaces pixel streaming for the Gazebo interactive path

## Status Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| FR-F1       | Implemented | `compose.yaml` defines `gazebo` as headless server with health check on port 9002 |
| FR-F2       | Implemented | Proxy serves static `gzweb` assets at `/gzweb/` and upgrades `/gzweb/ws/` to `gazebo:9002` |
| FR-F3       | Implemented | Frontend panel model includes `gzweb` panel behavior in the default layout |
| FR-F4       | Implemented | Legacy Gazebo `simulator` + `vnc` pipeline retired from default runtime stack |
| FR-F5       | Partial | Transport migration is complete; latency target confirmation remains environment-measurement dependent |

## Runtime Contract

* Gazebo transport: `/gzweb/` for client assets, `/gzweb/ws/` for scene-state WebSocket
* Turtlesim transport: `/sim/turtlesim/novnc/` for noVNC
* Both simulator services are present in compose defaults

## Evidence Pointers

* `compose.yaml`
* `services/proxy/nginx.conf`
* `services/control/simulators.js`
* `services/frontend/src/lib/panels.js`

## Follow-On Work

* Confirm FR-F5 latency target with repeatable measurement runs in CI-like host conditions
* Deliver Theme B launch and stop simulator endpoints to complete menu lifecycle control
