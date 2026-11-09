#!/usr/bin/env bash
# U27: runs the Liquibase changelog against a real PostGIS and proves V084__drop_roles_and_user_roles.sql does what the ticket says.
# The server ITs run on H2 with Liquibase switched off, so no other test applies a migration.
#
#   infra/scripts/test-drop-roles-tables.sh
#
# Needs Docker. It starts, and removes at the end, one throwaway postgis/postgis:16-3.6 on 127.0.0.1:8096 (DROP_TEST_PG_PORT), password
# "drop-roles-test-1". It never touches the dev Compose stack. The files are applied in the order db.changelog-master.xml includes them,
# with psql (every file is plain SQL), which is what Liquibase does with a plain .sql include except for its bookkeeping tables.
# What it proves: the changelog up to V083 creates `roles` and `user_roles`; V084 removes exactly those two tables, leaves `users`,
# `group_roles` and every other table alone, runs a second time without error, and still applies when the tables hold rows (a
# user with a role), which is what production looks like. What it cannot prove: the server's start-up (Liquibase's checksum
# bookkeeping) or anything on the box.
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$here/../.."
changes="$repo/server/src/main/resources/db/changelog"
PORT="${DROP_TEST_PG_PORT:-8096}"
NAME="sportconnect-drop-roles-test-postgres"
IMAGE="postgis/postgis:16-3.6"
export MSYS_NO_PATHCONV=1

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

pass=0; fail=0
ok() { echo "ok    $1"; pass=$((pass+1)); }
no() { echo "FAIL  $1"; fail=$((fail+1)); }
sql() { docker exec -i "$NAME" psql -U postgres -d drop_test -v ON_ERROR_STOP=1 -tA "$@"; }
tables() { sql -c "select table_name from information_schema.tables where table_schema='public' order by 1"; }

command -v docker >/dev/null || { echo "test-drop-roles-tables: docker is not on PATH" >&2; exit 2; }
docker info >/dev/null 2>&1 || { echo "test-drop-roles-tables: the Docker daemon is not running" >&2; exit 2; }
[ -f "$changes/changes/V084__drop_roles_and_user_roles.sql" ] || { echo "test-drop-roles-tables: V084 not found" >&2; exit 2; }

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:5432" -e POSTGRES_PASSWORD=drop-roles-test-1 -e POSTGRES_DB=drop_test "$IMAGE" >/dev/null \
  || { echo "test-drop-roles-tables: could not start $IMAGE on :$PORT" >&2; exit 2; }
# the image starts a temporary server to create the database, stops it and starts the real one: wait for the second "ready" line
for _ in $(seq 1 90); do
  [ "$(docker logs "$NAME" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && sql -c "select 1" >/dev/null 2>&1 && break
  sleep 1
done

# ---- apply the changelog up to (not including) V084, in the master file's order ----
applied=0
while IFS= read -r file; do
  case "$file" in *V084__*) continue ;; esac
  if ! docker exec -i "$NAME" psql -U postgres -d drop_test -v ON_ERROR_STOP=1 -q < "$changes/../../${file}" >/dev/null 2>"${TMPDIR:-/tmp}/drop-roles-test.err"; then
    no "changelog file $file applies"; cat "${TMPDIR:-/tmp}/drop-roles-test.err" | head -5; exit 1
  fi
  applied=$((applied+1))
done < <(sed -n 's/.*<include file="\([^"]*\)".*/\1/p' "$changes/db.changelog-master.xml")
ok "the $applied changelog files before V084 apply to an empty PostGIS"

before="$(tables)"
echo "$before" | grep -qx roles && ok "roles exists before V084" || no "roles exists before V084"
echo "$before" | grep -qx user_roles && ok "user_roles exists before V084" || no "user_roles exists before V084"

# a user holding a role, as production has (the migration must drop tables that contain rows)
sql -c "insert into users (id, email) values ('11111111-1111-1111-1111-111111111111', 'u27@example.test')" >/dev/null
sql -c "insert into user_roles (user_id, role_id) select '11111111-1111-1111-1111-111111111111', id from roles where name = 'USER'" >/dev/null
[ "$(sql -c 'select count(*) from user_roles')" = "1" ] && ok "a user_roles row exists to be dropped" || no "a user_roles row exists to be dropped"

# ---- V084 ----
if sql < "$changes/changes/V084__drop_roles_and_user_roles.sql" >/dev/null 2>&1; then ok "V084 applies"; else no "V084 applies"; fi
after="$(tables)"
if echo "$after" | grep -qx -e roles -e user_roles; then no "neither roles nor user_roles is left"; else ok "neither roles nor user_roles is left"; fi
case "$after" in *group_roles*) ok "group_roles is untouched" ;; *) no "group_roles is untouched" ;; esac
expected="$(echo "$before" | grep -vx -e roles -e user_roles)"
[ "$after" = "$expected" ] && ok "exactly roles and user_roles went; every other table is unchanged" || no "exactly roles and user_roles went; every other table is unchanged"
[ "$(sql -c "select count(*) from users where email = 'u27@example.test'")" = "1" ] && ok "the user row is still there" || no "the user row is still there"

# ---- idempotent ----
if sql < "$changes/changes/V084__drop_roles_and_user_roles.sql" >/dev/null 2>&1; then ok "V084 runs a second time without error"; else no "V084 runs a second time without error"; fi

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
