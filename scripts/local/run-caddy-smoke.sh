#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
Local Caddy smoke helper

Expected prerequisites:
1) Backend running on http://localhost:8000
2) Frontend preview running on http://localhost:4173
   (example: cd frontend && npm run build && npm run preview -- --host --port 4173)
3) Caddy installed locally

This script validates Caddy config and starts Caddy in foreground with local certs.
Use another terminal for validation checks.
EOF

if ! command -v caddy >/dev/null 2>&1; then
  echo "caddy command not found. Install Caddy first."
  exit 1
fi

echo "Validating deploy/caddy/Caddyfile.local"
caddy validate --config deploy/caddy/Caddyfile.local

echo "Starting Caddy local smoke edge on :8080 and :8443"
echo "Run this in another terminal: REDIRECT_HTTP_URL=http://localhost:8080 CURL_INSECURE=1 bash scripts/validate-security-headers.sh https://localhost:8443 https://localhost:8443"
exec caddy run --config deploy/caddy/Caddyfile.local
