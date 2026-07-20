# ADR-010: Persistence and Volume Strategy

- Status: Accepted — Partially implemented (editor volumes done; server-side config store done, Theme C; migration path AE-O2 pending)
- Implementation: `compose.yaml` volumes `editor-data`/`editor-config` mounted; server-side config store done — `control` service serves `GET`/`PUT /config/settings`, persisted to `/data/config.json` on the `control-data` volume, with `schemaVersion` (currently `1`) reserved per AE-O2; migration logic itself is still future work
- Date: 2026-07-19
- Deciders: jmservera (product), Trinity (technical)
- Related: PRD Theme C/D (FR-C2, FR-C4, FR-D1..D4, NFR-7), BRD BR-CFG-1..6/BR-CS-1..4, PR #14, Section 18 AE-R2/AE-S4, ADR-005 (auth)

## Context

The workspace must remember context across restarts: the ROS workspace and
build artifacts, system configuration (Theme C), and the code-server editor's
user data, extensions, and GitHub Copilot login (Theme D). The topology is
single-user now, but persistence choices must not preclude a future per-user
model. The Copilot login is a sensitive credential stored at rest, and the
secret-handling rules forbid committing tokens.

## Decision

Persist state on **named Docker volumes**, scoped by concern:

- `ros-workspace`, `ros-home`, `gazebo-home` for ROS/Gazebo build and runtime
  state; the source tree stays a bind mount (`./workspace/src`).
- `editor-data` (`~/.local/share/code-server`, which holds user data,
  extensions, and the VS Code secret store that carries the Copilot login) and
  `editor-config` (`~/.config/code-server`), so the editor stays configured and
  authenticated across restarts (FR-D1/FR-D2).
- **System configuration is persisted server-side** through the `control`
  service (ADR-008) to a file on a mounted volume, not in the browser
  (FR-C2). Per-browser-only preferences may still use `localStorage`.
- Persistence schemas **reserve a user key** so a future multi-user model can
  isolate each user's data and tokens (e.g. `/data/users/<uid>/...`) without a
  redesign (FR-C4/FR-D3).

## Secret-at-rest posture

This iteration protects the Copilot token at rest **only** via volume
ownership/permissions plus the fact that the editor is never host-published
(access is routed through the proxy). Token-at-rest **encryption is required
before any multi-user or non-localhost exposure** (FR-D4, risk R-4). No token is
ever committed to the repo. Hardening is tracked as AE-S4.

## Consequences

- Editor identity, extensions, settings, and system config survive `down`/`up`
  and image rebuilds (NFR-7).
- Config schema versioning/migration is not yet defined; it is required before
  the format changes and is tracked as AE-O2 (reserve a `schemaVersion` beside
  the user key).
- Backup/restore and disaster recovery for these volumes are out of scope for
  this iteration and tracked as AE-R2.
- The single-user default is honored while leaving a clear extension path to
  per-user isolation.
