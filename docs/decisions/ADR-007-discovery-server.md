# ADR-007: DDS Discovery Server

- Status: Accepted — Implemented
- Implementation: `discovery-server` service + `ROS_DISCOVERY_SERVER` env + `services/ros/config/dds_discovery.xml` (present since Init, documented retroactively)
- Date: 2026-07-17
- Deciders: jmservera (product), Neo (technical)
- Related: PRD U-D1, research RISK-4, ADR-001 (ROS distro)

## Context

ROS 2 nodes discover each other over DDS. The default Fast DDS behavior uses
**UDP multicast** for participant discovery. Inside Docker bridge networks
multicast is unreliable and often disabled, which breaks the ROS graph between
the `ros` and `simulator` containers (research RISK-4). Discovery must work
deterministically across containers without host networking, which would expose
DDS ports and break the single-ingress invariant (INV-04).

## Decision

Run a dedicated **Fast DDS Discovery Server** as its own service
(`fastdds discovery -i 0 -l 0.0.0.0 -p 11811`) on the internal `ros_net`. The
`ros` and `simulator` services point at it via `ROS_DISCOVERY_SERVER` and a
`FASTRTPS_DEFAULT_PROFILES_FILE` (`dds_discovery.xml`), replacing multicast with
a unicast client/server discovery model.

## Alternatives considered

- **Default multicast discovery.** Zero extra service, but unreliable on Docker
  bridge networks and the source of RISK-4. Rejected.
- **Host networking for the ROS containers.** Restores multicast but publishes
  DDS ports on the host and violates the ports-internal / single-ingress
  baseline (INV-04, WP-13). Rejected.

## Consequences

- Deterministic discovery across containers with no multicast dependency; all
  DDS traffic stays on the internal `ros_net`.
- Discovery listens on UDP 11811, so the healthcheck verifies the process
  (`pgrep -f 'fastdds discovery'`) rather than a TCP probe.
- One extra always-on service; `ros` and `simulator` depend on it being healthy
  before they start.
- Deliberately excluded from the control-plane restart allowlist (ADR-008): a
  discovery restart would disrupt the whole graph.
