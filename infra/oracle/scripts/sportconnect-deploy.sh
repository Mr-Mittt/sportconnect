#!/usr/bin/env bash
# INFRA-6: the deploy command of the Oracle box. Run it as `ubuntu` (member of the docker group), no sudo:
#
#   sportconnect-deploy            show what would change, ask, then deploy
#   sportconnect-deploy --plan     only show the plan
#   sportconnect-deploy --yes      deploy without the question
#   sportconnect-deploy --version  print the checksum of this file (compare with `sha256sum` of the repo copy)
#
# What it does: asks GHCR what `:prod` points to for the server, chat and client images (a promote workflow moves `prod`,
# after an approval), compares with what runs, and deploys the differences in this order: server, chat, client files.
# Any failure puts back EVERYTHING this run changed, in reverse order, and prints a report. Nothing runs unattended;
# there is no timer. Install (once, from the repo files copied to the box):
#   sudo install -m 0755 infra/oracle/scripts/sportconnect-deploy.sh /usr/local/bin/sportconnect-deploy
# Login (once, a classic PAT with only read:packages, read from stdin so it never lands in a command line or history):
#   docker login ghcr.io -u <github user> --password-stdin
#
# The migrations of the server run inside it at start-up (Liquibase); chat's will too (CHAT-22). A container put back
# after a failure does not undo a migration the new version already ran (INFRA-17).
# NOT run on the box yet (INFRA-6 conditional). The decisions are tested locally against a throwaway registry.
set -uo pipefail

# Everything below can be overridden from the environment; the defaults are the production box.
IMAGE_BASE="${IMAGE_BASE:-ghcr.io/mr-mittt}"
WEB_DIR="${WEB_DIR:-$HOME/web}"
NET="${NET:-sportconnect-dev_default}"
NAME_PREFIX="${NAME_PREFIX:-sc}"
SERVER_WAIT="${SERVER_WAIT:-300}"   # seconds; the HEALTHCHECK start period alone is 120 s (Liquibase on a cold database)
CHAT_WAIT="${CHAT_WAIT:-60}"
CADDY_PROBE_URL="${CADDY_PROBE_URL:-https://yoursport.vn/}"   # empty = skip the final check through Caddy
CADDY_PROBE_HOST="${CADDY_PROBE_HOST:-yoursport.vn}"
LOG="$WEB_DIR/deploy.log"
COMPONENTS=(server chat client)

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

say()  { printf '%s\n' "$*"; }
log()  { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >> "$LOG" 2>/dev/null || true; }
die()  { say "sportconnect-deploy: $*" >&2; log "ABORT $*"; exit 1; }

