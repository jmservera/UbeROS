# ADR-005: Authentication

- Status: Accepted — Implemented (basic auth; OAuth2-Proxy path not yet built)
- Implementation: proxy `UBEROS_AUTH` toggle + mounted `.htpasswd` (`config/nginx`); OAuth2-Proxy remains the documented upgrade path
- Date: 2026-07-17
- Deciders: jmservera (product), Trinity, Morpheus
- Related: PRD N-05, research R5

## Context

Access must be gated before any non-localhost exposure (NFR N-05). rosbridge has
no native authentication (`check_origin` returns true unconditionally), so
backend ports must stay internal and access must be enforced at the proxy.

## Decision

For Init, use **Nginx `auth_basic`**, disabled by default for localhost and
enabled via `UBEROS_AUTH=basic` with a mounted `.htpasswd`. For public
deployment, the upgrade path is **OAuth2-Proxy** (GitHub, Azure AD, or Google
OIDC). Single-user Init must not preclude future multi-user, so auth is kept at
the proxy layer where per-user identity can later be introduced.

## Consequences

- Localhost Init runs without a login prompt; acceptance (S1-S6) is localhost
  only.
- Enabling `UBEROS_AUTH=basic` makes unauthenticated requests return 401.
- rosbridge (9090) and ttyd (7681) are never host-published.
