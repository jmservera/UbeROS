#!/bin/sh
# Render the optional basic-auth include from UBEROS_AUTH (BR-010) before nginx
# starts. This is what makes proxy authentication toggleable from .env with no
# code edits: the main config always `include`s /etc/nginx/uberos/auth.conf, and
# this script decides whether that file enables or disables auth_basic.
set -eu

auth="$(printf '%s' "${UBEROS_AUTH:-off}" | tr '[:upper:]' '[:lower:]')"
mkdir -p /etc/nginx/uberos

if [ "$auth" = "basic" ]; then
  if [ ! -s /etc/nginx/auth/.htpasswd ]; then
    echo "uberos-auth: UBEROS_AUTH=basic but /etc/nginx/auth/.htpasswd is missing or empty." >&2
    echo "uberos-auth: generate one with 'htpasswd -c config/nginx/.htpasswd <user>'." >&2
  fi
  cat > /etc/nginx/uberos/auth.conf <<'EOF'
auth_basic           "UberOS";
auth_basic_user_file /etc/nginx/auth/.htpasswd;
EOF
  echo "uberos-auth: basic auth ENABLED."
else
  cat > /etc/nginx/uberos/auth.conf <<'EOF'
auth_basic off;
EOF
  echo "uberos-auth: basic auth disabled (UBEROS_AUTH=${UBEROS_AUTH:-off})."
fi
