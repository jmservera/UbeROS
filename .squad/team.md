# Squad Team

> uberos

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Morpheus | Technical Lead | .squad/agents/morpheus/charter.md | 🏗️ Lead |
| Neo | ROS & Simulation Engineer | .squad/agents/neo/charter.md | 🤖 Robotics |
| Trinity | Platform Engineer | .squad/agents/trinity/charter.md | ⚙️ Platform |
| Switch | Frontend Engineer | .squad/agents/switch/charter.md | ⚛️ Frontend |
| Tank | Integration & Test Engineer | .squad/agents/tank/charter.md | 🧪 QA |
| Scribe | Session Logger | .squad/agents/scribe/charter.md | 📋 Scribe |
| Ralph | Work Monitor | .squad/agents/ralph/charter.md | 🔄 Monitor |
| Rai | RAI Reviewer | .squad/agents/Rai/charter.md | 🛡️ RAI |
| Fact Checker | Fact Checker | .squad/agents/fact-checker/charter.md | 🔍 Verifier |

## Coding Agent

<!-- copilot-auto-assign: false -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns
- Migration scripts with well-defined schemas

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

## Project Context

- **Project:** uberos
- **Created:** 2026-07-17
- **Owner:** jmservera
- **Objective:** Deliver a complete ROS environment with simulators through Docker Compose, usable entirely from a web browser.
- **Experience:** A browser workspace that manages ROS and simulator GUIs through noVNC, embeds VS Code for the Web and multiple ROS container terminals, supports movable windows on a canvas, and allows sessions to pop out onto multiple displays.
- **Platform scope:** ROS, Gazebo, Docker Compose, noVNC, browser-based VS Code, web terminals, and an Nginx-or-Traefik ingress layer.
- **Delivery method:** Use Microsoft HVE Core research and its RPI methodology to research, plan, and implement the system.
