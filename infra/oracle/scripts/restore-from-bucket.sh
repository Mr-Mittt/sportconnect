#!/usr/bin/env bash
# INFRA-12: restore the newest backup set from the Object Storage bucket into the REAL databases of this box (guide section 9
# step 3 and section 17, the cutover). Run ON THE BOX as `ubuntu`. It replaces `sportconnect_dev`, `sportconnect_chat_dev`
# and `keycloak_dev`; run it only on the box that is about to take over.
#
#   EXPECT_SET=20261102T143000Z bash restore-from-bucket.sh
#
# What it does: reads the newest set (instance principal, no key on the box); stops the containers that use the databases
# (STOP); downloads the dumps into a mode-700 temp dir that is removed on exit; per database DROP DATABASE ... WITH (FORCE),
# CREATE DATABASE, pg_restore --no-owner --exit-on-error; optionally restores the `caddy_data` volume; starts Keycloak and
# waits for the realm; starts the other containers again. It does NOT run the post-restore Keycloak scripts (guide section 9
# step 4) and does NOT install the backup timer.
#
# Settings (environment): EXPECT_SET  the set (stamp) you expect to be the newest; the script stops before changing anything
#                         if the newest is a different one (required: a restore of a stale or foreign set would be silent);
#                         RESTORE_CADDY=1 also restore caddy_data (default 0: a box that already has certificates keeps them);
#                         BACKUP_BUCKET (default sportconnect-backups), PG_CONTAINER (default sportconnect-dev-postgres-1),
#                         KC_CONTAINER (default sportconnect-dev-keycloak-1), STOP (default "sc-server sc-chat").
#
# Written from the commands run on the A1 box on 2026-11-02 (INFRA-12 A1 migration log, row 13: an ad-hoc script piped to
# `bash -s`). This file, with EXPECT_SET and the stop/start of the application containers, has not been run yet.
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
: "${EXPECT_SET:?set EXPECT_SET to the stamp of the backup set you expect, e.g. 20261102T143000Z}"
BUCKET="${BACKUP_BUCKET:-sportconnect-backups}"
PG="${PG_CONTAINER:-sportconnect-dev-postgres-1}"
KC="${KC_CONTAINER:-sportconnect-dev-keycloak-1}"
STOP="${STOP:-sc-server sc-chat}"
RESTORE_CADDY="${RESTORE_CADDY:-0}"
DATABASES="sportconnect_dev sportconnect_chat_dev keycloak_dev"

umask 077
mkdir -p "$HOME/bk"
work="$(mktemp -d "$HOME/bk/restore.XXXXXX")"
trap 'rm -rf "$work"; echo "downloaded files removed"' EXIT

ns="$(oci os ns get --auth instance_principal --query data --raw-output)" || { echo "cannot read the namespace (dynamic group?)" >&2; exit 1; }
latest="$(oci os object list --namespace-name "$ns" --bucket-name "$BUCKET" --all --auth instance_principal \
            --query 'sort(data[*].name)[-1]' --raw-output)" || latest=""
[ -n "$latest" ] || { echo "no objects in the bucket" >&2; exit 1; }
prefix="${latest%%/*}"
echo "== newest set in the bucket: $prefix"
[ "$prefix" = "$EXPECT_SET" ] || { echo "REFUSED: the newest set is $prefix, expected $EXPECT_SET. Nothing was changed." >&2; exit 1; }

get() { oci os object get --namespace-name "$ns" --bucket-name "$BUCKET" --name "$prefix/$1" --file "$work/$2" --auth instance_principal > /dev/null; }
for db in $DATABASES; do get "${db}-${prefix}.dump" "${db}.dump" || { echo "FAILED: download of $db" >&2; exit 1; }; done
if [ "$RESTORE_CADDY" = 1 ]; then get "caddy_data-${prefix}.tgz" caddy_data.tgz || { echo "FAILED: download of caddy_data" >&2; exit 1; }; fi

echo "== stop: $STOP $KC"
# shellcheck disable=SC2086
docker stop $STOP "$KC" > /dev/null 2>&1 || true

for db in $DATABASES; do
  echo "== restore $db"
  docker exec "$PG" psql -U postgres -v ON_ERROR_STOP=1 -d postgres \
    -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" -c "CREATE DATABASE \"$db\"" > /dev/null || { echo "FAILED: create $db" >&2; exit 1; }
  docker exec -i "$PG" pg_restore -U postgres -d "$db" --no-owner --exit-on-error < "$work/${db}.dump" \
    || { echo "FAILED: restore of $db (the databases are in an unknown state; stop and read the log)" >&2; exit 1; }
done

if [ "$RESTORE_CADDY" = 1 ]; then
  echo "== restore caddy_data"
  docker volume create caddy_data > /dev/null
  docker run --rm -v caddy_data:/data -v "$work:/in:ro" --entrypoint tar caddy:2-alpine xzf /in/caddy_data.tgz -C /data \
    || { echo "FAILED: caddy_data" >&2; exit 1; }
fi

echo "== start keycloak"
docker start "$KC" > /dev/null
for i in $(seq 1 60); do
  curl -fs -o /dev/null http://127.0.0.1:8081/realms/sportconnect/.well-known/openid-configuration && { echo "keycloak realm up after about $((i * 3)) s"; break; }
  sleep 3
done
echo "== start: $STOP"
# shellcheck disable=SC2086
docker start $STOP > /dev/null 2>&1 || true
echo "== done: set $prefix restored. Next: the post-restore Keycloak scripts (guide section 9 step 4), then the checks."
