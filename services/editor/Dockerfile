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
# This curated set is FIXED and ALWAYS-ON: it is installed at build time and is
# NOT user-selectable. Every UbeROS editor ships with the same ROS + language
# tooling out of the box, with no per-user configuration required.
#
# Curated set (all resolve on Open VSX, the marketplace code-server queries):
#   Ranch-Hand-Robotics.rde-ros-2          ROS 2 developer extensions (the
#                                          maintained successor to the classic
#                                          ms-iot.vscode-ros, which is not on
#                                          Open VSX).
#   ms-python.python                       Python language support (rospy nodes).
#   llvm-vs-code-extensions.vscode-clangd  C/C++ IntelliSense via clangd (roscpp);
#                                          installs cleanly on Open VSX where the
#                                          proprietary ms-vscode.cpptools is not
#                                          redistributable.
#   redhat.vscode-yaml                     YAML for launch/param/description files.
#   ms-vscode.cmake-tools                  CMake build integration (ament/colcon).
#
# Coexistence with the `editor-data` volume (FR-D1): code-server's default
# extensions dir is ~/.local/share/code-server/extensions, which lives INSIDE
# the path the `editor-data` named volume mounts at runtime
# (/home/coder/.local/share/code-server). Because `editor-data` is a NAMED
# volume, Docker seeds it from the image's contents at that path the first time
# it is mounted, so this baked set is copied into the volume and is present on a
# fresh container. User-installed extensions are stored alongside in the same
# dir and persist together. (Note: a volume already populated from a build
# before this change is not retro-seeded — recreate the `editor-data` volume, or
# start a fresh container, to pick up the baked set.)
RUN code-server \
        --install-extension Ranch-Hand-Robotics.rde-ros-2@1.0.9 \
        --install-extension ms-python.python \
        --install-extension llvm-vs-code-extensions.vscode-clangd@0.6.0 \
        --install-extension redhat.vscode-yaml@1.24.2026063009 \
        --install-extension ms-vscode.cmake-tools@1.23.52

EXPOSE 8443
