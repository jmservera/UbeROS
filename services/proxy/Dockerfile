# UberOS reverse proxy image. Extends the stock nginx with a startup script that
# renders the optional auth include from UBEROS_AUTH (BR-010). The nginx image
# runs every executable in /docker-entrypoint.d/ before starting nginx, so no
# custom entrypoint is needed.
FROM nginx:1.27-alpine

COPY docker-entrypoint.d/40-uberos-auth.sh /docker-entrypoint.d/40-uberos-auth.sh
RUN chmod +x /docker-entrypoint.d/40-uberos-auth.sh

# Default: auth disabled (localhost Init). Override with UBEROS_AUTH=basic.
ENV UBEROS_AUTH=off
