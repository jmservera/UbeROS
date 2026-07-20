# ADR-002: Reverse Proxy

- Status: Accepted — Implemented
- Implementation: `services/proxy/nginx.conf` single ingress; only the proxy port is host-published
- Date: 2026-07-17
- Deciders: jmservera (product), Trinity (technical)
- Related: PRD U-D2, research R1

## Context

All browser traffic must pass through a single ingress (INV-04) that supports
WebSocket proxying for rosbridge, noVNC, the editor, and terminals. Candidates
were Nginx, Traefik v3, and Caddy.

## Decision

Use **Nginx**. A static `nginx.conf` fits the fixed, localhost-only Init
topology, provides proven WebSocket proxying, and includes `auth_basic` for the
pre-public-exposure authentication gate. Traefik's dynamic Docker-label routing
adds value only if the service inventory becomes dynamic, and it requires Docker
socket access.

## Consequences

- Simple, reviewable routing in one config file.
- Backend ports (rosbridge 9090, ttyd 7681) stay internal; only the proxy port
  is host-published.
- Revisit Traefik only if the service topology becomes dynamic.
