#!/usr/bin/env bash
# INFRA-6: the step of .github/workflows/promote.yml that moves `prod`, after the approval. A retag only: the same image
# (by digest, so a tag that moved meanwhile cannot change what is promoted) gets a second tag. Nothing is rebuilt.
#
#   IMAGE=ghcr.io/mr-mittt/sportconnect-server NEW_DIGEST=sha256:... GITHUB_TOKEN=... infra/scripts/promote-apply.sh
#
# The manifest is copied byte for byte through the registry API (read it by digest, write the same bytes as the tag
# `prod`), so `prod` ends with exactly NEW_DIGEST. `docker buildx imagetools create --tag` is not used for this: given
# a single-platform image (ours are pushed with provenance: false) it wraps it in a new manifest list, which has a
# different digest (found by the first real run, 2026-10-29; INFRA-15 check 2).
#
# Needs curl and sha256sum; docker buildx, logged in to ghcr.io, only for the final check. GITHUB_TOKEN is the
# workflow's token (packages: write); the token for the registry is requested from the registry with it, never printed.
#
# Test hooks (not used by the workflow): PROMOTE_SCHEME=http and PROMOTE_NO_AUTH=1 for a local registry.
set -euo pipefail

: "${IMAGE:?IMAGE missing}" "${NEW_DIGEST:?NEW_DIGEST missing}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

fail() { echo "promote-apply: $*" >&2; exit 1; }

host="${IMAGE%%/*}"
name="${IMAGE#*/}"
base="${PROMOTE_SCHEME:-https}://${host}"
accept='application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json'

auth=()
if [ -z "${PROMOTE_NO_AUTH:-}" ]; then
  : "${GITHUB_TOKEN:?GITHUB_TOKEN missing}"
  resp="$(curl -fsS -u "${GITHUB_ACTOR:-token}:${GITHUB_TOKEN}" \
    "${base}/token?service=${host}&scope=repository:${name}:pull,push")" || fail "could not get a registry token for ${name}"
  tok="$(printf '%s' "$resp" | sed -n 's/.*"token" *: *"\([^"]*\)".*/\1/p')"
  [ -n "$tok" ] || fail "the registry answered without a token for ${name}"
  auth=(-H "Authorization: Bearer ${tok}")
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# Relative file names inside it: a Windows curl (local runs under Git Bash) cannot open an MSYS /tmp path.
cd "$tmp"

curl -fsS ${auth[@]+"${auth[@]}"} -H "Accept: ${accept}" -D headers -o manifest \
  "${base}/v2/${name}/manifests/${NEW_DIGEST}" || fail "could not read ${IMAGE}@${NEW_DIGEST}"

got="sha256:$(sha256sum manifest | cut -d' ' -f1)"
[ "$got" = "$NEW_DIGEST" ] || fail "the manifest read for ${NEW_DIGEST} hashes to ${got}; nothing was changed"

ctype="$(grep -i '^content-type:' headers | tail -n1 | tr -d '\r' | sed 's/^[^:]*: *//')"
[ -n "$ctype" ] || fail "the registry sent no content type for ${NEW_DIGEST}; nothing was changed"

curl -fsS ${auth[@]+"${auth[@]}"} -X PUT -H "Content-Type: ${ctype}" --data-binary @manifest -o put.out \
  "${base}/v2/${name}/manifests/prod" || fail "could not write ${IMAGE}:prod"

now="$(docker buildx imagetools inspect "${IMAGE}:prod" --format '{{.Manifest.Digest}}')"
if [ "$now" != "$NEW_DIGEST" ]; then
  fail "${IMAGE}:prod is ${now} after the retag, expected ${NEW_DIGEST}"
fi
echo "promote-apply: ${IMAGE}:prod -> ${NEW_DIGEST}"
{
  echo "### Done"
  echo "\`${IMAGE##*/}:prod\` now points at \`${NEW_DIGEST:0:19}\`. Run \`sportconnect-deploy\` on the box to deploy it."
} >> "$SUMMARY"
