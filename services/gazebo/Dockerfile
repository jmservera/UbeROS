# UbeROS Gazebo simulator container (PRD Theme F, FR-F1).
#
# Runs Gazebo HEADLESSLY (`gz sim -s`, server only) and exposes the running
# simulation to the browser as SCENE STATE over a WebSocket (gz-launch
# WebsocketServer plugin, port 9002) — NOT a pixel stream. The browser renders
# the scene client-side with the self-hosted gzweb client, so this container
# needs no Xvfb, no VNC sidecar, and no server-side GL context for the 3D world
# view. This replaces the old `simulator` (Xvfb) + `vnc` (x11vnc/noVNC) pair.
# See .copilot-tracking/research/2026-07-21/gzweb-web-visualization-feasibility-research.md
#
# GZ_RELEASE is parameterized (default ionic). On Ionic the websocket server
# ships with gz-launch (`gz::launch::WebsocketServer`) and the `-full` image
# includes gz-launch; switch GZ_RELEASE in .env with no other edits.
ARG GZ_RELEASE=ionic
ARG ROS_DISTRO=kilted
FROM ghcr.io/openrobotics/gazebo:${GZ_RELEASE}-full

# ROS_DISTRO is not automatically re-exposed after FROM; redeclare it so the
# Theme E ros_gz bridge (added later to this same container) can source ROS.
ARG ROS_DISTRO
ENV ROS_DISTRO=${ROS_DISTRO}

# procps provides pgrep for the health check. The gz-launch websocket server
# plugin is already present in the `-full` image; installed defensively in case
# a slimmer base is pinned later (the package is a no-op if already satisfied).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        procps \
    && rm -rf /var/lib/apt/lists/*

# Disable automatic Fuel downloads; the world uses built-in primitives only.
COPY config/fuel.yaml /root/.gz/fuel/config.yaml

# The world SDF and any models are mounted read-only at /simulation (see
# compose.yaml). The scene-broadcaster/physics systems in the world produce the
# scene graph and pose stream the WebsocketServer bridges to the browser.
ENV GZ_SIM_RESOURCE_PATH=/simulation/models:/simulation/worlds

COPY config/websocket.gzlaunch /etc/uberos/websocket.gzlaunch
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# The scene-state WebSocket (9002) is reached only through the proxy at
# /gzweb/ws/; it is never host-published (INV-04, WP-13 security baseline).
EXPOSE 9002

ENTRYPOINT ["/entrypoint.sh"]
