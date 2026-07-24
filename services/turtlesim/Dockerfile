# UbeROS Turtlesim visualizer container (PRD Theme C, FR-C1).
# A lightweight second simulator: turtlesim_node rendered into a virtual
# framebuffer (Xvfb :99) and streamed to the browser over noVNC. Unlike the
# Gazebo path (simulator + vnc sidecar in a shared namespace), Turtlesim is
# light enough to run Xvfb + turtlesim_node + openbox + x11vnc + websockify all
# in ONE container, so MIT-SHM works and no sidecar is needed.
#
# ROS_DISTRO is parameterized (default kilted) to stay paired with the rest of
# the stack (ADR-001); turtlesim joins the ROS graph natively over the Fast DDS
# discovery server (no multicast), so it must carry the same DDS profile as the
# ros/simulator services.
ARG ROS_DISTRO=kilted
FROM ros:${ROS_DISTRO}-ros-base

# ROS_DISTRO is not automatically re-exposed after FROM; redeclare it.
ARG ROS_DISTRO
ENV ROS_DISTRO=${ROS_DISTRO}

# turtlesim + the VNC toolchain (Xvfb framebuffer, openbox window manager,
# x11vnc export, novnc/websockify browser bridge). x11-utils provides xdpyinfo
# for the framebuffer readiness probe; curl is used by the container health check.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ros-${ROS_DISTRO}-turtlesim \
        xvfb \
        x11-utils \
        openbox \
        x11vnc \
        novnc \
        websockify \
        curl \
    && rm -rf /var/lib/apt/lists/*

# DDS discovery-server client profile so turtlesim_node finds the ROS graph
# over unicast (RISK-4). Openbox config undecorates/maximizes the turtle window
# so noVNC shows the canvas instead of a stray window on a black desktop.
COPY config/dds_discovery.xml /etc/ros/dds_discovery.xml
COPY openbox-rc.xml /etc/openbox-rc.xml
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV DISPLAY=:99
ENV ROS_DOMAIN_ID=42
ENV RMW_IMPLEMENTATION=rmw_fastrtps_cpp
ENV FASTDDS_DEFAULT_PROFILES_FILE=/etc/ros/dds_discovery.xml

# noVNC (6080) and VNC (5900) are reachable only through the proxy; never
# host-published (INV-04, WP-13 security baseline).
EXPOSE 5900 6080

ENTRYPOINT ["/entrypoint.sh"]
