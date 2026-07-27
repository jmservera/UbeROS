#!/bin/sh
set -eu

CURATED_DIR="/opt/uberos/curated-extensions"
TARGET_DIR="${HOME:-/home/coder}/.local/share/code-server/extensions"

mkdir -p "${TARGET_DIR}"

if [ -d "${CURATED_DIR}" ]; then
    for extension_dir in "${CURATED_DIR}"/*; do
        [ -d "${extension_dir}" ] || continue
        target_extension_dir="${TARGET_DIR}/$(basename "${extension_dir}")"
        if [ ! -d "${target_extension_dir}" ]; then
            cp -a "${extension_dir}" "${target_extension_dir}"
        fi
    done
fi

exec code-server "$@"
