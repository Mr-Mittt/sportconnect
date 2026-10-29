#!/usr/bin/env bash
# INFRA-6: the step of .github/workflows/promote.yml that moves `prod`, after the approval. A retag only: the same image
# (by digest, so a tag that moved meanwhile cannot change what is promoted) gets a second tag. Nothing is rebuilt.
#
#   IMAGE=ghcr.io/mr-mittt/sportconnect-server NEW_DIGEST=sha256:... infra/scripts/promote-apply.sh
#
# Needs docker buildx, logged in to ghcr.io with write access to the package (the workflow's GITHUB_TOKEN).
set -euo pipefail

: "${IMAGE:?IMAGE missing}" "${NEW_DIGEST:?NEW_DIGEST missing}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"

docker buildx imagetools create --tag "${IMAGE}:prod" "${IMAGE}@${NEW_DIGEST}"

now="$(docker buildx imagetools inspect "${IMAGE}:prod" --format '{{.Manifest.Digest}}')"
if [ "$now" != "$NEW_DIGEST" ]; then
  echo "promote-apply: ${IMAGE}:prod is ${now} after the retag, expected ${NEW_DIGEST}" >&2
  exit 1
fi
echo "promote-apply: ${IMAGE}:prod -> ${NEW_DIGEST}"
{
  echo "### Done"
  echo "\`${IMAGE##*/}:prod\` now points at \`${NEW_DIGEST:0:19}\`. Run \`sportconnect-deploy\` on the box to deploy it."
} >> "$SUMMARY"
