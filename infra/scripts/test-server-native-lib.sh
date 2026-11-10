#!/usr/bin/env bash
# LOC-7: proves the server container can load zstd-jni's native library under the flags the production box really uses.
#
#   infra/scripts/test-server-native-lib.sh            (needs the built server: ./gradlew :server:bootJar -x test, or SERVER_JAR=<path>)
#
# Why it exists: the timezone engine (timeshape) reads its dataset through zstd-jni, which unpacks a native library into a folder and
# loads it. The box starts the server with --read-only and --tmpfs /tmp, and Docker mounts that tmpfs noexec, so the load failed
# ("failed to map segment from shared object") and every location save returned a 500. No unit or integration test runs with those
# flags, which is how it reached production. This runs a tiny program (it starts the same TimeZoneEngine) on the real libraries of
# server.jar, in the server's own base image, as the server's user (uid 10001).
#
# It reads the flags from the files that define them, not from a copy: the `flags=` lines of replace_container() in
# infra/oracle/scripts/sportconnect-deploy.sh and the -D options of the ENTRYPOINT in server/Dockerfile. So a change to either file
# is what gets tested. Cases:
#   1. no hardening at all: works (the program and the jar are sound)
#   2. the OLD flags (read-only, cap-drop, --tmpfs /tmp, nothing else): fails with the reported error (a control: if this ever starts
#      working, the check below proves nothing and says so)
#   3. the REAL flags and the Dockerfile's JVM options: works
#   4. the real flags without the JVM option: fails (the option is needed)
#   5. the real JVM option without the extra mount: fails (the mount is needed)
#   6. /tmp is still noexec under the real flags, and the native folder is exec but not suid or dev (the exception stays narrow)
#   7. the Dockerfile creates the native folder owned by the app user (a plain `docker run` without the mount still works)
# Needs Docker, javac (JDK 21), unzip. Removes everything it created. Takes about a minute (the engine builds its index each run).
set -uo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$here/../.."
SERVER_JAR="${SERVER_JAR:-$repo/server/build/libs/server.jar}"
DOCKERFILE="$repo/server/Dockerfile"
DEPLOY="$repo/infra/oracle/scripts/sportconnect-deploy.sh"
export MSYS_NO_PATHCONV=1

pass=0; fail=0
ok() { echo "ok    $1"; pass=$((pass+1)); }
no() { echo "FAIL  $1"; fail=$((fail+1)); }
need() { command -v "$1" >/dev/null || { echo "test-server-native-lib: $1 is not on PATH" >&2; exit 2; }; }
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m -l "$1"; else printf '%s' "$1"; fi; }

need docker; need javac; need unzip
docker info >/dev/null 2>&1 || { echo "test-server-native-lib: the Docker daemon is not running" >&2; exit 2; }
[ -f "$SERVER_JAR" ] || { echo "test-server-native-lib: $SERVER_JAR not found (./gradlew :server:bootJar -x test, or set SERVER_JAR)" >&2; exit 2; }
[ -f "$DOCKERFILE" ] && [ -f "$DEPLOY" ] || { echo "test-server-native-lib: server/Dockerfile or sportconnect-deploy.sh not found" >&2; exit 2; }

work="$(mktemp -d)"
VOLUME="sc-native-lib-test-logs"
trap 'rm -rf "$work"; docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true' EXIT

# ---- what the real files say ----
IMAGE="$(tr -d '\r' < "$DOCKERFILE" | sed -n 's/^FROM \(eclipse-temurin:[^ ]*\)$/\1/p' | tail -n 1)"
[ -n "$IMAGE" ] || { echo "test-server-native-lib: no runtime FROM eclipse-temurin line in the Dockerfile" >&2; exit 2; }
JVM_OPTS=()
while IFS= read -r o; do JVM_OPTS+=("$o"); done < <(tr -d '\r' < "$DOCKERFILE" | grep '^ENTRYPOINT' | grep -o '"-D[^"]*"' | tr -d '"')
flag_lines="$(tr -d '\r' < "$DEPLOY" | grep -E '^[[:space:]]*(flags=\(|\[ "\$c" = server \] && flags\+=\()')"
[ -n "$flag_lines" ] || { echo "test-server-native-lib: the flags= lines of replace_container() were not found in $DEPLOY" >&2; exit 2; }
c=server; cn="sc-native-lib-test"; flags=()
eval "$flag_lines" || { echo "test-server-native-lib: could not evaluate the flags lines" >&2; exit 2; }
# the real log volume would be named after the container; keep it throwaway
REAL_FLAGS=()
for f in "${flags[@]}"; do REAL_FLAGS+=("${f//$cn-logs/$VOLUME}"); done
OLD_FLAGS=(--read-only --cap-drop ALL --security-opt no-new-privileges --tmpfs /tmp)
echo "image:     $IMAGE"
echo "jvm opts:  ${JVM_OPTS[*]:-(none)}"
echo "real flags: ${REAL_FLAGS[*]}"

