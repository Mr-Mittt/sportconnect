#!/usr/bin/env bash
# INFRA-9: check from OUTSIDE the box that the service-to-service endpoints (/internal/**) and the other paths the proxy
# must not forward are not reachable, and that no container or backing-service port is open on the box's public address.
# Sends no secret, so a pass means the request never reached the application (a wrong secret would give a 401/403 from
# the app, which is a different, already covered case).
#
#   infra/scripts/verify-internal-isolation.sh [host]                 host defaults to yoursport.vn
#   EXPECT_INTERNAL_CODE=200 infra/scripts/verify-internal-isolation.sh   a Caddyfile from before INFRA-9 (the SPA answers)
#   CHECK_PORTS=0 infra/scripts/verify-internal-isolation.sh              skip the TCP connect checks
#
# Needs curl and bash (/dev/tcp, timeout). Read-only: only GET and POST requests to paths that do not exist for the app.
# Exits 1 when any line says FAIL.
set -uo pipefail

HOST="${1:-yoursport.vn}"
EXPECT_INTERNAL_CODE="${EXPECT_INTERNAL_CODE:-404}"
CHECK_PORTS="${CHECK_PORTS:-1}"
BASE="https://$HOST"
fail=0

pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; fail=1; }

# probe <label> <method> <path> <expected code> <kind>
#   kind spa      : 200 and an HTML page (the client's index.html), not JSON
#   kind nothing  : the expected code and no JSON body (a JSON body means the application answered)
#   kind app401   : the expected code from the application's own authentication ("success":false JSON)
probe() {
  local label="$1" method="$2" path="$3" want="$4" kind="$5" body ctype code
  body="$(mktemp)"
  code="$(curl -s -o "$body" -w '%{http_code}' -D "$body.h" --max-time 10 --path-as-is -X "$method" "$BASE$path" || true)"
  ctype="$(grep -i '^content-type:' "$body.h" 2>/dev/null | tr -d '\r' | tr 'A-Z' 'a-z' || true)"
  local ok=0
  case "$kind" in
    spa)     [ "$code" = "$want" ] && echo "$ctype" | grep -q 'text/html' && head -c 200 "$body" | tr 'A-Z' 'a-z' | grep -q '<!doctype html' && ok=1 ;;
    nothing) [ "$code" = "$want" ] && ! echo "$ctype" | grep -q 'json' && ok=1 ;;
    app401)  [ "$code" = "$want" ] && echo "$ctype" | grep -q 'json' && ok=1 ;;
  esac
  if [ "$ok" = 1 ]; then pass "$label  ($method $path -> $code)"; else bad "$label  ($method $path -> $code ${ctype:-no content-type}, wanted $want $kind)"; fi
  rm -f "$body" "$body.h"
}

echo "== $HOST: /internal/** must never reach the application"
if [ "$EXPECT_INTERNAL_CODE" = "200" ]; then ikind=spa; else ikind=nothing; fi
for p in /internal/sync/group-members /internal/sync/friendships /internal/sync/users /internal/ /internal/x \
         /INTERNAL/sync/users /api/../internal/sync/users /ws/../internal/sync/users /images/../internal/sync/users; do
  probe "internal path" GET "$p" "$EXPECT_INTERNAL_CODE" "$ikind"
done
if [ "$EXPECT_INTERNAL_CODE" = "404" ]; then
  probe "internal path, POST" POST /internal/sync/users 404 nothing
fi

echo "== $HOST: paths the proxy must not forward fall through to the client"
for p in /actuator/health /actuator/info /swagger-ui.html /swagger-ui/index.html /api-docs /api-docs/swagger-config /v3/api-docs; do
  probe "not exposed" GET "$p" 200 spa
done

echo "== $HOST: the application's own login gate is still in front of /api/**"
probe "api under /api/internal" GET /api/internal/sync/group-members 401 app401

echo "== the other host"
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://auth.$HOST/internal/sync/users" || true)"
if [ "$code" = "404" ] || [ "$code" = "403" ]; then pass "auth host /internal  (-> $code)"; else bad "auth host /internal  (-> $code, wanted 404 or 403)"; fi

if [ "$CHECK_PORTS" = "1" ]; then
  echo "== no direct port on the public address (TCP connect from here must fail)"
  ip="$(getent hosts "$HOST" 2>/dev/null | awk '{print $1; exit}')"
  [ -n "$ip" ] || ip="$(nslookup "$HOST" 2>/dev/null | awk '/^Address/ && !/#/ {a=$2} END {print a}')"
  if [ -z "$ip" ]; then
    bad "could not resolve $HOST for the port checks (rerun with CHECK_PORTS=0 to skip them)"
  else
    for port in 8080 8090 8081 5432 6379 5672 15672 61613 25 8025; do
      if timeout 3 bash -c "</dev/tcp/$ip/$port" 2>/dev/null; then bad "port $port is OPEN on $ip"; else pass "port $port closed or filtered on $ip"; fi
    done
  fi
fi

echo
if [ "$fail" = 0 ]; then echo "all checks passed"; else echo "SOME CHECKS FAILED"; fi
exit "$fail"
