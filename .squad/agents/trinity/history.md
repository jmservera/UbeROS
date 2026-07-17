# Project Context

- **Owner:** jmservera
- **Project:** Browser-accessible ROS and simulator environment on Docker Compose
- **Stack:** ROS, Gazebo, Docker Compose, noVNC, browser-based VS Code, web terminals, Nginx or Traefik, web frontend
- **Created:** 2026-07-17T09:22:05.804+02:00

## Learnings

- The platform requires proxy support for HTTP and WebSocket services across noVNC, editor, terminal, and workspace components.
- The Nginx-versus-Traefik choice remains a research decision.
