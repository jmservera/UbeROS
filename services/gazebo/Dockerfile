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
# plugin is expected to be present in the `-full` image used by this service.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        procps \
        curl \
        gnupg2 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- Theme E: ros_gz bridge (FR-E1/FR-E4/FR-E5) -------------------------------
# The Gazebo `-full` base is NOT a ROS image, so add the packages.ros.org apt
# repo (signed-by keyring, no apt-key) and install the ros_gz BRIDGE only.
#
# We install `ros-${ROS_DISTRO}-ros-gz-bridge` rather than the full `ros-gz`
# metapackage on purpose (FR-E5): the bridge is the ONLY ros_gz component this
# container runs, and it depends solely on the gz-transport/gz-msgs stack for
# the PINNED Gazebo release — which the kilted<->ionic pairing makes identical
# to the Gazebo already in the base image, so apt resolves ONE Gazebo version
# and never pulls a second. The full metapackage would drag in ros_gz_sim /
# ros_gz_image (a redundant sim launcher + camera-render deps) that this
# headless, client-rendered path does not need. Keep ROS_DISTRO<->GZ_RELEASE
# pinned to kilted<->ionic (FR-E5); changing one without the other can pull a
# mismatched Gazebo.
RUN . /etc/os-release \
    && UBUNTU_CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}" \
    && test -n "${UBUNTU_CODENAME}" \
    && curl -fsSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \
        | gpg --dearmor -o /usr/share/keyrings/ros-archive-keyring.gpg \
    # NOTE: HTTP is intentional here. In this environment the HTTPS endpoint
    # fails certificate principal validation (`SEC_E_WRONG_PRINCIPAL`), while
    # HTTP works reliably for apt index retrieval.
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu ${UBUNTU_CODENAME} main" \
        > /etc/apt/sources.list.d/ros2.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ros-${ROS_DISTRO}-ros-gz-bridge \
    && rm -rf /var/lib/apt/lists/*

# DDS discovery-server client profile so the ros_gz bridge finds the ROS graph
# over unicast (FR-E3/FR-E4, RISK-4). Same profile the ros/turtlesim services
# carry; ROS_DISCOVERY_SERVER + ROS_DOMAIN_ID are supplied by compose.
COPY config/dds_discovery.xml /etc/ros/dds_discovery.xml
ENV FASTRTPS_DEFAULT_PROFILES_FILE=/etc/ros/dds_discovery.xml

# Default bridge topic map (/clock). Additive: more topics append here (FR-E2).
COPY config/ros_gz_bridge.yaml /etc/uberos/ros_gz_bridge.yaml
# ------------------------------------------------------------------------------

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
