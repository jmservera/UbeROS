# Theme E — ROS 2 integration for Gazebo (ros_gz)

> Plan stub. Source of truth: [Simulation & Visualization PRD](../prds/uberos-simulation-visualization.md) §7.5.

## Scope — FR-E1 … FR-E6
- FR-E1 — `ros_gz_bridge` runs co-located with `gz sim` in the Gazebo container.
- FR-E2 — Default bridge for `/clock` (`rosgraph_msgs/msg/Clock`) via a bridge config file; further per-world bridges additive.
- FR-E3 — Bridge reaches ROS via the Fast DDS discovery server (unicast, no multicast); gz-transport stays intra-container.
- FR-E4 — Gazebo entrypoint sources `/opt/ros/${ROS_DISTRO}` and provides the DDS discovery config.
- FR-E5 — `ROS_DISTRO` ↔ `GZ_RELEASE` pinned to a compatible pair (kilted ↔ ionic).
- FR-E6 — Remove the now-redundant `ros-gz` from the `ros` image (bridge lives only in the Gazebo container).

## Dependency / lane
- **Lane 2 (Gazebo backend).** Coordinate with **Theme F** (both reshape the Gazebo container/service); sequence E after F's container reshape or share the lane.
- Architecture rationale: two discovery systems (gz-transport vs DDS) — see PRD §6.

## Likely files
- `services/simulator|gazebo/` entrypoint + `ros_gz` bridge config (`/clock`)
- `services/ros/Dockerfile` (drop `ros-gz`)

## Tasks
- [ ] Research: ros_gz_bridge config format for the pinned pair; discovery-server env vs XML in the Gazebo container
- [ ] Plan: bridge launch + `/clock` config + entrypoint ROS sourcing
- [ ] Implement: co-located bridge, `/clock`, ros-image cleanup
- [ ] Tests: `ros2 topic echo /clock rosgraph_msgs/msg/Clock --once` returns a clock sample; no multicast
- [ ] Acceptance (PRD §7.5)

## Verified test procedure (2026-07-24)

Use this from the ROS shell (web terminal in the `ros` container) to verify that Gazebo is reachable from ROS through `ros_gz_bridge`:

```bash
source /opt/ros/${ROS_DISTRO}/setup.bash
export ROS_DOMAIN_ID=42
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp
export ROS_DISCOVERY_SERVER=discovery-server:11811
export FASTRTPS_DEFAULT_PROFILES_FILE=/etc/ros/dds_discovery.xml
ros2 topic echo /clock rosgraph_msgs/msg/Clock --once
```

Expected result: one `clock` message is printed.

Notes:
- In this stack, `ros2 topic list` may not show `/clock` even when the bridge is working.
- The explicit type in `ros2 topic echo` is required for a reliable check.
- `ROS_DISCOVERY_SERVER` must be `discovery-server:11811` with no spaces around `:`.
- Use `--once` (no space), not `-- once`.
- Fast DDS warns that `FASTRTPS_DEFAULT_PROFILES_FILE` is deprecated. Prefer `FASTDDS_DEFAULT_PROFILES_FILE` for future updates.
