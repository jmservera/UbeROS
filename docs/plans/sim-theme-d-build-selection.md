# Theme D — Build-time simulator selection

> Plan stub. Source of truth: [Simulation & Visualization PRD](../prds/uberos-simulation-visualization.md) §7.4.

## Scope — FR-D1 … FR-D4
- FR-D1 — Build/compose config (compose profiles + build args, e.g. `UBEROS_SIMULATORS`) selects which simulator images build and which services are created.
- FR-D2 — Default install set is **Gazebo + Turtlesim**.
- FR-D3 — Excluding a simulator keeps its image/service out of the build and its registry entry out of the menu.
- FR-D4 — Documented in `.env`/compose comments (default + how to change).

## Dependency / lane
- **Lane 4 (integrate last).** Depends on **Theme A** (registry) and the simulator services from **Themes C and F** existing.

## Likely files
- `compose.yaml` (profiles, build args)
- `.env` / compose comments, README/docs

## Tasks
- [ ] Research: compose profiles + created-but-selectable services; registry `enabled` gating
- [ ] Plan: selection mechanism + defaults + docs
- [ ] Implement: profiles/args + registry gating
- [ ] Tests: include/exclude a simulator changes services + menu
- [ ] Acceptance (PRD §7.4)
