# Architecture Decision Records (ADRs)

This directory holds UbeROS architecture decisions. Each ADR captures one
architecturally-significant decision, its context, the alternatives, and its
consequences.

## How we track implementation

Every ADR carries two metadata lines so a decision and its build state never
drift apart:

- **`Status:`** — the lifecycle state (see below), optionally followed by a
  short qualifier.
- **`Implementation:`** — where the decision is realized in the code (a service,
  file, or config), or what is still missing when it is not yet built.

This index table is the **single source of truth** for status at a glance. When
a PR lands (or removes) the code that realizes an ADR, update that ADR's
`Status`/`Implementation` lines **and** the row here in the same PR.

### Lifecycle states

| State | Meaning |
|-------|---------|
| Proposed | Decision analyzed and recommended, not yet accepted or built |
| Accepted | Decision agreed; may or may not be built yet |
| Implemented | Accepted and realized in the codebase (verified against code) |
| Partially implemented | Accepted; some parts built, others pending (listed in `Implementation`) |
| Superseded | Replaced by a later ADR (link it) |
| Deprecated | No longer applicable |

## Index

| ADR | Title | Status | Implementation summary |
|-----|-------|--------|------------------------|
| [001](ADR-001-ros-distro.md) | ROS 2 Distribution | Implemented | `ROS_DISTRO=kilted` / `GZ_RELEASE=ionic` in `compose.yaml` |
| [002](ADR-002-proxy.md) | Reverse Proxy | Implemented | `services/proxy/nginx.conf` single ingress |
| [003](ADR-003-terminal.md) | Terminal Transport | Implemented | `services/ros` ttyd 1.7.7 + tmux |
| [004](ADR-004-frontend.md) | Frontend & Window Manager | Implemented | `services/frontend` Svelte + golden-layout 2.6.0 |
| [005](ADR-005-auth.md) | Authentication | Implemented (basic) | proxy `UBEROS_AUTH` toggle; OAuth2-Proxy path pending |
| [006](ADR-006-resilient-ingress.md) | Resilient Ingress & Health Visibility | Proposed | Not built; Theme G design gate |
| [007](ADR-007-discovery-server.md) | DDS Discovery Server | Implemented | `discovery-server` + `dds_discovery.xml` (since Init) |
| [008](ADR-008-control-plane.md) | Operational Control Plane & Docker Socket | Implemented | `services/control/server.js`; socket-proxy hardening pending (AE-S1) |
| [009](ADR-009-display-transport.md) | Simulator Display Transport & GPU Rejection | Implemented | `services/simulator` + `services/vnc`; GPU rejected for interactive path; AE-P1 pending |
| [010](ADR-010-persistence.md) | Persistence & Volume Strategy | Partially implemented | editor volumes done; server-side config store (Theme C) done via `control` GET/PUT `/config/settings` → `control-data` volume; backup/restore (AE-R2) & migration (AE-O2) pending |

## Adding a new ADR

1. Copy the metadata block from an existing ADR (`Status`, `Implementation`,
   `Date`, `Deciders`, `Related`).
2. Number it sequentially (`ADR-0NN-<kebab-topic>.md`).
3. Start at `Proposed` or `Accepted`; set `Implementation:` to what is missing.
4. Add a row to the index table above.
5. When the code lands, flip the status to `Implemented` (or
   `Partially implemented`) and update both the ADR and this table.
