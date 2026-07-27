# UbeROS code editor container (code-server).
# Serves a browser VS Code experience bound to the shared ROS workspace so
# edits are immediately visible to the ROS build toolchain (F-15, S6). See WP-7.
FROM codercom/code-server:4.129.0

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Ensure the shared workspace mount point exists and is owned by the coder user.
RUN mkdir -p /ros_ws/src && chown -R coder:coder /ros_ws

# Pre-create the code-server state directory owned by coder so the named volume
# mounted here inherits coder ownership. Otherwise the volume is root-owned and
# code-server (running as uid 1000) cannot write its heartbeat/session state,
# which breaks the workbench WebSocket connection (close code 1006).
# The user-data dir also holds VS Code secret storage (the Copilot login), so
# coder ownership here backs the token-at-rest permissions for FR-D2/FR-D4.
RUN mkdir -p /home/coder/.local/share/code-server \
    && chown -R coder:coder /home/coder/.local

# Same ownership prep for the machine/config dir so the `editor-config` named
# volume also inherits coder ownership (FR-D1) and avoids the root-owned-volume
# write failure described above.
RUN mkdir -p /home/coder/.config/code-server \
    && chown -R coder:coder /home/coder/.config

USER coder

# --- Baked ROS/robotics developer extensions (Theme H, FR-H2) -----------------
# This curated baseline is FIXED: it is installed at build time and is
# not user-selectable (the curated set is the same for every container).
# Every UbeROS editor ships with the same ROS + language
#
# Curated set (all resolve on Open VSX, the marketplace code-server queries):
#   Ranch-Hand-Robotics.rde-ros-2          ROS 2 developer extensions (the
#                                          maintained successor to the classic
#                                          ms-iot.vscode-ros, which is not on
#                                          Open VSX).
#   ms-python.python                       Python language support (ROS 2 rclpy nodes).
#   llvm-vs-code-extensions.vscode-clangd  C/C++ IntelliSense via clangd (ROS 2 rclcpp);
#                                          installs cleanly on Open VSX where the
#                                          proprietary ms-vscode.cpptools is not
#                                          redistributable.
#   redhat.vscode-yaml                     YAML for launch/param/description files.
#   ms-vscode.cmake-tools                  CMake build integration (ament/colcon).
#
# Coexistence with the `editor-data` volume (FR-D1): keep a curated extension
# cache OUTSIDE the mounted user-data path and reconcile it at startup into
# ~/.local/share/code-server/extensions when any curated extension is missing.
# This makes the curated baseline appear on fresh volumes and on upgrades with
# pre-existing `editor-data`, while preserving user-installed extensions.
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        clangd \
        cmake \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/uberos/curated-extensions \
    && chown -R coder:coder /opt/uberos

USER coder
RUN code-server \
        --extensions-dir /opt/uberos/curated-extensions \
        --install-extension Ranch-Hand-Robotics.rde-ros-2@1.0.9 \
        --install-extension ms-python.python@2026.4.0 \
        --install-extension llvm-vs-code-extensions.vscode-clangd@0.6.0 \
        --install-extension redhat.vscode-yaml@1.24.2026063009 \
        --install-extension ms-vscode.cmake-tools@1.23.52

USER root
COPY entrypoint.sh /usr/local/bin/uberos-editor-entrypoint.sh
RUN chmod +x /usr/local/bin/uberos-editor-entrypoint.sh

USER coder
ENTRYPOINT ["/usr/local/bin/uberos-editor-entrypoint.sh"]

EXPOSE 8443
