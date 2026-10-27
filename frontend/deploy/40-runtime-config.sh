#!/bin/sh
# Writes the frontend's runtime settings. Runs before nginx starts
# (scripts in /docker-entrypoint.d/ are run by the official nginx image).
set -eu
case "${API_URL}" in
  *\"* | *\\* | *"<"*) echo "API_URL contains invalid characters" >&2; exit 1 ;;
esac
printf 'window.__APP_CONFIG__ = { apiUrl: "%s" }\n' "${API_URL}" > /usr/share/nginx/html/config.js
echo "runtime config: apiUrl=${API_URL:-(same origin)}"
