# UbeROS gzweb 3D client (PRD Theme F, FR-F3). Multi-stage build (mirrors the
# frontend image): Vite bundles the gazebo-web `gzweb` SceneManager together
# with Three.js + protobufjs into static assets, then nginx serves them at
# /gzweb/. No Xvfb, no VNC, no server GL — the browser reconstructs the scene
# state streamed from the headless gazebo container's WebsocketServer (:9002).

# --- build stage ---
FROM node:20-alpine AS build
# The npm registry is configurable so a corporate/internal proxy stays out of
# the repo. Default is the public registry; override via the NPM_REGISTRY build
# arg (wired from .env through compose.yaml, exactly like services/frontend).
ARG NPM_REGISTRY=https://registry.npmjs.org/
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm config set registry "$NPM_REGISTRY" && npm install
COPY . .
RUN npm run build

# --- serve stage ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Built with Vite base '/gzweb/', so the assets live under a /gzweb/ path
# prefix; copy them there so request paths map 1:1 onto the filesystem.
COPY --from=build /app/dist /usr/share/nginx/html/gzweb
EXPOSE 3000
