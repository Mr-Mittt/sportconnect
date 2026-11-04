#!/usr/bin/env bash
# INFRA-14: fetch the box's secrets from their store and write them as env files into a memory-backed folder, then log in to GHCR.
# Run ON THE BOX as `ubuntu`, before start-stack.sh, sportconnect-deploy, rotate-credentials.sh or apply-realm-production.sh,
# and again after any rotation. The files live in tmpfs (/dev/shm), so they are gone after a reboot or `--clean`.
#
#   eval "$(bash fetch-secrets.sh)"          writes the files, logs in to GHCR, prints `export ENV_DIR=...` for the scripts above
#   bash fetch-secrets.sh --clean            removes the folder
#
# Two stores, same files (pick one with SECRETS_BACKEND, default vault):
#   vault  OCI Vault, read with the box's instance principal (no key on the box). Needs VAULT_OCID, and an IAM policy that lets
#          the dynamic group read secret bundles of that vault. One secret per file, base64 of the file's content.
#   sops   files <SOPS_DIR>/<name>.sops (default ~/secrets), made with `sops -e --input-type binary --output-type json --age <key> FILE`
#          and decrypted with `sops -d --input-type json --output-type binary`; the age key is SOPS_AGE_KEY_FILE
#          (default ~/.config/sops/age/keys.txt, mode 600). Use it when the Vault is not free or too fiddly.
#
# Items (secret names carry the prefix PREFIX, default sportconnect-prod-):
#   server-env  -> $ENV_DIR/server.env      chat-env -> $ENV_DIR/chat.env      stack-env -> $ENV_DIR/stack.env
#   kc-admin-pw -> $ENV_DIR/kc-admin-pw     (the Keycloak admin password, one line)
#   ghcr-token  -> piped to `docker login ghcr.io -u $GHCR_USER --password-stdin`; skipped when GHCR_USER is unset or the item is
#                  absent. The token is a classic PAT with only read:packages; it expires (infra/oracle/SECRETS.md has the date).
#
# Nothing secret is printed or put on a command line; files are mode 600 in a mode 700 folder. Settings: ENV_DIR
# (/dev/shm/sportconnect), PREFIX, SECRETS_BACKEND, VAULT_OCID, SOPS_DIR, GHCR_USER. Non-secret settings may sit in
# /etc/sportconnect/secrets.conf (KEY=value lines, read when present).
#
# Written for INFRA-14. Run against the real OCI Vault on the A1 box on 2026-11-03 (a bug in the Vault branch was found and fixed then); the SOPS branch has only been run with a stand-in `sops`.
set -uo pipefail

[ -f /etc/sportconnect/secrets.conf ] && while IFS='=' read -r k v; do
  case "$k" in ENV_DIR|PREFIX|SECRETS_BACKEND|VAULT_OCID|SOPS_DIR|GHCR_USER) [ -n "${!k:-}" ] || export "$k=$v" ;; esac
done < /etc/sportconnect/secrets.conf

ENV_DIR="${ENV_DIR:-/dev/shm/sportconnect}"
PREFIX="${PREFIX:-sportconnect-prod-}"
BACKEND="${SECRETS_BACKEND:-vault}"
SOPS_DIR="${SOPS_DIR:-$HOME/secrets}"
export PATH="$HOME/.local/bin:$PATH"

die() { echo "fetch-secrets: $*" >&2; exit 1; }

if [ "${1:-}" = "--clean" ]; then
  [ -d "$ENV_DIR" ] && { find "$ENV_DIR" -type f -exec shred -u {} + 2>/dev/null; rm -rf "$ENV_DIR"; }
  echo "fetch-secrets: $ENV_DIR removed" >&2; exit 0
fi

# get <item> -> the content on stdout; non-zero when the item is missing
case "$BACKEND" in
  vault)
    : "${VAULT_OCID:?set VAULT_OCID (the OCID of the vault) in the environment or /etc/sportconnect/secrets.conf}"
    get() {
      oci secrets secret-bundle get-secret-bundle-by-name --secret-name "${PREFIX}$1" --vault-id "$VAULT_OCID" \
        --auth instance_principal --query 'data."secret-bundle-content".content' --raw-output 2>/dev/null | base64 -d
      local rc=("${PIPESTATUS[@]}")   # copied at once: the next `[` would reset PIPESTATUS (and `set -u` then stops the script)
      [ "${rc[0]}" = 0 ] && [ "${rc[1]}" = 0 ]
    }
    ;;
  sops)
    command -v sops >/dev/null || die "sops is not installed"
    export SOPS_AGE_KEY_FILE="${SOPS_AGE_KEY_FILE:-$HOME/.config/sops/age/keys.txt}"
    get() { [ -f "$SOPS_DIR/$1.sops" ] && sops -d --input-type json --output-type binary "$SOPS_DIR/$1.sops"; }
    ;;
  *) die "SECRETS_BACKEND must be vault or sops" ;;
esac

umask 077
mkdir -p "$ENV_DIR" && chmod 700 "$ENV_DIR" || die "cannot create $ENV_DIR"
fstype="$(df --output=fstype "$ENV_DIR" | tail -n 1 | tr -d '[:space:]')"
case "$fstype" in tmpfs|ramfs) ;; *) die "$ENV_DIR is on $fstype, not tmpfs; refusing to write secrets to disk" ;; esac

fetch_file() { # <item> <file name>
  local tmp="$ENV_DIR/.$2.tmp"
  if get "$1" > "$tmp" && [ -s "$tmp" ]; then mv -f "$tmp" "$ENV_DIR/$2"; chmod 600 "$ENV_DIR/$2"; echo "fetch-secrets: $2 written" >&2
  else rm -f "$tmp"; die "item ${PREFIX}$1 could not be read from the $BACKEND store"; fi
}
for pair in "server-env server.env" "chat-env chat.env" "stack-env stack.env" "kc-admin-pw kc-admin-pw"; do
  # shellcheck disable=SC2086
  fetch_file $pair
done

if [ -n "${GHCR_USER:-}" ]; then
  if get ghcr-token | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null 2>&1; then echo "fetch-secrets: docker login ghcr.io ok" >&2
  else echo "fetch-secrets: GHCR login skipped or failed (item ${PREFIX}ghcr-token, user $GHCR_USER); the existing login is kept" >&2; fi
fi

echo "export ENV_DIR=$ENV_DIR"
