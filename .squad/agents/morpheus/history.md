# Project Context

- **Owner:** jmservera
- **Project:** Browser-accessible ROS and simulator environment on Docker Compose
- **Stack:** ROS, Gazebo, Docker Compose, noVNC, browser-based VS Code, web terminals, Nginx or Traefik, web frontend
- **Created:** 2026-07-17T09:22:05.804+02:00

## Learnings

- The browser workspace must manage embedded GUI sessions and allow each session to open in a separate browser window for multi-display use.
- Microsoft HVE Core research and its RPI methodology will guide architecture and implementation.
- Two independent lifecycles govern this system: workload/session (Docker Compose services) and browser view (canvas, panels, pop-outs). Conflating them causes data loss or zombie containers.
- Ten research questions (proxy choice, ROS distro, Gazebo gen, streaming topology, auth, GPU, terminal transport, frontend framework, pop-out protocol, lifecycle coupling) must be resolved before implementation — none are pre-decided.
- The initial brief (docs/specs/01-Init.md) is the canonical source of scope and success criteria for the project.
