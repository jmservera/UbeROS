#!/usr/bin/env bash
# UbeROS Gazebo entrypoint (PRD Theme F, FR-F1/FR-F5).
# Runs Gazebo headless (server only, `gz sim -s`) and a gz-launch WebsocketServer
# that streams the simulation as SCENE STATE (protobuf over WebSocket on :9002),
# rendered client-side by the browser. No Xvfb, no VNC, no server GL context —
# this is scene-state streaming, not a pixel stream, which keeps interaction
# latency low (FR-F5). Both processes share this container's Gazebo Transport
# bus, so the WebsocketServer sees the topics `gz sim` publishes.
set -euo pipefail

WORLD="${UBEROS_WORLD:-/simulation/worlds/uberos_default.sdf}"
LAUNCH_FILE="${UBEROS_GZLAUNCH:-/etc/uberos/websocket.gzlaunch}"

# Headless physics/scene server. `-s` = server only (no GUI/render), `-r` = run
# immediately so poses stream without a manual play. Verbosity kept low.
gz sim -s -r -v 1 "${WORLD}" &
GZ_PID=$!

# WebSocket bridge: exposes Gazebo Transport topics (scene graph, poses, assets)
# as protobuf frames on port 9002 for the gzweb client. gz launch blocks while
# its plugin runs, so it is backgrounded and waited on below.
gz launch -v 1 "${LAUNCH_FILE}" &
WS_PID=$!

# --- Theme E integration point (ros_gz bridge, FR-E1..FR-E4) ------------------
# The ros_gz bridge runs co-located with `gz sim` in THIS container so the
# gz-transport hop stays intra-container (localhost) and only the DDS side
# crosses the network, via the Fast DDS discovery server (unicast, no
# multicast). Source ROS first (its setup scripts reference unbound vars, so
# relax nounset while sourcing), then start parameter_bridge with the /clock
# config. gz sim/gz launch were started ABOVE, before ROS is on PATH, so they
# keep their native gz environment and are unaffected by the ROS overlay.
set +u
# shellcheck source=/dev/null
source "/opt/ros/${ROS_DISTRO}/setup.bash"
set -u

BRIDGE_CONFIG="${UBEROS_BRIDGE_CONFIG:-/etc/uberos/ros_gz_bridge.yaml}"

# Invoke the parameter_bridge executable by its full install path instead of
# `ros2 run`: this headless image installs only ros-gz-bridge (no ros2cli), so
# the `ros2` CLI plugin is not present. The bridge reads the YAML topic map and
# registers on the ROS graph through the discovery server (env from compose).
# Bridge may start before `gz sim` advertises /clock; this is intentional (it reconnects when /clock appears).
"/opt/ros/${ROS_DISTRO}/lib/ros_gz_bridge/parameter_bridge" \
    --ros-args -p "config_file:=${BRIDGE_CONFIG}" &
BRIDGE_PID=$!
# ------------------------------------------------------------------------------

# Forward termination to all children for a clean shutdown.
trap 'kill -TERM "${GZ_PID}" "${WS_PID}" "${BRIDGE_PID}" 2>/dev/null || true' TERM INT

# Exit as soon as any core process dies so Docker's restart policy can recover
# the group (a lone websocket server, a lone sim, or a lone bridge is not
# useful).
wait -n "${GZ_PID}" "${WS_PID}" "${BRIDGE_PID}"
