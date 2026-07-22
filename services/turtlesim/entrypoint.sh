#!/usr/bin/env bash
# UbeROS turtlesim entrypoint (PRD Theme C, FR-C1/FR-C3).
# Runs the whole VNC pipeline in one container: a virtual framebuffer (Xvfb
# :99), turtlesim_node rendering into it, a lightweight window manager, x11vnc
# exporting :99, and websockify serving noVNC on :6080 (reached via the proxy
# at /sim/turtlesim/novnc/). turtlesim_node joins the ROS graph natively over
# the Fast DDS discovery server (no bridge, no multicast).
set -euo pipefail

DISPLAY_NUM="${DISPLAY:-:99}"

# Start the virtual framebuffer. turtlesim's canvas is a fixed 500x500 window;
# a slightly larger framebuffer leaves room for the window manager to place it.
# -ac disables host access control so x11vnc can attach without an xauth cookie.
Xvfb "${DISPLAY_NUM}" -screen 0 640x640x24 -ac >/tmp/xvfb.log 2>&1 &

# Wait for the X server to accept connections before launching the GUI.
for _ in $(seq 1 30); do
  if xdpyinfo -display "${DISPLAY_NUM}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
if ! xdpyinfo -display "${DISPLAY_NUM}" >/dev/null 2>&1; then
  echo "Xvfb did not become ready on ${DISPLAY_NUM}; see /tmp/xvfb.log" >&2
  exit 1
fi
# Source the ROS environment. ROS setup scripts reference unbound variables
# (e.g. AMENT_TRACE_SETUP_FILES), so relax nounset while sourcing, then restore.
set +u
# shellcheck source=/dev/null
source "/opt/ros/${ROS_DISTRO}/setup.bash"
set -u

# Window manager: without a WM the turtle window is never mapped/sized properly
# and noVNC shows a black desktop with a stray window. Openbox undecorates and
# maximizes it so the turtle fills the framebuffer (mirrors the vnc sidecar).
DISPLAY="${DISPLAY_NUM}" openbox --config-file /etc/openbox-rc.xml &

# Launch turtlesim on the shared ROS domain via the discovery server. It runs
# in the foreground's background here; x11vnc/websockify follow. Topics
# (/turtle1/cmd_vel, /turtle1/pose) appear natively in the ROS graph (FR-C3).
DISPLAY="${DISPLAY_NUM}" ros2 run turtlesim turtlesim_node &
TURTLE_PID=$!

# Export display :99 over VNC on localhost:5900 (no password: gated at the
# proxy). Everything runs in this one container, so MIT-SHM is available and
# -noshm is unnecessary (unlike the Gazebo vnc sidecar, which has a separate
# IPC namespace).
x11vnc \
  -display "${DISPLAY_NUM}" \
  -nopw \
  -listen localhost \
  -xkb \
  -rfbport 5900 \
  -forever \
  -shared \
  >/tmp/x11vnc.log 2>&1 &

# Forward termination to the turtlesim node for a clean shutdown.
# websockify runs in the background so the trap survives (exec would replace
# the shell and discard it).
trap 'kill -TERM "${TURTLE_PID}" 2>/dev/null || true' TERM INT

# Serve noVNC static assets and bridge WebSocket -> VNC on :6080.
websockify \
  --web /usr/share/novnc/ \
  --heartbeat 30 \
  6080 \
  localhost:5900 &

wait -n
