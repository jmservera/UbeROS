#!/usr/bin/env bash
# UbeROS ROS container entrypoint.
# Sources the ROS environment and the workspace overlay (if built), then starts
# ttyd (browser terminals) alongside rosbridge (browser <-> ROS graph).
set -euo pipefail

# ROS setup scripts reference unbound variables (e.g. AMENT_TRACE_SETUP_FILES),
# so relax nounset while sourcing them, then restore it.
set +u
# shellcheck source=/dev/null
source "/opt/ros/${ROS_DISTRO}/setup.bash"
if [ -f /ros_ws/install/setup.bash ]; then
  # shellcheck disable=SC1091
  source /ros_ws/install/setup.bash
fi
set -u

# ttyd serves a writable bash PTY per WebSocket connection on :7681.
# Each terminal runs inside a named tmux session (via uberos-term) so a
# reconnect — popping the panel into its own window, docking it elsewhere, or
# reloading the page — reattaches the same shell with full scrollback instead
# of spawning a fresh PTY. --url-arg forwards the panel's ?arg=<id> to the
# launcher as the session id; independent ids stay independent shells (F-05).
ttyd --port 7681 --writable --url-arg --cwd /ros_ws /usr/local/bin/uberos-term &
TTYD_PID=$!

# Forward termination to child processes for a clean shutdown.
trap 'kill -TERM "${TTYD_PID}" 2>/dev/null || true' TERM INT

# rosbridge exposes the ROS graph over WebSocket on :9090 (foreground).
exec ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090
