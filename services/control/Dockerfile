# UberOS control service — the operational control plane behind /control/.
# Mounts the Docker socket to restart individual services (BR-007). Kept tiny
# and dependency-free: it talks to the Docker Engine API over the unix socket
# using only the Node standard library.
FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY server.js ./

# No dependencies to install (stdlib only); npm ci is skipped intentionally.

ENV CONTROL_PORT=9000
EXPOSE 9000

# Liveness for compose: the control service reports its own health.
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=5s \
  CMD wget -q -O - http://127.0.0.1:9000/health >/dev/null || exit 1

# Runs as root so it can open the bind-mounted Docker socket, whose group GID is
# host-specific. The container is on the internal network only and its API is
# restricted to a fixed service allowlist (see server.js).
CMD ["node", "server.js"]
