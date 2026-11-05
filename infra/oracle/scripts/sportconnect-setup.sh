#!/usr/bin/env bash
# INFRA-19: installs the box's NON-SECRET files from the "box" config image, the way `sportconnect-deploy` installs the
# application images. Run it as `ubuntu` (member of the docker group, sudo for /usr/local/bin):
#
#   sportconnect-setup            pull, stage and show what would change, ask, then install
#   sportconnect-setup --plan     pull and stage, show what would change, install nothing
#   sportconnect-setup --yes      install without the question
#   sportconnect-setup --version  print the checksum of this file (compare with `sha256sum` of the repo copy)
#
# What it does: asks GHCR what `sportconnect-box:prod` points to (a promote workflow moves `prod`, after an approval),
# compares with what was installed last (~/web/.setup-state), pulls the image, copies its files into a staging folder and
# only then touches the box, in this order:
#   1. ~/sportconnect (the infra tree the Compose file mounts from) and ~/web/kc-prod.override.yml, over the old files
#   2. ~/web/Caddyfile, written IN PLACE (it is a single-file bind mount: a replaced file leaves Caddy on the old inode),
#      after `caddy validate`, then `caddy reload`
#   3. /usr/local/bin/sportconnect-deploy
#   4. `docker compose up -d` ONLY when the Compose file or the production override changed (never deletes a volume)
#   5. a check through Caddy, then ~/sportconnect/infra/oracle/scripts/fetch-secrets.sh, last (a broken copy must not lock
#      the box out of its own secrets; the first copy is always by hand)
# Any failure puts back EVERYTHING this run changed, in reverse order, and prints a report. Nothing runs unattended.
#
# It never writes an env file, a password or ~/.kc-admin-pw: the image holds none, and a staged folder that contains an .env
# (not .example), client_secret*.json or a dot-secret is refused before anything changes. It does NOT restart Keycloak when
# the theme, the JARs or the realm file changed (a restart is a short login outage): it says so, and gives the command.
# It does not replace itself: a newer sportconnect-setup in the image is reported, and installed by hand (below).
#
# Hand-copied once per fresh box (they are needed before the first pull): this file, fetch-secrets.sh, box-prepare.sh and
# /etc/sportconnect/secrets.conf. Install (once, and after every change to this file):
#   sudo install -m 0755 sportconnect-setup.sh /usr/local/bin/sportconnect-setup
# Then: eval "$(bash fetch-secrets.sh)"   (logs in to GHCR from the Vault item), and run sportconnect-setup.
#
# Written for INFRA-19; the logic was tried with a stand-in docker command (infra/scripts/test-sportconnect-setup.sh).
# Not run on the box yet.
set -uo pipefail

# Everything below can be overridden from the environment; the defaults are the production box.
IMAGE_BASE="${IMAGE_BASE:-ghcr.io/mr-mittt}"
SC_DIR="${SC_DIR:-$HOME/sportconnect}"
WEB_DIR="${WEB_DIR:-$HOME/web}"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
SUDO="${SUDO-sudo}"                        # SUDO="" when BIN_DIR is writable (tests)
ENV_DIR="${ENV_DIR:-$WEB_DIR}"             # where stack.env is read from; fetch-secrets.sh can put it on tmpfs
STACK_ENV="${STACK_ENV:-$ENV_DIR/stack.env}"
CADDY_NAME="${CADDY_NAME:-sc-caddy}"
CADDY_IMAGE="${CADDY_IMAGE:-caddy:2-alpine}"
CADDY_PROBE_URL="${CADDY_PROBE_URL:-https://yoursport.vn/}"   # empty = skip the final check through Caddy
CADDY_PROBE_HOST="${CADDY_PROBE_HOST:-yoursport.vn}"
BOX_IMAGE="${BOX_IMAGE:-$IMAGE_BASE/sportconnect-box}"
STATE="$WEB_DIR/.setup-state"              # "<digest>|<version>" of the last box image installed
PREV="$WEB_DIR/.setup-prev"                # the files this run replaced, kept until the next run
LOG="$WEB_DIR/setup.log"

mode=ask
for a in "$@"; do
  case "$a" in
    --yes) mode=yes ;;
    --plan) mode=plan ;;
    --version) sha256sum "$0" | cut -d' ' -f1; exit 0 ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option $a (see --help)" >&2; exit 2 ;;
  esac
