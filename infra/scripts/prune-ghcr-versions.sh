#!/usr/bin/env bash
# INFRA-4: retention for the server image on GHCR. Keeps every release (X.Y.Z), `latest`, `edge` and the newest <keep>
# `sha-*` builds; deletes older `sha-*` builds (rule: select-prunable-package-versions.mjs).
#
#   GH_TOKEN=... infra/scripts/prune-ghcr-versions.sh <owner> <package> <keep> [--delete]
#
# Without --delete it only prints what it would delete. Needs the `gh` CLI and Node (both on GitHub's runners).
# NOT verified against GitHub yet (INFRA-4 conditional): whether the workflow's GITHUB_TOKEN may delete versions of a
# user-owned package. The workflow runs this step with continue-on-error so a refusal never fails a publish.
set -euo pipefail

owner="${1:?usage: prune-ghcr-versions.sh <owner> <package> <keep> [--delete]}"
package="${2:?package missing}"
keep="${3:?keep missing}"
mode="${4:-}"
here="$(cd "$(dirname "$0")" && pwd)"

type="$(gh api "users/${owner}" --jq .type)"
case "$type" in
  Organization) base="orgs/${owner}" ;;
  *)            base="users/${owner}" ;;
esac

ids="$(gh api --paginate "${base}/packages/container/${package}/versions?per_page=100" --jq '.[]' \
  | node "${here}/select-prunable-package-versions.mjs" "$keep")"

if [ -z "$ids" ]; then echo "prune-ghcr-versions: nothing to delete"; exit 0; fi
for id in $ids; do
  if [ "$mode" = "--delete" ]; then
    gh api -X DELETE "${base}/packages/container/${package}/versions/${id}" && echo "deleted version ${id}"
  else
    echo "would delete version ${id}"
  fi
done