# ---- the program: starts the same engine the location save uses ----
mkdir -p "$work/probe/lib"
unzip -q -j "$SERVER_JAR" 'BOOT-INF/lib/*.jar' -d "$work/probe/lib" || { echo "test-server-native-lib: could not read BOOT-INF/lib from $SERVER_JAR" >&2; exit 2; }
cat > "$work/probe/Probe.java" <<'JAVA'
import net.iakovlev.timeshape.TimeZoneEngine;

public class Probe {
    public static void main(String[] args) {
        TimeZoneEngine engine = TimeZoneEngine.initialize();
        System.out.println("PROBE zone=" + engine.query(16.0590991, 108.1800478).map(z -> z.getId()).orElse("none"));
    }
}
JAVA
(cd "$work/probe" && javac --release 21 -cp "lib/*" -d . Probe.java) || { echo "test-server-native-lib: javac failed" >&2; exit 2; }
P="$(hostpath "$work/probe")"

# probe <label> <flags...> -- <jvm opts...> : prints the program's output
probe() {
  local fl=() jv=() seen=0
  for a in "$@"; do
    if [ "$a" = "--" ]; then seen=1; elif [ $seen = 0 ]; then fl+=("$a"); else jv+=("$a"); fi
  done
  docker run --rm --user 10001:10001 -m 2g ${fl[@]+"${fl[@]}"} -v "$P:/probe:ro" "$IMAGE" \
    java -Xmx1g ${jv[@]+"${jv[@]}"} -cp "/probe:/probe/lib/*" Probe 2>&1
}
works() { echo "$1" | grep -q 'PROBE zone=Asia/Ho_Chi_Minh'; }

out="$(probe -- )"
works "$out" && ok "1. without any hardening the engine starts and answers Asia/Ho_Chi_Minh" || { no "1. without any hardening the engine starts"; echo "$out" | tail -5; }

out="$(probe "${OLD_FLAGS[@]}" -- )"
if works "$out"; then no "2. control: the old flags no longer fail, so this test proves nothing (Docker changed the tmpfs default?)"
elif echo "$out" | grep -q 'failed to map segment'; then ok "2. control: the old flags (--tmpfs /tmp only) fail with 'failed to map segment from shared object'"
else no "2. control: the old flags fail, but not with the reported error"; echo "$out" | tail -4; fi

out="$(probe "${REAL_FLAGS[@]}" -- "${JVM_OPTS[@]}")"
works "$out" && ok "3. the real flags and the Dockerfile's JVM options: the engine starts and answers Asia/Ho_Chi_Minh" || { no "3. the real flags and the Dockerfile's JVM options: the engine starts"; echo "$out" | grep -E 'PROBE|Exception|Error|Cannot|failed' | head -4; }

out="$(probe "${REAL_FLAGS[@]}" -- )"
works "$out" && no "4. without the JVM option the engine still starts (the option is not needed?)" || ok "4. without the JVM option the engine does not start (the option is needed)"

out="$(probe "${OLD_FLAGS[@]}" -- "${JVM_OPTS[@]}")"
works "$out" && no "5. without the extra mount the engine still starts (the mount is not needed?)" || ok "5. without the extra mount the engine does not start (the mount is needed)"

mounts="$(docker run --rm --user 10001:10001 "${REAL_FLAGS[@]}" "$IMAGE" sh -c 'grep -E " /(tmp|opt/native) " /proc/mounts' 2>&1)"
echo "$mounts" | grep -E ' /tmp ' | grep -q 'noexec' && ok "6a. /tmp is still mounted noexec" || { no "6a. /tmp is still mounted noexec"; echo "$mounts"; }
nl="$(echo "$mounts" | grep -E ' /opt/native ')"
if [ -n "$nl" ] && ! echo "$nl" | grep -q 'noexec' && echo "$nl" | grep -q 'nosuid' && echo "$nl" | grep -q 'nodev'; then ok "6b. the native folder allows exec and is nosuid, nodev"; else no "6b. the native folder allows exec and is nosuid, nodev"; echo "$nl"; fi

df="$(tr -d '\r' < "$DOCKERFILE")"
echo "$df" | grep -q 'mkdir -p .*/opt/native' && echo "$df" | grep -q 'chown app:app .*/opt/native' && ok "7. the Dockerfile creates /opt/native and gives it to the app user" || no "7. the Dockerfile creates /opt/native and gives it to the app user"

echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