done

say() { printf '%s\n' "$*"; }
log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG" 2>/dev/null || true; }
die() { say "sportconnect-setup: $*" >&2; log "ABORT $*"; exit 1; }

# ref_info <image ref> -> "<digest>|<version>|<revision>"; fails when the registry has no such image or refuses us.
# Same function as sportconnect-deploy and infra/scripts/promote-check.sh: no jq or node needed on the box.
ref_info() {
  local d cfg v r
  d="$(docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>/dev/null)" || return 1
  [ -n "$d" ] || return 1
  cfg="$(docker buildx imagetools inspect "$1" --format '{{json .Image}}' 2>/dev/null || true)"
  v="$(printf '%s\n' "$cfg" | sed -n 's/.*"org.opencontainers.image.version": *"\([^"]*\)".*/\1/p' | head -1)"
  r="$(printf '%s\n' "$cfg" | sed -n 's/.*"org.opencontainers.image.revision": *"\([^"]*\)".*/\1/p' | head -1)"
  printf '%s|%s|%s\n' "$d" "$v" "$r"
}
is_release() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }
lower() { is_release "$1" && is_release "$2" && [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ]; }

[ -n "${SETUP_LIB_ONLY:-}" ] && return 0 2>/dev/null

# ---- 0. preconditions ---------------------------------------------------------------------------------------------
mkdir -p "$WEB_DIR" "$SC_DIR" 2>/dev/null || true
command -v flock >/dev/null || die "flock is not installed (package util-linux)."
exec 9>"$WEB_DIR/.setup.lock"
flock -n 9 || die "another sportconnect-setup is running (lock: $WEB_DIR/.setup.lock). Wait for it, or check 'ps' if you think it is stuck."
command -v docker >/dev/null || die "docker is not installed or not on PATH (run box-prepare.sh first)."
docker info >/dev/null 2>&1 || die "cannot talk to Docker. Are you the 'ubuntu' user in the docker group (log in again after box-prepare.sh)?"

# ---- 1. what prod points to, what was installed ---------------------------------------------------------------------
if info="$(ref_info "$BOX_IMAGE:prod")"; then
  IFS='|' read -r P_DIGEST P_VERSION P_REV <<<"$info"
else
  die "no ':prod' image for the box config ($BOX_IMAGE). Nothing was changed. Check: (1) Promote has run for the box (GitHub, Actions, Promote, component box), (2) the GHCR login is done on this box (eval \"\$(bash fetch-secrets.sh)\"; the token needs read:packages), (3) the package is linked to the repository."
fi
if [ -f "$STATE" ]; then IFS='|' read -r R_DIGEST R_VERSION < "$STATE"; else R_DIGEST=none; R_VERSION=none; fi
: "${R_DIGEST:=none}" "${R_VERSION:=none}"

say ""
printf '%-8s %-26s %-22s %s\n' component installed prod action
if [ "$R_DIGEST" = "$P_DIGEST" ]; then act=unchanged; else act=INSTALL; fi
printf '%-8s %-26s %-22s %s\n' box "$R_VERSION" "$P_VERSION" "$act"
say ""
if [ "$act" = unchanged ]; then say "the box files are up to date."; log "NOOP up to date"; exit 0; fi
if lower "$P_VERSION" "$R_VERSION"; then
  die "box: prod ($P_VERSION) is LOWER than what is installed ($R_VERSION). Going back to an older version is blocked until INFRA-17. Nothing was changed."
fi

# ---- 2. pull and stage: nothing on the box changes until this has worked ---------------------------------------------------
REF="$BOX_IMAGE@$P_DIGEST"
say "pulling box $P_VERSION ..."
docker pull -q "$REF" >/dev/null 2>&1 || die "could not pull $REF. Nothing was changed. Check the network and the GHCR login (token with read:packages)."
STAGE="$(mktemp -d "$WEB_DIR/.setup-stage.XXXXXX")" || die "could not make a staging folder in $WEB_DIR"
trap 'rm -rf "$STAGE"' EXIT
docker run --rm -e "OWNER_UID=$(id -u)" -e "OWNER_GID=$(id -g)" -v "$STAGE:/out" "$REF" >/dev/null 2>&1 \
  || die "the box image could not write its files into the staging folder. Nothing was changed."

for f in web/Caddyfile web/kc-prod.override.yml bin/sportconnect-deploy sportconnect/infra/docker-compose.dev.yml \
         sportconnect/infra/oracle/scripts/fetch-secrets.sh sportconnect/infra/keycloak/realm/sportconnect-realm.json \
         sportconnect/infra/keycloak/providers/sportconnect-keycloak-extensions.jar sportconnect/infra/keycloak/providers/sportconnect-keycloak-theme.jar; do
  [ -s "$STAGE/$f" ] || die "the box image has no $f (an incomplete image). Nothing was changed."
done
# The image must hold no secret; a staged .env (not .example), client_secret*.json or dot-file is refused.
bad="$(cd "$STAGE" && find . \( -name '*.env' -o -name 'client_secret*' -o -name '.kc-admin-pw' -o -name '.internal-secret' -o -name '.cred-secret' -o -name '.brevo-*' \) -print | head -5)"
[ -z "$bad" ] || die "the box image contains what looks like a secret ($(printf '%s' "$bad" | tr '\n' ' ')). Nothing was changed."
# fetch-secrets.sh is installed last (see the header); take it out of the tree that is copied now.
mkdir -p "$STAGE/deferred"
mv "$STAGE/sportconnect/infra/oracle/scripts/fetch-secrets.sh" "$STAGE/deferred/fetch-secrets.sh"

# ---- 3. what would change ------------------------------------------------------------------------------------------------
differs() { [ ! -e "$2" ] || ! cmp -s "$1" "$2"; }   # differs <staged file> <installed file>: also true when not installed yet
changed_files=(); kc_changed=""; compose_changed=""; caddy_changed=""; bin_changed=""
while IFS= read -r rel; do
  if differs "$STAGE/sportconnect/$rel" "$SC_DIR/$rel"; then
    changed_files+=("sportconnect/$rel")
    case "$rel" in infra/keycloak/*) kc_changed=1 ;; infra/docker-compose.dev.yml) compose_changed=1 ;; esac
  fi
done < <(cd "$STAGE/sportconnect" && find . -type f | sed 's#^\./##' | sort)
if differs "$STAGE/web/kc-prod.override.yml" "$WEB_DIR/kc-prod.override.yml"; then changed_files+=("web/kc-prod.override.yml"); compose_changed=1; fi
if differs "$STAGE/web/Caddyfile" "$WEB_DIR/Caddyfile"; then changed_files+=("web/Caddyfile"); caddy_changed=1; fi
if differs "$STAGE/bin/sportconnect-deploy" "$BIN_DIR/sportconnect-deploy"; then changed_files+=("bin/sportconnect-deploy"); bin_changed=1; fi
fetch_changed=""; differs "$STAGE/deferred/fetch-secrets.sh" "$SC_DIR/infra/oracle/scripts/fetch-secrets.sh" && fetch_changed=1

say "files that differ from the box: ${#changed_files[@]}$( [ -n "$fetch_changed" ] && printf ' (+ fetch-secrets.sh, installed last)' )"
for f in "${changed_files[@]}"; do say "  $f"; done
say "effects:"
[ -n "$caddy_changed" ]  && say "  Caddyfile changes: validated, written in place, then 'caddy reload' (no downtime)"
[ -n "$compose_changed" ] && say "  Compose file or override changes: 'docker compose up -d' (recreates a container whose definition changed; volumes are never deleted)"
[ -n "$bin_changed" ]    && say "  sportconnect-deploy is replaced"
[ -n "$kc_changed" ]     && say "  Keycloak theme, JARs or realm file change on disk: NOT restarted here (a restart is a short login outage)"
[ -z "$caddy_changed$compose_changed$bin_changed$kc_changed" ] && say "  none beyond the copied files"
say ""

# ---- 4. checks that need no change ------------------------------------------------------------------------------------------
if [ -n "$caddy_changed" ] || [ ! -e "$WEB_DIR/Caddyfile" ]; then
  out="$(docker run --rm -v "$STAGE/web/Caddyfile:/etc/caddy/Caddyfile:ro" "$CADDY_IMAGE" caddy validate --config /etc/caddy/Caddyfile 2>&1)"
  case "$out" in *"Valid configuration"*) ;; *) die "the new Caddyfile does not validate, so nothing was changed: $(printf '%s' "$out" | tail -3 | tr '\n' ' ' | cut -c1-300)" ;; esac
fi
if [ -n "$compose_changed" ]; then
  [ -f "$STACK_ENV" ] || die "the Compose files change but $STACK_ENV is missing, so 'compose up -d' could not run. Run: eval \"\$(bash $SC_DIR/infra/oracle/scripts/fetch-secrets.sh)\" first. Nothing was changed."
  docker compose --env-file "$STACK_ENV" -f "$STAGE/sportconnect/infra/docker-compose.dev.yml" -f "$STAGE/web/kc-prod.override.yml" config -q >/dev/null 2>&1 \
    || die "the new Compose files do not pass 'docker compose config' (a variable missing in $STACK_ENV?). Nothing was changed."
fi

[ "$mode" = plan ] && { say "plan only: nothing was installed."; exit 0; }
if [ "$mode" = ask ]; then
  read -r -p "Install box $P_VERSION? [y/N] " ans
  case "$ans" in y|Y|yes) ;; *) say "cancelled, nothing changed."; log "CANCEL"; exit 0 ;; esac
fi

# ---- 5. keep the old files, then install, one step at a time -------------------------------------------------------------------------
log "START box $R_VERSION -> $P_VERSION: ${#changed_files[@]} files"
rm -rf "$PREV"; mkdir -p "$PREV/web" "$PREV/bin"
cp -a "$SC_DIR" "$PREV/sportconnect" 2>/dev/null || mkdir -p "$PREV/sportconnect"
for f in Caddyfile kc-prod.override.yml; do [ -e "$WEB_DIR/$f" ] && cp -a "$WEB_DIR/$f" "$PREV/web/$f"; done
[ -e "$BIN_DIR/sportconnect-deploy" ] && cp -a "$BIN_DIR/sportconnect-deploy" "$PREV/bin/sportconnect-deploy"

steps=(); FAIL_STEP=""; FAIL_REASON=""
caddy_running() { docker inspect --format '{{.State.Running}}' "$CADDY_NAME" 2>/dev/null | grep -q true; }
caddy_reload() { docker exec "$CADDY_NAME" caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1; }
compose_up() { docker compose --env-file "$STACK_ENV" -f "$SC_DIR/infra/docker-compose.dev.yml" -f "$WEB_DIR/kc-prod.override.yml" up -d >/dev/null 2>&1; }

step_files() {
  cp -a "$STAGE/sportconnect/." "$SC_DIR/" || { FAIL_REASON="could not copy the files into $SC_DIR"; return 1; }
  cp -a "$STAGE/web/kc-prod.override.yml" "$WEB_DIR/kc-prod.override.yml" || { FAIL_REASON="could not write $WEB_DIR/kc-prod.override.yml"; return 1; }
}
step_caddyfile() {
  [ -n "$caddy_changed" ] || return 0
  cat "$STAGE/web/Caddyfile" > "$WEB_DIR/Caddyfile" || { FAIL_REASON="could not write $WEB_DIR/Caddyfile"; return 1; }
  if caddy_running; then caddy_reload || { FAIL_REASON="'caddy reload' refused the new Caddyfile"; return 1; }; else say "  ($CADDY_NAME is not running: no reload; start-stack.sh will read the file)"; fi
}
step_bin() {
  [ -n "$bin_changed" ] || return 0
  $SUDO install -m 0755 "$STAGE/bin/sportconnect-deploy" "$BIN_DIR/sportconnect-deploy" || { FAIL_REASON="could not install sportconnect-deploy into $BIN_DIR"; return 1; }
}
step_compose() {
  [ -n "$compose_changed" ] || return 0
  compose_up || { FAIL_REASON="'docker compose up -d' failed"; return 1; }
}
step_probe() {
  [ -n "$CADDY_PROBE_URL" ] && caddy_running || return 0
  curl -fs -o /dev/null --max-time 10 --resolve "$CADDY_PROBE_HOST:443:127.0.0.1" "$CADDY_PROBE_URL" \
    || { FAIL_REASON="the site did not answer through Caddy ($CADDY_PROBE_URL)"; return 1; }
}

for s in files caddyfile bin compose probe; do
  say "installing: $s ..."
  FAIL_REASON=""
  "step_$s"; rc=$?
  steps+=("$s")                  # touched, so it is restored even when this very step failed half way
  if [ $rc -ne 0 ]; then FAIL_STEP="$s"; break; fi
done

# ---- 6. result ---------------------------------------------------------------------------------------------------------------------
if [ -z "$FAIL_STEP" ]; then
  printf '%s|%s\n' "$P_DIGEST" "$P_VERSION" > "$STATE"
  if [ -n "$fetch_changed" ]; then
    cp -a "$STAGE/deferred/fetch-secrets.sh" "$SC_DIR/infra/oracle/scripts/fetch-secrets.sh" && say "installed: fetch-secrets.sh (last)"
  fi
  say "installed: box $P_VERSION"
  [ -n "$kc_changed" ] && say "NOTE: Keycloak files changed on disk. To load them (a short login outage): docker compose --env-file $STACK_ENV -f $SC_DIR/infra/docker-compose.dev.yml -f $WEB_DIR/kc-prod.override.yml restart keycloak"
  staged_self="$SC_DIR/infra/oracle/scripts/sportconnect-setup.sh"
  if [ -f "$staged_self" ] && [ "$(sha256sum "$staged_self" | cut -d' ' -f1)" != "$(sha256sum "$0" | cut -d' ' -f1)" ]; then
    say "NOTE: this box image carries a different sportconnect-setup than the one running. Install it by hand: sudo install -m 0755 $staged_self $BIN_DIR/sportconnect-setup"
  fi
  say "the replaced files are kept in $PREV until the next run."
  log "OK box $R_VERSION -> $P_VERSION"
  exit 0
fi

say ""
say "SETUP FAILED at $FAIL_STEP: $FAIL_REASON"
say "putting back everything this run changed (reverse order) ..."
stuck=()
restore_files() { cp -a "$PREV/sportconnect/." "$SC_DIR/" && { [ ! -e "$PREV/web/kc-prod.override.yml" ] || cp -a "$PREV/web/kc-prod.override.yml" "$WEB_DIR/kc-prod.override.yml"; }; }
restore_caddyfile() {
  [ -e "$PREV/web/Caddyfile" ] || return 0
  cat "$PREV/web/Caddyfile" > "$WEB_DIR/Caddyfile" && { ! caddy_running || caddy_reload; }
}
restore_bin() { [ -e "$PREV/bin/sportconnect-deploy" ] && $SUDO install -m 0755 "$PREV/bin/sportconnect-deploy" "$BIN_DIR/sportconnect-deploy"; }
restore_compose() { compose_up; }
restore_probe() { return 0; }
for ((i=${#steps[@]}-1; i>=0; i--)); do
  s="${steps[$i]}"
  # the Compose step is undone after the files are back, so it runs last: order the loop so files come back before compose
  [ "$s" = compose ] && continue
  "restore_$s" || stuck+=("$s")
done
case " ${steps[*]} " in *" compose "*) [ -n "$compose_changed" ] && { restore_compose || stuck+=(compose); } ;; esac
say ""
say "report:"
say "  steps run in this run : ${steps[*]}"
say "  failed                : $FAIL_STEP"
say "  reason                : $FAIL_REASON"
if [ ${#stuck[@]} -eq 0 ]; then
  say "  state now             : the files this run replaced are back (the state file still names the old version)"
  say "  suggestion            : read the reason above, fix the cause (a new box release if it is in the image), run this command again"
  log "FAILED+RESTORED $FAIL_STEP: $FAIL_REASON"
else
  say "  RESTORE FAILED for    : ${stuck[*]}  (unknown state)"
  say "  suggestion            : the old files are in $PREV (sportconnect/, web/, bin/); copy them back by hand and run: docker exec $CADDY_NAME caddy reload --config /etc/caddy/Caddyfile"
  log "FAILED+RESTORE-FAILED $FAIL_STEP ($FAIL_REASON); stuck: ${stuck[*]}"
fi
exit 1
