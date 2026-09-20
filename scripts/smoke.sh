#!/usr/bin/env bash
#
# Phase 1 smoke test: capture, idempotency, auth gates, and read-back.
#
# Prerequisites:
#   1. A migrated database (npm run db:migrate) and DATABASE_URL set.
#   2. The app running:  npm run dev
#
# Run with:
#   npm run smoke
#   APP_URL=http://localhost:3000 npm run smoke
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

APP_URL="${APP_URL:-http://localhost:3000}"
INGEST_TOKEN="${INGEST_TOKEN:?INGEST_TOKEN must be set}"
DASHBOARD_PASSPHRASE="${DASHBOARD_PASSPHRASE:?DASHBOARD_PASSPHRASE must be set}"

COOKIE_JAR="$(mktemp)"
IDEMPOTENCY_KEY="smoke-$(date +%s)-$RANDOM"
IDEA_TEXT="smoke test idea $IDEMPOTENCY_KEY"

pass=0
fail=0
check() {
  if [ "$2" = "$3" ]; then
    echo "  PASS: $1"
    pass=$((pass + 1))
  else
    echo "  FAIL: $1 (expected '$2', got '$3')"
    fail=$((fail + 1))
  fi
}
status() { curl -s -m 10 -o /dev/null -w '%{http_code}' "$@"; }
extract() { python3 -c "import sys,json; print(json.load(sys.stdin)[\"$1\"])"; }

echo "Smoke testing $APP_URL"

echo "auth surface"
check "health returns 200" "200" "$(status "$APP_URL/api/health")"
check "unauthenticated capture is 401" "401" "$(status -X POST "$APP_URL/api/ideas" -H 'Content-Type: application/json' -d '{"raw_text":"x"}')"
check "bad bearer token is 401" "401" "$(status -X POST "$APP_URL/api/ideas" -H 'Authorization: Bearer nope' -H 'Content-Type: application/json' -d '{"raw_text":"x"}')"
check "private page redirects when signed out" "307" "$(status "$APP_URL/")"
check "wrong passphrase is rejected" "303" "$(status -X POST "$APP_URL/api/login" -d 'passphrase=definitely-wrong')"

echo "capture with idempotency"
first=$(curl -s -m 10 -w '\n%{http_code}' -X POST "$APP_URL/api/ideas" \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d "{\"raw_text\":\"$IDEA_TEXT\"}")
first_code=$(printf '%s' "$first" | tail -n1)
first_body=$(printf '%s' "$first" | sed '$d')
check "capture returns 201" "201" "$first_code"
check "first capture reports created=true" "True" "$(printf '%s' "$first_body" | extract created)"
idea_id=$(printf '%s' "$first_body" | extract id)

retry=$(curl -s -m 10 -w '\n%{http_code}' -X POST "$APP_URL/api/ideas" \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  -d "{\"raw_text\":\"$IDEA_TEXT\"}")
check "retry returns 200" "200" "$(printf '%s' "$retry" | tail -n1)"
check "retry returns the same id" "$idea_id" "$(printf '%s' "$retry" | sed '$d' | extract id)"
check "retry reports created=false" "False" "$(printf '%s' "$retry" | sed '$d' | extract created)"

echo "read back in the dashboard"
curl -s -m 10 -c "$COOKIE_JAR" -o /dev/null -X POST "$APP_URL/api/login" -d "passphrase=$DASHBOARD_PASSPHRASE"
check "home loads when signed in" "200" "$(status -b "$COOKIE_JAR" "$APP_URL/")"
home=$(curl -s -m 10 -b "$COOKIE_JAR" "$APP_URL/")
printf '%s' "$home" | grep -q "$IDEMPOTENCY_KEY" && check "captured idea appears in list" ok ok || check "captured idea appears in list" ok missing
check "idea detail page loads" "200" "$(status -b "$COOKIE_JAR" "$APP_URL/ideas/$idea_id")"
check "unknown idea is 404" "404" "$(status -b "$COOKIE_JAR" "$APP_URL/ideas/00000000-0000-0000-0000-000000000000")"
check "malformed id is 404, not 500" "404" "$(status -b "$COOKIE_JAR" "$APP_URL/ideas/not-a-uuid")"

echo "projects"
create_project=$(curl -s -m 10 -w '\n%{http_code}' -b "$COOKIE_JAR" -X POST "$APP_URL/api/projects" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke $IDEMPOTENCY_KEY\",\"one_liner\":\"smoke project\",\"context\":\"smoke context\",\"status\":\"active\"}")
check "create project 201" "201" "$(printf '%s' "$create_project" | tail -n1)"
project_id=$(printf '%s' "$create_project" | sed '$d' | extract id)

check "edit project 200" "200" "$(status -b "$COOKIE_JAR" -X PATCH "$APP_URL/api/projects/$project_id" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke project renamed","one_liner":"smoke project","context":"smoke context v2","status":"paused"}')"
projects_html=$(curl -s -m 10 -b "$COOKIE_JAR" "$APP_URL/projects")
printf '%s' "$projects_html" | grep -q "Smoke project renamed" && check "project appears in list" ok ok || check "project appears in list" ok missing

check "archive project 200" "200" "$(status -b "$COOKIE_JAR" -X PATCH "$APP_URL/api/projects/$project_id" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke project renamed","one_liner":"smoke project","context":"smoke context v2","status":"paused","archived":true}')"
projects_html=$(curl -s -m 10 -b "$COOKIE_JAR" "$APP_URL/projects")
if printf '%s' "$projects_html" | grep -q "Smoke project renamed"; then
  check "archived project hidden by default" hidden shown
else
  check "archived project hidden by default" ok ok
fi

echo "idea edit and delete"
edited_id=$(printf '%s' "$(curl -s -m 10 -b "$COOKIE_JAR" -X POST "$APP_URL/api/ideas" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: smoke-edit-$IDEMPOTENCY_KEY" \
  -d "{\"raw_text\":\"editable idea $IDEMPOTENCY_KEY\"}")" | extract id)
check "edit idea 200" "200" "$(status -b "$COOKIE_JAR" -X PATCH "$APP_URL/api/ideas/$edited_id" \
  -H 'Content-Type: application/json' -d '{"raw_text":"edited idea text"}')"
idea_html=$(curl -s -m 10 -b "$COOKIE_JAR" "$APP_URL/ideas/$edited_id")
printf '%s' "$idea_html" | grep -q "edited idea text" && check "idea edit visible" ok ok || check "idea edit visible" ok missing
check "delete idea 200" "200" "$(status -b "$COOKIE_JAR" -X DELETE "$APP_URL/api/ideas/$edited_id")"
check "deleted idea is 404" "404" "$(status -b "$COOKIE_JAR" "$APP_URL/ideas/$edited_id")"

check "delete project 200" "200" "$(status -b "$COOKIE_JAR" -X DELETE "$APP_URL/api/projects/$project_id")"

rm -f "$COOKIE_JAR"

echo
echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
