#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-}"
ALLOWED_ORIGIN="${2:-}"
DISALLOWED_ORIGIN="${3:-https://evil.example.com}"
CURL_INSECURE="${CURL_INSECURE:-0}"
REDIRECT_HTTP_URL="${REDIRECT_HTTP_URL:-}"

curl_args=(-sS)
if [[ "${CURL_INSECURE}" == "1" ]]; then
  curl_args+=(-k)
fi

if [[ -z "${BASE_URL}" ]]; then
  echo "Usage: $0 <https-base-url> [allowed-origin] [disallowed-origin]"
  echo "Optional: set CURL_INSECURE=1 for local self-signed smoke tests."
  exit 2
fi

if [[ "${BASE_URL}" != https://* ]]; then
  echo "BASE_URL must start with https://"
  exit 2
fi

host="${BASE_URL#https://}"
host="${host%%/*}"
http_url="http://${host}"
redirect_source_url="${REDIRECT_HTTP_URL:-${http_url}}"
api_health="${BASE_URL%/}/api/health"

function require_header() {
  local headers="$1"
  local key="$2"
  if ! grep -iq "^${key}:" <<<"${headers}"; then
    echo "Missing header: ${key}"
    exit 1
  fi
  echo "OK header: ${key}"
}

echo "[1/5] Checking HTTP -> HTTPS redirect"
redirect_location="$(curl "${curl_args[@]}" -I "${redirect_source_url}" | tr -d '\r' | awk -F': ' 'tolower($1)=="location" {print $2}' | head -n1)"
if [[ "${redirect_location}" != https://* ]]; then
  echo "Expected HTTPS redirect from ${redirect_source_url}, got: ${redirect_location:-<none>}"
  exit 1
fi
echo "OK redirect: ${redirect_location}"

echo "[2/5] Checking baseline security headers"
headers="$(curl "${curl_args[@]}" -I "${BASE_URL}" | tr -d '\r')"
require_header "${headers}" "Strict-Transport-Security"
require_header "${headers}" "X-Content-Type-Options"
require_header "${headers}" "Referrer-Policy"
require_header "${headers}" "Content-Security-Policy"

echo "[3/5] Checking API health"
health_body="$(curl "${curl_args[@]}" "${api_health}")"
if ! grep -q '"status"' <<<"${health_body}"; then
  echo "Unexpected /api/health response: ${health_body}"
  exit 1
fi
echo "OK /api/health response"

echo "[4/5] Checking CORS denies disallowed origin"
cors_disallowed="$(curl "${curl_args[@]}" -I -H "Origin: ${DISALLOWED_ORIGIN}" "${api_health}" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin" {print $2}' | head -n1 || true)"
if [[ "${cors_disallowed}" == "${DISALLOWED_ORIGIN}" ]]; then
  echo "Disallowed origin was accepted: ${DISALLOWED_ORIGIN}"
  exit 1
fi
echo "OK disallowed origin was not echoed"

echo "[5/5] Checking CORS allows configured origin (optional)"
if [[ -n "${ALLOWED_ORIGIN}" ]]; then
  cors_allowed="$(curl "${curl_args[@]}" -I -H "Origin: ${ALLOWED_ORIGIN}" "${api_health}" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin" {print $2}' | head -n1 || true)"
  if [[ "${cors_allowed}" != "${ALLOWED_ORIGIN}" ]]; then
    echo "Expected allowed origin ${ALLOWED_ORIGIN}, got: ${cors_allowed:-<none>}"
    exit 1
  fi
  echo "OK allowed origin echoed"
else
  echo "Skipped (no allowed-origin argument provided)"
fi

echo "All checks passed."
