#!/usr/bin/env bash
# INFRA-3: prove the backups restore. Restores the newest backup set into SCRATCH databases (never the real ones), checks
# that a key table exists in each and prints its row count, then drops the scratch databases. Run ON THE BOX as `ubuntu`:
#
#   BACKUP_BUCKET=<bucket> bash restore-test.sh            # newest set from the bucket
#   bash restore-test.sh --local                           # newest dumps in $BACKUP_DIR (no bucket, no OCI CLI)
#
# A dump that cannot be restored is the same as no backup, so run this after the first backup and again after any change
# to the databases' extensions or the Postgres image. The Caddy archive is only listed (`tar tzf`), not restored.
#
# Settings (same names as backup-postgres.sh): BACKUP_BUCKET (not needed with --local), OCI_NAMESPACE, BACKUP_DIR,
# PG_CONTAINER, PG_USER, DATABASES.
#
# Key table per database (the check is "restore finished with no error and this table exists"):
#   sportconnect_dev -> users, sportconnect_chat_dev -> sync_state, keycloak_dev -> realm
# An empty table is reported, not failed: a brand new database has no rows.
#
# Written for INFRA-3 on 2026-10-27. Only syntax-checked (`bash -n`) until the first run on the rebuilt box.
set -uo pipefail

LOCAL=0
[ "${1:-}" = "--local" ] && LOCAL=1
BACKUP_DIR=${BACKUP_DIR:-$HOME/backups}
PG_CONTAINER=${PG_CONTAINER:-sportconnect-dev-postgres-1}
PG_USER=${PG_USER:-postgres}
DATABASES=${DATABASES:-"sportconnect_dev sportconnect_chat_dev keycloak_dev"}

key_table() {
  case "$1" in
    sportconnect_dev) echo users ;;
    sportconnect_chat_dev) echo sync_state ;;
    keycloak_dev) echo realm ;;
    *) echo "" ;;
  esac
}

psql_c() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -v ON_ERROR_STOP=1 -tA "$@"; }

work=$(mktemp -d)
scratch=()
cleanup() {
  for s in "${scratch[@]:-}"; do
    [ -n "$s" ] && psql_c -d postgres -c "DROP DATABASE IF EXISTS \"$s\"" > /dev/null 2>&1
  done
  rm -rf "$work"
}
trap cleanup EXIT

if [ "$LOCAL" -eq 1 ]; then
  src=$BACKUP_DIR
  echo "== source: newest local dumps in $src"
else
  : "${BACKUP_BUCKET:?set BACKUP_BUCKET (or use --local)}"
  OCI_ARGS=(--auth instance_principal)
  OCI_NAMESPACE=${OCI_NAMESPACE:-$(oci os ns get "${OCI_ARGS[@]}" --query data --raw-output)}
  latest=$(oci os object list --namespace-name "$OCI_NAMESPACE" --bucket-name "$BACKUP_BUCKET" --all \
             "${OCI_ARGS[@]}" --query 'sort(data[*].name)[-1]' --raw-output) || latest=""
  [ -n "$latest" ] || { echo "no objects in the bucket" >&2; exit 1; }
  prefix=${latest%%/*}
  echo "== source: bucket $BACKUP_BUCKET, set $prefix"
  for db in $DATABASES; do
    oci os object get --namespace-name "$OCI_NAMESPACE" --bucket-name "$BACKUP_BUCKET" \
      --name "$prefix/${db}-${prefix}.dump" --file "$work/${db}-${prefix}.dump" "${OCI_ARGS[@]}" > /dev/null || {
        echo "FAILED: download of $db" >&2; exit 1; }
  done
  oci os object get --namespace-name "$OCI_NAMESPACE" --bucket-name "$BACKUP_BUCKET" \
    --name "$prefix/caddy_data-${prefix}.tgz" --file "$work/caddy_data-${prefix}.tgz" "${OCI_ARGS[@]}" > /dev/null \
    && tar tzf "$work/caddy_data-${prefix}.tgz" > /dev/null \
    && echo "caddy_data archive readable ($(tar tzf "$work/caddy_data-${prefix}.tgz" | wc -l) entries)" \
    || echo "WARNING: caddy_data archive missing or unreadable" >&2
  src=$work
fi

failed=0
for db in $DATABASES; do
  dump=$(ls -1 "$src/${db}-"*.dump 2> /dev/null | sort | tail -1)
  if [ -z "$dump" ]; then echo "FAILED: no dump found for $db" >&2; failed=1; continue; fi
  s="restore_test_${db}"
  scratch+=("$s")
  psql_c -d postgres -c "DROP DATABASE IF EXISTS \"$s\"" > /dev/null
  psql_c -d postgres -c "CREATE DATABASE \"$s\"" > /dev/null
  if ! docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$s" --no-owner --exit-on-error < "$dump" 2> "$work/$db.err"; then
    echo "FAILED: restore of $db ($(basename "$dump")): $(head -3 "$work/$db.err" | tr '\n' ' ')" >&2
    failed=1
    continue
  fi
  tables=$(psql_c -d "$s" -c "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")
  key=$(key_table "$db")
  if [ -n "$key" ] && [ "$(psql_c -d "$s" -c "select to_regclass('public.$key') is not null")" = "t" ]; then
    rows=$(psql_c -d "$s" -c "select count(*) from public.$key")
    echo "ok   $db: $tables tables, $key has $rows rows ($(basename "$dump"))"
  else
    echo "FAILED: $db restored but key table '$key' is missing" >&2
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then echo "== restore test FAILED" >&2; exit 1; fi
echo "== restore test ok (scratch databases dropped)"
