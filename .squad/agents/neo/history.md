# Project Context

- **Owner:** jmservera
- **Project:** Browser-accessible ROS and simulator environment on Docker Compose
- **Stack:** ROS, Gazebo, Docker Compose, noVNC, browser-based VS Code, web terminals, Nginx or Traefik, web frontend
- **Created:** 2026-07-17T09:22:05.804+02:00

## Learnings

- ROS core and simulator workloads should be delivered as composable container images.
- GUI workloads must remain usable through browser-hosted noVNC sessions.

### 2026-07-17 — Fact Checker revision (01-Init.md)

- **Gazebo source caveat:** `hub.docker.com/_/gazebo` resolves but has no supported tags and is deprecated/legacy. Current image sources for both Gazebo Classic and Gazebo Sim must be independently verified during the research phase; no alternative registries were added without verification.
- **Technology choices remain open:** ROS distribution (Iron is EOL; use the official release schedule at research time), Gazebo image registry, specific display/VNC implementation behind noVNC, self-hostable editor product, and host platform support matrix are all explicitly deferred to the research phase. No implementation commitments are made in the brief.
