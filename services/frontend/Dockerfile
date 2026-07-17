# UberOS frontend SPA (Svelte + Golden Layout v2).
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
RUN npm config set registry "$NPM_REGISTRY" && npm install
COPY . .
RUN npm run build

# --- serve stage ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
