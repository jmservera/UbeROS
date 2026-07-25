---
title: Theme A Pluggable Simulator Framework
description: Implementation-synchronized status record for Theme A registry and lifecycle evidence.
author: UbeROS Team
ms.date: 2026-07-24
ms.topic: reference
---

## Theme A Pluggable Simulator Framework

Implementation-synchronized status record.

Source of truth: [Simulation and Visualization PRD](../prds/uberos-simulation-visualization.md) section 7.1.

## Scope (FR-A1 to FR-A4)

* FR-A1: Simulator registry in `services/control/simulators.js`
* FR-A2: `GET /control/simulators` returns installed simulators with live state
* FR-A3: Frontend simulator menu and panel definitions are data-driven
* FR-A4: Launch and stop lifecycle behavior maps to ROS graph visibility

## Status Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| FR-A1       | Implemented | Registry contract is implemented with `id`, `label`, `service`, `transport`, `panelRoute`, `rosIntegration`, `autostart`, and `enabled` |
| FR-A2       | Implemented | Control plane exposes live simulator status through `/control/simulators` |
| FR-A3       | Implemented | Additive extensibility proof is covered by acceptance test fixture scenario (`s12`) |
| FR-A4       | Implemented | Launch and stop lifecycle is validated with deterministic ROS node visibility checks (`s12`) |

## Evidence Pointers

* `services/control/simulators.js`
* `services/control/server.js`
* `services/frontend/src/lib/panels.js`
* `tests/acceptance/s12-theme-a-framework.spec.js`

## Completion Checklist

* [x] Research: control-plane extension points and registry shape
* [x] Plan: registry module and `GET /simulators` contract
* [x] Implement: registry, endpoint, and data-driven menu/panel behavior
* [x] Tests: deterministic Theme A acceptance evidence (`s12`)
* [x] Acceptance: FR-A1 through FR-A4 evidence mapped and synchronized
