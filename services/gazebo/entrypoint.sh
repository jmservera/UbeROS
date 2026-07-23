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

# --- Theme E integration point (ros_gz bridge) --------------------------------
# The ros_gz bridge is OUT OF SCOPE for Theme F. Theme E adds ROS + the bridge
# to THIS container: install ros-${ROS_DISTRO}-ros-gz in the Dockerfile, then
# source ROS and start the bridge here, e.g.
#   set +u; source "/opt/ros/${ROS_DISTRO}/setup.bash"; set -u
#   ros2 run ros_gz_bridge parameter_bridge ... &
# Nothing above depends on ROS, so the headless web-viz path works standalone.
# ------------------------------------------------------------------------------

# Forward termination to both children for a clean shutdown.
trap 'kill -TERM "${GZ_PID}" "${WS_PID}" 2>/dev/null || true' TERM INT

# Exit as soon as either process dies so Docker's restart policy can recover the
# pair (a lone websocket server or a lone sim is not useful).
wait -n "${GZ_PID}" "${WS_PID}"
