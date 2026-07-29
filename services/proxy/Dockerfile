# UbeROS reverse proxy image. Extends the stock nginx with a startup script that
# renders the optional auth include from UBEROS_AUTH (BR-010). The nginx image
# runs every executable in /docker-entrypoint.d/ before starting nginx, so no
# custom entrypoint is needed.
FROM nginx:1.27-alpine

# OCI provenance labels. UBEROS_VERSION defaults to `dev` for local builds and
# is overridden at release time (FR-A5). See docs/VERSIONING.md.
ARG UBEROS_VERSION=dev
LABEL org.opencontainers.image.version="${UBEROS_VERSION}" \
      org.opencontainers.image.title="uberos-proxy" \
      org.opencontainers.image.source="https://github.com/jmservera/UbeROS"

COPY docker-entrypoint.d/40-uberos-auth.sh /docker-entrypoint.d/40-uberos-auth.sh
RUN chmod +x /docker-entrypoint.d/40-uberos-auth.sh

# The routing table is BAKED IN rather than bind-mounted from the source tree.
# A release bundle ships no checkout (FR-C1), so a `./services/proxy/nginx.conf`
# mount would resolve to a missing path and Docker would create it as an empty
# DIRECTORY -- nginx then starts with no routes and the single ingress is dead.
# Editing this file locally therefore needs `docker compose build proxy`.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Default: auth disabled (localhost Init). Override with UBEROS_AUTH=basic.
ENV UBEROS_AUTH=off
