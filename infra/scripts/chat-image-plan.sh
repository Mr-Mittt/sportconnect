#!/usr/bin/env bash
# INFRA-8: decides what the chat-image workflow builds and which tags it pushes. Writes `key=value` lines (and a
# multi-line `tags`) to $GITHUB_OUTPUT, so the workflow YAML stays thin and this can be tried locally.
#
# Environment: EVENT_NAME (push | pull_request | workflow_dispatch), REF (full ref, e.g. refs/heads/master),
#              SHA (full commit), OWNER (repository owner). Run from a checkout that has the tags (fetch-depth 0).
#
# The version is the first line of services/chat/VERSION. A RELEASE is a push to master (or a re-run by dispatch) while
# the tag chat-v<version> does not exist yet and the version is not the 0.0.0 placeholder; anything else is an ordinary build.
#
#   pull request     -> build only; version <version>+<sha7>
#   ordinary build   -> pushes :sha-<sha7> and :edge; version <version>+<sha7>
#   release          -> pushes :X.Y.Z, :latest, :sha-<sha7> and :edge; version X.Y.Z; the workflow creates the git tag last
#
# Outputs: image, version (what the image is labelled with), build_date, push, release, create_git_tag, tags (one per line).
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
: "${EVENT_NAME:?}" "${REF:?}" "${SHA:?}" "${OWNER:?}"
out="${GITHUB_OUTPUT:-/dev/stdout}"
semver='^[0-9]+\.[0-9]+\.[0-9]+$'

base="$(head -n 1 "$root/services/chat/VERSION" | tr -d '\r')"
[[ "$base" =~ $semver ]] || { echo "services/chat/VERSION '$base' is not X.Y.Z" >&2; exit 1; }
short="${SHA:0:7}"
image="ghcr.io/$(echo "$OWNER" | tr '[:upper:]' '[:lower:]')/sportconnect-chat"

release=false; push=true; version="${base}+${short}"

case "$EVENT_NAME" in
  pull_request) push=false ;;
  push|workflow_dispatch)
    [ "$REF" = "refs/heads/master" ] || { echo "nothing to publish for $REF (images come from master only)" >&2; exit 1; }
    if [ "$base" != "0.0.0" ] && ! git -C "$root" rev-parse -q --verify "refs/tags/chat-v${base}" >/dev/null; then
      release=true; version="$base"
    fi ;;
  *) echo "unsupported event $EVENT_NAME" >&2; exit 1 ;;
esac

{
  echo "image=$image"
  echo "version=$version"
  echo "build_date=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "push=$push"
  echo "release=$release"
  echo "create_git_tag=$release"
  echo "tags<<EOF"
  if [ "$push" = true ]; then
    echo "$image:sha-$short"
    echo "$image:edge"
    [ "$release" = true ] && { echo "$image:$version"; echo "$image:latest"; }
  else
    echo "$image:sha-$short"
  fi
  echo "EOF"
} >> "$out"
