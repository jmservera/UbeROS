# ADR-006: Resilient Ingress and Service Health Visibility

- Status: Proposed — Not implemented (Theme G design gate)
- Implementation: pending; `nginx.conf` still uses static upstreams and the proxy hard-depends on all services
- Date: 2026-07-20
- Deciders: jmservera (product), Trinity (technical)
- Related: PRD Theme G (G-008, FR-G1..FR-G4, NFR-8, R-6), BRD Theme G (BR-RI-1..BR-RI-4), ADR-002 (proxy)

## Context

The proxy is the only host-published ingress (INV-04). It currently declares
`depends_on` with `condition: service_healthy` for `ros`, `vnc`, `editor`,
`frontend`, and `control`, so nginx does not start until every backend is
healthy. This gate exists because nginx resolves the static `upstream`
hostnames (`server ros:9090;`) at config-load time: if a backend container is
not yet running, nginx fails to start with "host not found in upstream".

That gate creates a chicken-and-egg failure. The control plane exists to restart
unhealthy services (BR-007), but the only path to it (the proxy) will not come
up until those services are already healthy. A service stuck unhealthy is
therefore unrecoverable from the UI — the user sees a blank page and must read
`docker compose logs`. The GUI also has no view of per-service health today, only
a restart action once everything is up.

## Decision

Make the ingress depend only on the fundamental services and resolve the rest
lazily:

- The proxy hard-depends (`condition: service_healthy`) only on `control` and
  `frontend`, so the SPA shell and the control plane load in seconds.
- Backend routes (`rosbridge`, `noVNC`, `editor`, `terminal`) switch to
  request-time DNS via `resolver 127.0.0.11` + variable `proxy_pass`, so a
  not-yet-ready backend returns a graceful "service starting/unavailable" page
  instead of blocking nginx startup.
- The SPA (`/`) and control (`/control/`) routes stay statically resolved (hard
  dependencies) so the shell and the recovery UI are always guaranteed.
- The GUI surfaces per-service health from the existing control `/services`
  endpoint and offers a restart affordance (FR-G3/FR-G4).

## Alternatives considered

- **Keep the full `service_healthy` gate (status quo).** Simple, but preserves
  the deadlock: the recovery UI is unreachable exactly when a service is stuck.
  Rejected.
- **Drop all proxy dependencies and rely only on lazy resolution.** Maximizes
  ingress independence but risks the SPA shell itself 502-ing on boot, leaving
  no UI. Keeping `frontend` + `control` as hard deps gives a guaranteed shell
  for a lightweight, fast-starting pair. Preferred.
- **Add a separate health/status service.** Unnecessary — the control plane
  already exposes `/services` health and the restart verb; consolidating avoids
  a new component.

## Consequences

- The canvas, health view, and restart controls load promptly even while `ros`,
  `simulator`, `vnc`, and `editor` are still starting; a stuck service is
  recoverable from the UI without a full-stack restart (NFR-8).
- Variable `proxy_pass` changes nginx URI/path handling, so each proxied route
  (`/control/`, `/editor/`, `/ros`, `/novnc`, `/terminal`) must preserve its
  trailing-slash/rewrite semantics and gain a per-route acceptance test (R-6).
- Backend routes now surface a friendly error page rather than failing the whole
  ingress; the proxy healthcheck stays scoped to `/healthz`.
- No new service or network topology change; backend ports remain internal
  (INV-04, WP-13). The single-proxy decision in ADR-002 is unchanged.
