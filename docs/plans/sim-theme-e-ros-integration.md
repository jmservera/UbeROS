# Theme E — ROS 2 integration for Gazebo (ros_gz)

> Plan stub. Source of truth: [Simulation & Visualization PRD](../prds/uberos-simulation-visualization.md) §7.5.

## Scope — FR-E1 … FR-E6
- FR-E1 — `ros_gz_bridge` runs co-located with `gz sim` in the Gazebo container.
- FR-E2 — Default bridge for `/clock` (`rosgraph_msgs/Clock`) via a bridge config file; further per-world bridges additive.
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
- [ ] Tests: `ros2 topic list` shows `/clock`; no multicast
- [ ] Acceptance (PRD §7.5)
