#!/usr/bin/env bash
# INFRA-3: nightly backup of the three databases and the Caddy certificate volume to an OCI Object Storage bucket.
# Run ON THE BOX as `ubuntu` (member of the docker group) by the systemd timer in infra/oracle/systemd/, or by hand:
#
#   BACKUP_BUCKET=<bucket> bash backup-postgres.sh
#
# What it does, per run (one timestamp, UTC, for the whole set):
#   1. `pg_dump -Fc` of each database inside the Postgres container (same server version as the data), written to
#      $BACKUP_DIR, then checked with `pg_restore -l` so a truncated or empty dump fails here, not at restore time.
#   2. A tar.gz of the `caddy_data` volume (Let's Encrypt account and certificates: re-issuing is rate-limited).
#   3. Uploads every file to the bucket as <timestamp>/<file>, using the instance principal (no stored credential).
#   4. Deletes local files older than LOCAL_KEEP_DAYS. Retention in the bucket (7 days) is a bucket lifecycle rule,
#      not this script: see the runbook.
# A failure in one database does not stop the others; the script exits non-zero at the end if anything failed, so
# `systemctl status sportconnect-backup` shows it.
#
# The dumps hold user data and the certificate archive holds private keys: the bucket must stay private, and the files
# here are created with umask 077. Not encrypted by us (INFRA-14 decides client-side encryption).
#
# Settings (environment; the timer reads them from /etc/sportconnect/backup.env):
#   BACKUP_BUCKET     required, name of the Object Storage bucket
#   OCI_NAMESPACE     optional, the Object Storage namespace (looked up when unset)
#   BACKUP_DIR        default $HOME/backups
#   PG_CONTAINER      default sportconnect-dev-postgres-1
#   PG_USER           default postgres
#   DATABASES         default "sportconnect_dev sportconnect_chat_dev keycloak_dev"
#   CADDY_IMAGE       default caddy:2-alpine (already on the box; only its tar is used)
#   LOCAL_KEEP_DAYS   default 2
#
# Written for INFRA-3 on 2026-10-27. Only syntax-checked (`bash -n`) until the first run on the rebuilt box.
set -uo pipefail

: "${BACKUP_BUCKET:?set BACKUP_BUCKET to the Object Storage bucket name}"
BACKUP_DIR=${BACKUP_DIR:-$HOME/backups}
PG_CONTAINER=${PG_CONTAINER:-sportconnect-dev-postgres-1}
PG_USER=${PG_USER:-postgres}
DATABASES=${DATABASES:-"sportconnect_dev sportconnect_chat_dev keycloak_dev"}
CADDY_IMAGE=${CADDY_IMAGE:-caddy:2-alpine}
LOCAL_KEEP_DAYS=${LOCAL_KEEP_DAYS:-2}

OCI_ARGS=(--auth instance_principal)
if [ -z "${OCI_NAMESPACE:-}" ]; then
  OCI_NAMESPACE=$(oci os ns get "${OCI_ARGS[@]}" --query data --raw-output) || {
    echo "cannot read the Object Storage namespace (instance principal or policy missing?)" >&2; exit 1; }
fi

umask 077
mkdir -p "$BACKUP_DIR"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
failed=0
files=()

echo "== backup $stamp -> bucket $BACKUP_BUCKET (namespace $OCI_NAMESPACE)"

for db in $DATABASES; do
  out="$BACKUP_DIR/${db}-${stamp}.dump"
  if docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -d "$db" -Fc > "$out" \
     && docker exec -i "$PG_CONTAINER" pg_restore -l < "$out" > /dev/null; then
    echo "dumped $db ($(du -h "$out" | cut -f1))"
    files+=("$out")
  else
    echo "FAILED: dump of $db" >&2
    rm -f "$out"
    failed=1
  fi
done

caddy="$BACKUP_DIR/caddy_data-${stamp}.tgz"
if docker run --rm --entrypoint tar -v caddy_data:/data:ro "$CADDY_IMAGE" czf - -C /data . > "$caddy" \
   && [ -s "$caddy" ] && tar tzf "$caddy" > /dev/null; then
  echo "archived caddy_data ($(du -h "$caddy" | cut -f1))"
  files+=("$caddy")
else
  echo "FAILED: archive of the caddy_data volume" >&2
  rm -f "$caddy"
  failed=1
fi

for f in "${files[@]}"; do
  name="${stamp}/$(basename "$f")"
  if oci os object put --namespace-name "$OCI_NAMESPACE" --bucket-name "$BACKUP_BUCKET" \
       --file "$f" --name "$name" --force "${OCI_ARGS[@]}" > /dev/null \
     && oci os object head --namespace-name "$OCI_NAMESPACE" --bucket-name "$BACKUP_BUCKET" \
       --name "$name" "${OCI_ARGS[@]}" > /dev/null; then
    echo "uploaded $name"
  else
    echo "FAILED: upload of $name" >&2
    failed=1
  fi
done

find "$BACKUP_DIR" -type f \( -name '*.dump' -o -name '*.tgz' \) -mtime +"$LOCAL_KEEP_DAYS" -delete

if [ "$failed" -ne 0 ]; then
  echo "== backup $stamp finished WITH FAILURES" >&2
  exit 1
fi
echo "== backup $stamp ok (${#files[@]} files)"
