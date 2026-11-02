#!/usr/bin/env bash
# INFRA-12: run the k6 ramp (t.js) against three read-only endpoints, one after the other with 30 s rests, on the box
# itself, and sample `docker stats`, `free` and the load average every 10 s. Run ON THE BOX as `ubuntu`:
#
#   mkdir -p ~/loadtest && cp t.js run.sh ~/loadtest/ && bash ~/loadtest/run.sh
#
# Output in ~/loadtest/out-<UTC stamp>/: k6_<name>.log (k6's summary), k6_<name>.json (summary export), stats.log.
# Needs Docker with grafana/k6 (pulled on first use). The generator shares the box's CPU with the stack, which is how the
# first measurement (x86, 2026-10-27) was taken, so the two are comparable; a separate generator would show better numbers.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/out-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
chmod a+rwx "$OUT"   # k6 runs as an unprivileged user inside the container and must be able to write its summary export
docker pull -q grafana/k6 >/dev/null

(
  while true; do
    { echo "== $(date -u +%H:%M:%S)"; docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}'; free -m | sed -n 2p; uptime; } >> "$OUT/stats.log"
    sleep 10
  done
) &
SAMPLER=$!
trap 'kill $SAMPLER 2>/dev/null' EXIT

run() { # run <name> <path>
  echo "== $1 ($2) $(date -u +%H:%M:%S)"
  docker run --rm --network host -v "$DIR:/lt:ro" -v "$OUT:/out" grafana/k6 run \
    -e TARGET_PATH="$2" --summary-export="/out/k6_$1.json" /lt/t.js > "$OUT/k6_$1.log" 2>&1
  echo "   exit $? at $(date -u +%H:%M:%S)"
  sleep 30
}

run api /api/reference/countries
run static /
run chat /api/chat/healthz
echo "== done $OUT"