# ref_info <image ref> -> "<digest>|<version>|<revision>"; fails when the registry has no such image or refuses us.
# Same function as infra/scripts/promote-check.sh: no jq or node needed on the box.
ref_info() {
  local d cfg v r
  d="$(docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>/dev/null)" || return 1
  [ -n "$d" ] || return 1
  cfg="$(docker buildx imagetools inspect "$1" --format '{{json .Image}}' 2>/dev/null || true)"
  v="$(printf '%s\n' "$cfg" | sed -n 's/.*"org.opencontainers.image.version": *"\([^"]*\)".*/\1/p' | head -1)"
  r="$(printf '%s\n' "$cfg" | sed -n 's/.*"org.opencontainers.image.revision": *"\([^"]*\)".*/\1/p' | head -1)"
  printf '%s|%s|%s\n' "$d" "$v" "$r"
}

cname()  { printf '%s-%s' "$NAME_PREFIX" "$1"; }          # sc-server, sc-chat
imgref() { printf '%s/sportconnect-%s' "$IMAGE_BASE" "$1"; }
state_file() { printf '%s/.deployed-%s' "$WEB_DIR" "$1"; }  # client only: "<digest>|<version>"

# running_info <component> -> "<digest>|<version>" ("unknown" parts when it cannot tell)
running_info() {
  local c="$1" cn d v img
  if [ "$c" = client ]; then
    if [ -f "$(state_file client)" ]; then cat "$(state_file client)"; else printf 'none|none\n'; fi
    return 0
  fi
  cn="$(cname "$c")"
  if ! docker inspect "$cn" >/dev/null 2>&1; then printf 'none|none\n'; return 0; fi
  v="$(docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' "$cn" 2>/dev/null)"
  img="$(docker inspect --format '{{.Image}}' "$cn" 2>/dev/null)"
  d="$(docker image inspect --format '{{ if .RepoDigests }}{{ index .RepoDigests 0 }}{{ end }}' "$img" 2>/dev/null | sed 's/.*@//')"
  printf '%s|%s\n' "${d:-unknown}" "${v:-unknown (local build)}"
}

# is_release <v> / lower <a> <b>: both plain X.Y.Z and a < b
is_release() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }
lower() { is_release "$1" && is_release "$2" && [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -1)" = "$1" ]; }

[ -n "${DEPLOY_LIB_ONLY:-}" ] && return 0 2>/dev/null

# ---- 0. preconditions ---------------------------------------------------------------------------------------------
mkdir -p "$WEB_DIR" 2>/dev/null || true
command -v flock >/dev/null || die "flock is not installed (package util-linux)."
exec 9>"$WEB_DIR/.deploy.lock"
flock -n 9 || die "another sportconnect-deploy is running (lock: $WEB_DIR/.deploy.lock). Wait for it, or check 'ps' if you think it is stuck."
command -v docker >/dev/null || die "docker is not installed or not on PATH."
docker info >/dev/null 2>&1 || die "cannot talk to Docker. Are you the 'ubuntu' user in the docker group (log in again after box-prepare.sh)?"
missing=()
[ -f "$WEB_DIR/server.env" ] || missing+=("$WEB_DIR/server.env")
[ -f "$WEB_DIR/chat.env" ]   || missing+=("$WEB_DIR/chat.env")
[ -d "$WEB_DIR/dist" ]       || missing+=("$WEB_DIR/dist (the folder Caddy serves; create it with mkdir)")
docker network inspect "$NET" >/dev/null 2>&1 || missing+=("the Docker network $NET (start the stack first: start-stack.sh)")
if [ ${#missing[@]} -gt 0 ]; then
  die "first-time setup is not complete, missing: $(printf '%s; ' "${missing[@]}")see the deployment guide, 'Deploying'."
fi

# ---- 1. what prod points to, what runs ----------------------------------------------------------------------------
declare -A P_DIGEST P_VERSION P_REV R_DIGEST R_VERSION
noprod=()
for c in "${COMPONENTS[@]}"; do
  if info="$(ref_info "$(imgref "$c"):prod")"; then
    IFS='|' read -r P_DIGEST[$c] P_VERSION[$c] P_REV[$c] <<<"$info"
  else
    noprod+=("$c")
  fi
done
if [ ${#noprod[@]} -gt 0 ]; then
  die "no ':prod' image for: ${noprod[*]}. Nothing was changed. Check: (1) Promote has run for each of them (GitHub, Actions, Promote), (2) 'docker login ghcr.io' is done on this box and the token has read:packages, (3) the packages are linked to the repository."
fi
for c in "${COMPONENTS[@]}"; do
  IFS='|' read -r R_DIGEST[$c] R_VERSION[$c] <<<"$(running_info "$c")"
done

changed=()
say ""
printf '%-8s %-26s %-22s %s\n' component running prod action
for c in "${COMPONENTS[@]}"; do
  act="unchanged"
  if [ "${R_DIGEST[$c]}" != "${P_DIGEST[$c]}" ]; then act="DEPLOY"; changed+=("$c"); fi
  printf '%-8s %-26s %-22s %s\n' "$c" "${R_VERSION[$c]}" "${P_VERSION[$c]}" "$act"
done
say ""

if [ ${#changed[@]} -eq 0 ]; then say "everything is up to date."; log "NOOP up to date"; exit 0; fi

for c in "${changed[@]}"; do
  if lower "${P_VERSION[$c]}" "${R_VERSION[$c]}"; then
    die "$c: prod (${P_VERSION[$c]}) is LOWER than what runs (${R_VERSION[$c]}). Going back to an older version is blocked until INFRA-17 (the database schema may not fit). Nothing was changed."
  fi
done

[ "$mode" = plan ] && exit 0
if [ "$mode" = ask ]; then
  read -r -p "Deploy ${changed[*]}? [y/N] " ans
  case "$ans" in y|Y|yes) ;; *) say "cancelled, nothing changed."; log "CANCEL"; exit 0 ;; esac
fi

# ---- 2. pull everything first: a failed pull must not touch a running container ------------------------------------
log "START deploy ${changed[*]}: $(for c in "${changed[@]}"; do printf '%s %s -> %s; ' "$c" "${R_VERSION[$c]}" "${P_VERSION[$c]}"; done)"
for c in "${changed[@]}"; do
  say "pulling $c ${P_VERSION[$c]} ..."
  docker pull -q "$(imgref "$c")@${P_DIGEST[$c]}" >/dev/null 2>&1 \
    || die "could not pull $(imgref "$c")@${P_DIGEST[$c]}. Nothing was changed. Check the network and 'docker login ghcr.io' (token with read:packages)."
done

# ---- 3. deploy one by one; remember what changed so a failure can put it all back ----------------------------------
done_list=()
FAIL_COMPONENT=""; FAIL_REASON=""

wait_server_healthy() {
  local cn="$1" waited=0 st run
  while [ "$waited" -lt "$SERVER_WAIT" ]; do
    run="$(docker inspect --format '{{.State.Running}}' "$cn" 2>/dev/null)"
    [ "$run" = true ] || { FAIL_REASON="the container stopped; last log lines: $(docker logs --tail 5 "$cn" 2>&1 | tr '\n' ' ' | cut -c1-400)"; return 1; }
    st="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cn" 2>/dev/null)"
    [ "$st" = healthy ] && return 0
    sleep 3; waited=$((waited + 3))
  done
  FAIL_REASON="not healthy after ${SERVER_WAIT}s (status: ${st:-none}); last log lines: $(docker logs --tail 5 "$cn" 2>&1 | tr '\n' ' ' | cut -c1-400)"
  return 1
}
# chat_probe <container>: GET /healthz from the host, at the container's address on the network (the chat image is distroless,
# it has no shell or curl to probe from inside). CHAT_PROBE_VIA_EXEC=1 is a test hook for a Docker whose host cannot reach
# container addresses (Docker Desktop on Windows) and a stand-in image that has wget; the real box does not use it.
chat_probe() {
  local ip
  if [ -n "${CHAT_PROBE_VIA_EXEC:-}" ]; then docker exec "$1" wget -q -O /dev/null http://127.0.0.1:8090/healthz 2>/dev/null; return; fi
  ip="$(docker inspect --format "{{(index .NetworkSettings.Networks \"$NET\").IPAddress}}" "$1" 2>/dev/null)"
  [ -n "$ip" ] && curl -fs -o /dev/null --max-time 3 "http://$ip:8090/healthz"
}
wait_chat_healthy() {
  local cn="$1" waited=0 run ip
  while [ "$waited" -lt "$CHAT_WAIT" ]; do
    run="$(docker inspect --format '{{.State.Running}}' "$cn" 2>/dev/null)"
    [ "$run" = true ] || { FAIL_REASON="the container stopped (chat exits when the server is not ready at its start-up sync); last log lines: $(docker logs --tail 5 "$cn" 2>&1 | tr '\n' ' ' | cut -c1-400)"; return 1; }
    if chat_probe "$cn"; then return 0; fi
    sleep 2; waited=$((waited + 2))
  done
  FAIL_REASON="GET /healthz did not answer within ${CHAT_WAIT}s; last log lines: $(docker logs --tail 5 "$cn" 2>&1 | tr '\n' ' ' | cut -c1-400)"
  return 1
}

# replace_container <component>: stop the old one and keep it as <name>-prev, start the new one from the pulled digest
replace_container() {
  local c="$1" cn ref flags
  cn="$(cname "$c")"; ref="$(imgref "$c")@${P_DIGEST[$c]}"
  docker rm -f "$cn-prev" >/dev/null 2>&1 || true
  if docker inspect "$cn" >/dev/null 2>&1; then
    docker stop "$cn" >/dev/null 2>&1; docker rename "$cn" "$cn-prev" || { FAIL_REASON="could not rename the running $cn"; return 1; }
  fi
  flags=(--cap-drop ALL --security-opt no-new-privileges --read-only)
  [ "$c" = server ] && flags+=(--tmpfs /tmp -v "$cn-logs:/var/log/sportconnect")
  docker run -d --name "$cn" --restart unless-stopped --network "$NET" --env-file "$WEB_DIR/$c.env" "${flags[@]}" "$ref" >/dev/null \
    || { FAIL_REASON="docker run failed for $ref"; return 1; }
  if [ "$c" = server ]; then wait_server_healthy "$cn"; else wait_chat_healthy "$cn"; fi
}

restore_container() {
  local c="$1" cn; cn="$(cname "$c")"
  docker rm -f "$cn" >/dev/null 2>&1 || true
  if docker inspect "$cn-prev" >/dev/null 2>&1; then
    docker rename "$cn-prev" "$cn" && docker start "$cn" >/dev/null || return 1
  fi
}

deploy_client() {
  rm -rf "$WEB_DIR/dist.prev" && cp -a "$WEB_DIR/dist" "$WEB_DIR/dist.prev" || { FAIL_REASON="could not copy the current files aside"; return 1; }
  docker run --rm -v "$WEB_DIR/dist:/srv" "$(imgref client)@${P_DIGEST[client]}" >/dev/null 2>&1 \
    || { FAIL_REASON="the client image could not write the files into $WEB_DIR/dist"; return 1; }
  [ -f "$WEB_DIR/dist/index.html" ] || { FAIL_REASON="$WEB_DIR/dist/index.html is missing after the copy"; return 1; }
  if [ -n "$CADDY_PROBE_URL" ] && docker inspect --format '{{.State.Running}}' "$(cname caddy)" 2>/dev/null | grep -q true; then
    curl -fs -o /dev/null --max-time 10 --resolve "$CADDY_PROBE_HOST:443:127.0.0.1" "$CADDY_PROBE_URL" \
      || { FAIL_REASON="the site did not answer through Caddy ($CADDY_PROBE_URL)"; return 1; }
  fi
}
restore_client() {
  [ -d "$WEB_DIR/dist.prev" ] || return 1
  rm -rf "${WEB_DIR:?}/dist/"* "$WEB_DIR"/dist/.[!.]* 2>/dev/null; cp -a "$WEB_DIR/dist.prev/." "$WEB_DIR/dist/"
}

for c in "${COMPONENTS[@]}"; do
  case " ${changed[*]} " in *" $c "*) ;; *) continue ;; esac
  say "deploying $c ${R_VERSION[$c]} -> ${P_VERSION[$c]} ..."
  FAIL_REASON=""
  if [ "$c" = client ]; then deploy_client; else replace_container "$c"; fi
  rc=$?
  done_list+=("$c")        # touched, so it is restored even when this very step failed half way
  if [ $rc -ne 0 ]; then FAIL_COMPONENT="$c"; break; fi
done

# ---- 4. result ------------------------------------------------------------------------------------------------------
if [ -z "$FAIL_COMPONENT" ]; then
  for c in "${done_list[@]}"; do
    [ "$c" = client ] && printf '%s|%s\n' "${P_DIGEST[client]}" "${P_VERSION[client]}" > "$(state_file client)" || docker rm -f "$(cname "$c")-prev" >/dev/null 2>&1
  done
  rm -rf "$WEB_DIR/dist.prev"
  say "deployed: $(for c in "${done_list[@]}"; do printf '%s %s; ' "$c" "${P_VERSION[$c]}"; done)"
  log "OK $(for c in "${done_list[@]}"; do printf '%s %s -> %s; ' "$c" "${R_VERSION[$c]}" "${P_VERSION[$c]}"; done)"
  exit 0
fi

say ""
say "DEPLOY FAILED at $FAIL_COMPONENT: $FAIL_REASON"
say "putting back everything this run changed (reverse order) ..."
stuck=()
for ((i=${#done_list[@]}-1; i>=0; i--)); do
  c="${done_list[$i]}"
  if [ "$c" = client ]; then restore_client; else restore_container "$c"; fi || stuck+=("$c")
done
say ""
say "report:"
say "  changed in this run : ${done_list[*]}"
say "  failed              : $FAIL_COMPONENT"
say "  reason              : $FAIL_REASON"
if [ ${#stuck[@]} -eq 0 ]; then
  say "  state now           : every component is back on the version it had before this run"
  hint="the reason above"; [ "$FAIL_COMPONENT" = client ] || hint="the reason above and the logs of the failed container (it was removed; the last lines are in the reason, or run the image by hand)"
  say "  suggestion          : read $hint, fix the cause, promote a fixed version, run this command again"
  log "FAILED+RESTORED $FAIL_COMPONENT: $FAIL_REASON"
else
  say "  RESTORE FAILED for  : ${stuck[*]}  (unknown state)"
  say "  suggestion          : check 'docker ps -a' for ${NAME_PREFIX}-*-prev containers; to bring one back: docker rm -f <name>; docker rename <name>-prev <name>; docker start <name>. For the client files: cp -a $WEB_DIR/dist.prev/. $WEB_DIR/dist/"
  log "FAILED+RESTORE-FAILED $FAIL_COMPONENT ($FAIL_REASON); stuck: ${stuck[*]}"
fi
exit 1
