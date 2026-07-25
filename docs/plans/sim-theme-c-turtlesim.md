---
title: Theme C Turtlesim Visualizer
description: Implementation-synchronized status record for Theme C turtlesim route and ROS integration evidence.
author: UbeROS Team
ms.date: 2026-07-24
ms.topic: reference
---

## Theme C Turtlesim Visualizer

Implementation-synchronized status record.

Source of truth: [Simulation and Visualization PRD](../prds/uberos-simulation-visualization.md) section 7.3.

## Scope (FR-C1 to FR-C4)

* FR-C1: `turtlesim` service runtime pipeline is active
* FR-C2: Turtlesim noVNC route is reachable through `/sim/turtlesim/novnc/`
* FR-C3: `turtlesim_node` joins the shared ROS graph via discovery server
* FR-C4: Turtlesim is drivable through ROS command path while visible

## Status Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| FR-C1       | Implemented | `services/turtlesim/` runtime stack is active in compose defaults |
| FR-C2       | Implemented | noVNC route is validated by deterministic acceptance checks (`s11`) |
| FR-C3       | Implemented | ROS graph membership is validated via deterministic node visibility checks (`s11`) |
| FR-C4       | Implemented | ROS command-path drivability is validated through publish handshake evidence (`s11`) |

## Evidence Pointers

* `services/turtlesim/entrypoint.sh`
* `compose.yaml`
* `services/proxy/nginx.conf`
* `tests/acceptance/s11-theme-c-turtlesim.spec.js`

## Completion Checklist

* [x] Research: vnc/noVNC pattern reuse and ROS package/runtime constraints
* [x] Plan: service layout and proxy routing
* [x] Implement: turtlesim service, route, and ROS discovery integration
* [x] Tests: deterministic Theme C acceptance evidence (`s11`)
* [x] Acceptance: FR-C1 through FR-C4 evidence mapped and synchronized
