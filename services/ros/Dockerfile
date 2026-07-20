# UbeROS ROS 2 core container.
# Provides ROS middleware, colcon toolchain, rosbridge (browser <-> ROS graph),
# and ttyd (browser terminals). See WP-2 in docs/specs/01-Init-research.md.
#
# ROS_DISTRO is parameterized (default lyrical). If SPIKE-A shows a Lyrical
# package gap, switch ROS_DISTRO=jazzy in .env with no other edits (ADR-001).
ARG ROS_DISTRO=lyrical
FROM ros:${ROS_DISTRO}-ros-base

# ROS_DISTRO is not automatically re-exposed after FROM; redeclare it.
ARG ROS_DISTRO
ENV ROS_DISTRO=${ROS_DISTRO}

# Install colcon toolchain, rosbridge, rosapi, ros-gz integration, and utilities.
# procps provides pgrep; curl/wget used by tooling and health probing.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3-colcon-common-extensions \
        python3-rosdep \
        python3-vcstool \
        ros-${ROS_DISTRO}-rosbridge-suite \
        ros-${ROS_DISTRO}-rosapi \
        ros-${ROS_DISTRO}-ros-gz \
        procps \
        tmux \
        curl \
        wget \
        ca-certificates \
    && (rosdep init 2>/dev/null || true) \
    && rm -rf /var/lib/apt/lists/*

# Install ttyd (browser terminal over WebSocket) for the selected architecture.
# TARGETARCH is provided by BuildKit; map it to ttyd's asset naming (RISK-7).
ARG TTYD_VERSION=1.7.7
ARG TARGETARCH
RUN set -eux; \
    case "${TARGETARCH}" in \
        amd64) TTYD_ARCH="x86_64" ;; \
        arm64) TTYD_ARCH="aarch64" ;; \
        *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    wget -qO /usr/local/bin/ttyd \
        "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTYD_ARCH}"; \
    chmod +x /usr/local/bin/ttyd; \
    ttyd --version

RUN mkdir -p /ros_ws/src
WORKDIR /ros_ws

COPY config/dds_discovery.xml /etc/ros/dds_discovery.xml
COPY entrypoint.sh /entrypoint.sh
COPY tmux.conf /root/.tmux.conf
COPY uberos-term.sh /usr/local/bin/uberos-term
RUN chmod +x /entrypoint.sh /usr/local/bin/uberos-term

ENV ROS_DOMAIN_ID=42
ENV RMW_IMPLEMENTATION=rmw_fastrtps_cpp
ENV FASTRTPS_DEFAULT_PROFILES_FILE=/etc/ros/dds_discovery.xml

# rosbridge WebSocket and ttyd. Exposed for inter-container use only; the proxy
# is the sole ingress and these ports must never be host-published.
EXPOSE 9090 7681

ENTRYPOINT ["/entrypoint.sh"]
