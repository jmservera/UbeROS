# ADR-008: Operational Control Plane and Docker Socket

- Status: Accepted — Implemented (restart + health; socket-proxy hardening pending, AE-S1)
- Implementation: `services/control/server.js` (list + restart only, exact-match allowlist); internal `web_net`, never host-published
- Date: 2026-07-19
- Deciders: jmservera (product), Trinity, Morpheus (technical)
- Related: PRD Theme C/Theme G (BR-007, FR-G3/FR-G4), BRD BR-RI-1..4, ADR-003 (terminal), Section 18 AE-S1

## Context

The system menu needs to report per-service health and restart an individual
service without a full-stack restart (BR-007), and Theme G surfaces that health
in the GUI. Restarting a compose service and reading container health both
require the Docker Engine API, which is reached through `/var/run/docker.sock`.
Mounting the Docker socket is effectively root-on-host, so the design must
constrain what that access can do. ADR-003 already avoided socket exposure for
terminals for this reason; the control plane needs it, so it must be hardened.

## Decision

Add a small **`control` service** (Node, no external deps) that mounts the
Docker socket and exposes a strictly-scoped HTTP API behind the proxy at
`/control/`:

- `GET /config`, `GET /services`, `GET /health`, and `POST /services/{name}/restart`.
- Only two Docker operations are ever issued: **list** containers (filtered to
  this compose project) and **restart** a container by id. No exec, create, or
  arbitrary container control.
- Restart is gated by an **allowlist** (`UBEROS_SERVICES`, default
  `ros,simulator,vnc,editor,frontend`); the name is matched exactly and used
  only as a Docker label filter, never interpolated into a shell.
- The control plane, `proxy`, and `discovery-server` are intentionally excluded
  from the allowlist so it can never restart itself or the ingress.
- The service is on the internal `web_net` only and is never host-published;
  access is reachable solely through the proxy where auth is enforced (ADR-005).

## Alternatives considered

- **`docker compose` CLI via socket or a privileged sidecar.** Broader surface
  than needed; the raw Engine API with two verbs is smaller and auditable.
- **A read-scoped `docker-socket-proxy` sidecar** (tecnativa) in front of the
  control service. Stronger defense-in-depth, deferred as a hardening follow-up
  (Section 18 AE-S1) rather than blocking the initial control plane.

## Consequences

- The GUI can show health and restart a stuck service without touching the host
  or the whole stack; this is what makes Theme G's guided recovery possible.
- Socket access is constrained at the application layer (allowlist + two verbs)
  but not yet at the transport layer; hardening via a socket-proxy sidecar is
  tracked as AE-S1 and should land before any non-localhost exposure.
- The control plane is a hard dependency of the proxy (ADR-006) so recovery is
  always reachable.
