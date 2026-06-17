#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="${1:-./artifacts/ticket005}"
STAGING_URL="${STAGING_URL:-}"
ALLOWED_ORIGIN="${ALLOWED_ORIGIN:-}"
DISALLOWED_ORIGIN="${DISALLOWED_ORIGIN:-https://evil.example.com}"

mkdir -p "${LOG_DIR}"
LOG_FILE="${LOG_DIR}/ticket005-security-check.log"
RESULT_FILE="${LOG_DIR}/ticket005-result.txt"
BACKEND_LOG="${LOG_DIR}/backend.log"
FRONTEND_LOG="${LOG_DIR}/frontend.log"
CADDY_LOG="${LOG_DIR}/caddy.log"

backend_pid=""
frontend_pid=""
caddy_pid=""

cleanup() {
  if [[ -n "${caddy_pid}" ]]; then kill "${caddy_pid}" >/dev/null 2>&1 || true; fi
  if [[ -n "${frontend_pid}" ]]; then kill "${frontend_pid}" >/dev/null 2>&1 || true; fi
  if [[ -n "${backend_pid}" ]]; then kill "${backend_pid}" >/dev/null 2>&1 || true; fi
}

wait_for_url() {
  local url="$1"
  local attempts="${2:-40}"
  local delay_seconds="${3:-1}"
  local n=1

  while (( n <= attempts )); do
    if curl -sS -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    n=$((n + 1))
    sleep "${delay_seconds}"
  done
  return 1
}

start_local_smoke_stack() {
  echo "Starting local smoke stack (no public domain required)..."

  if ! command -v caddy >/dev/null 2>&1; then
    echo "caddy command not found in CI runner"
    return 1
  fi

  export AUTH_ENABLED="0"
  export ENABLE_SCRAPING="0"

  python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 >"${BACKEND_LOG}" 2>&1 &
  backend_pid="$!"

  npm --prefix frontend ci >/dev/null
  npm --prefix frontend run build >/dev/null
  npm --prefix frontend run preview -- --host 127.0.0.1 --port 4173 >"${FRONTEND_LOG}" 2>&1 &
  frontend_pid="$!"

  if ! caddy validate --config deploy/caddy/Caddyfile.local >>"${CADDY_LOG}" 2>&1; then
    echo "Caddy config validation failed"
    tail -n 120 "${CADDY_LOG}" || true
    return 1
  fi

  caddy run --config deploy/caddy/Caddyfile.local >"${CADDY_LOG}" 2>&1 &
  caddy_pid="$!"

  if ! wait_for_url "http://127.0.0.1:8000/health" 60 1; then
    echo "Backend did not become healthy in time"
    return 1
  fi
  if ! wait_for_url "http://127.0.0.1:4173" 60 1; then
    echo "Frontend preview did not become healthy in time"
    return 1
  fi
  if ! wait_for_url "http://localhost:8080" 60 1; then
    echo "Caddy HTTP listener did not become healthy in time"
    echo "--- Caddy log tail ---"
    tail -n 120 "${CADDY_LOG}" || true
    echo "--- Frontend log tail ---"
    tail -n 120 "${FRONTEND_LOG}" || true
    echo "--- Backend log tail ---"
    tail -n 120 "${BACKEND_LOG}" || true
    return 1
  fi

  export CURL_INSECURE="1"
  STAGING_URL="https://localhost:8443"
  if [[ -z "${ALLOWED_ORIGIN}" ]]; then
    ALLOWED_ORIGIN="https://localhost:8443"
  fi

  echo "Local smoke stack is ready"
  echo "STAGING_URL=${STAGING_URL}"
  echo "ALLOWED_ORIGIN=${ALLOWED_ORIGIN}"
}

trap cleanup EXIT

{
  echo "Ticket-005 security validation"
  echo "Timestamp (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "STAGING_URL=${STAGING_URL:-<unset>}"
  echo "ALLOWED_ORIGIN=${ALLOWED_ORIGIN:-<unset>}"
  echo "DISALLOWED_ORIGIN=${DISALLOWED_ORIGIN}"
  echo

  if [[ -z "${STAGING_URL}" || "${STAGING_URL}" == "https://localhost:8443" ]]; then
    echo "No public staging URL configured. Using local smoke mode."
    start_local_smoke_stack
  fi

  echo "Running scripts/validate-security-headers.sh..."
  bash scripts/validate-security-headers.sh "${STAGING_URL}" "${ALLOWED_ORIGIN}" "${DISALLOWED_ORIGIN}"
  echo
  echo "PASSED: Ticket-005 security validation succeeded."
  echo "passed" > "${RESULT_FILE}"
} | tee "${LOG_FILE}"
