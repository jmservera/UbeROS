# UbeROS frontend SPA (Svelte + Golden Layout v2).
# Multi-stage build: Vite compiles the app, then nginx serves the static output
# on :3000. See WP-9 in docs/specs/01-Init-research.md.

# --- build stage ---
FROM node:20-alpine AS build
# npm registry is configurable so corporate/internal proxies stay out of the
# repo. Default is the public registry; override via the NPM_REGISTRY build arg
# (wired from .env through compose.yaml).
ARG NPM_REGISTRY=https://registry.npmjs.org/
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm config set registry "$NPM_REGISTRY" && npm ci
COPY . .
RUN npm run build

# --- serve stage ---
FROM nginx:1.27-alpine
# OCI provenance labels on the shipped runtime image. UBEROS_VERSION defaults to
# `dev` for local builds and is overridden at release time (FR-A5). See
# docs/VERSIONING.md.
ARG UBEROS_VERSION=dev
LABEL org.opencontainers.image.version="${UBEROS_VERSION}" \
      org.opencontainers.image.title="uberos-frontend" \
      org.opencontainers.image.source="https://github.com/jmservera/UbeROS"
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
