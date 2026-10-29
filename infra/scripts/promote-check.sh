#!/usr/bin/env bash
# INFRA-6: the checks and the approval summary of .github/workflows/promote.yml. Runs BEFORE the approval gate, so the
# reviewer reads the result. Moves nothing: promote-apply.sh does that, after the approval.
#
#   COMPONENT=server VERSION=0.2.0 SKIP_CI_CHECK=false OWNER=Mr-Mittt REPO=Mr-Mittt/sportconnect GH_TOKEN=... \
#     infra/scripts/promote-check.sh
#
# Needs docker (buildx, logged in to ghcr.io), gh, and a checkout with full history (fetch-depth: 0).
# Writes the summary to $GITHUB_STEP_SUMMARY and the outputs below to $GITHUB_OUTPUT (both default to /dev/null for a
# local run); exits 1 when the promote is refused, so the job after the gate never starts.
#   outputs: image, new_digest, current_version, new_version, nochange (true/false)
#
# Refused: an unknown component, a version that is not X.Y.Z or sha-<hex> (edge, latest and prod can never be promoted),
# an image that does not exist, a commit older than the one `prod` runs now (down-version promotes are blocked until
# INFRA-17), and a failed CI run for the commit unless SKIP_CI_CHECK=true. A missing CI result only warns.
#
# Verified only on GitHub (INFRA-15 style): the registry reads need the real GHCR packages. The decisions are tested with
# stand-in docker and gh commands (see the INFRA-6 summary).
set -euo pipefail

: "${COMPONENT:?COMPONENT missing}" "${VERSION:?VERSION missing}" "${OWNER:?OWNER missing}" "${REPO:?REPO missing}"
SKIP_CI_CHECK="${SKIP_CI_CHECK:-false}"
SUMMARY="${GITHUB_STEP_SUMMARY:-/dev/null}"
OUTPUT="${GITHUB_OUTPUT:-/dev/null}"

blocked=false
reasons=()
warnings=()
block() { blocked=true; reasons+=("$1"); }
warn()  { warnings+=("$1"); }

case "$COMPONENT" in
  server|client|chat) ;;
  *) echo "promote-check: component must be server, client or chat (got '$COMPONENT')" >&2; exit 1 ;;
esac
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ || "$VERSION" =~ ^sha-[0-9a-f]{7,40}$ ]]; then
  echo "promote-check: version must be a release (X.Y.Z) or a build (sha-<hex>); '$VERSION' is refused (edge, latest and prod are moving tags)" >&2
  exit 1
fi

owner_lc="$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]')"
image="ghcr.io/${owner_lc}/sportconnect-${COMPONENT}"

# ref_info <image ref>  ->  prints "<digest>|<version>|<revision>"; fails when the registry has no such image.
# A single-platform manifest (the image workflows push with provenance off) prints the image config as .Image; the labels
# are read with sed so that neither jq nor node is needed (the same function is in the box's deploy command).
ref_info() {
  local d cfg v r
  d="$(docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>/dev/null)" || return 1
  [ -n "$d" ] || return 1
  cfg="$(docker buildx imagetools inspect "$1" --format '{{json .Image}}' 2>/dev/null || true)"
  v="$(printf '%s\n' "$cfg" | sed -n 's/.*"org.opencontainers.image.version": *"\([^"]*\)".*/\1/p' | head -1)"
  r="$(printf '%s\n' "$cfg" | sed -n 's/.*"org.opencontainers.image.revision": *"\([^"]*\)".*/\1/p' | head -1)"
  printf '%s|%s|%s\n' "$d" "$v" "$r"
}

new_digest="" new_version="" new_rev=""
if info="$(ref_info "${image}:${VERSION}")"; then
  IFS='|' read -r new_digest new_version new_rev <<<"$info"
else
  block "\`${image}:${VERSION}\` was not found (or the token cannot read it). Releases are kept for ever; \`sha-\` builds beyond the newest 10 are pruned."
fi

cur_digest="" cur_version="" cur_rev=""
if info="$(ref_info "${image}:prod")"; then
  IFS='|' read -r cur_digest cur_version cur_rev <<<"$info"
fi

have_commit() { [ -n "$1" ] && git cat-file -e "$1^{commit}" 2>/dev/null; }

nochange=false
if [ -n "$new_digest" ]; then
  if [ -n "$cur_digest" ] && [ "$cur_digest" = "$new_digest" ]; then
    nochange=true
    warn "\`prod\` already points at this image; nothing to promote."
  elif [ -n "$cur_digest" ]; then
    # down-version block: the commit of the new image must be the current one or a descendant of it
    if ! have_commit "$cur_rev"; then
      block "the commit of the image now on \`prod\` (\`${cur_rev:-no revision label}\`) is not in this checkout, so the order of the two cannot be checked."
    elif ! have_commit "$new_rev"; then
      block "the commit of \`${VERSION}\` (\`${new_rev:-no revision label}\`) is not in this checkout, so it cannot be compared with \`prod\`."
    elif ! git merge-base --is-ancestor "$cur_rev" "$new_rev"; then
      block "\`${new_version:-$VERSION}\` is OLDER than what \`prod\` runs (\`${cur_version}\`). Promoting an older version is blocked until INFRA-17 (the database schema may not fit an older release)."
    fi
  fi
fi

# CI result: the newest push run on master of this component's CI workflow whose commit is the image's commit or an
# ancestor of it. The workflows are path-filtered, so the image's own commit often has no run (a release commit only
# changes the version file); the last run before it tested the same code.
ci_text="not checked"
ci_url=""
if [ -n "$new_rev" ] && have_commit "$new_rev"; then
  runs="$(gh api "repos/${REPO}/actions/workflows/${COMPONENT}-ci.yml/runs?branch=master&event=push&status=completed&per_page=50" \
    --jq '.workflow_runs[] | [.head_sha, .conclusion, .html_url] | @tsv' 2>/dev/null || true)"
  found=""
  while IFS=$'\t' read -r sha conclusion url; do
    [ -n "$sha" ] || continue
    have_commit "$sha" || continue
    if [ "$sha" = "$new_rev" ] || git merge-base --is-ancestor "$sha" "$new_rev"; then found="$sha|$conclusion|$url"; break; fi
  done <<<"$runs"
  if [ -z "$found" ]; then
    ci_text="no result found"
    warn "no \`${COMPONENT}-ci\` result was found for this commit or any commit before it (older than GitHub's log retention, or never run). To run it again: Actions, \`${COMPONENT}-ci\`, Run workflow, choose the tag \`${COMPONENT}-v${VERSION}\`."
  else
    IFS='|' read -r sha conclusion ci_url <<<"$found"
    case "$conclusion" in
      success) ci_text="passed (run on \`${sha:0:7}\`)" ;;
      failure|timed_out|startup_failure)
        ci_text="FAILED (run on \`${sha:0:7}\`)"
        if [ "$SKIP_CI_CHECK" = "true" ]; then warn "the CI check was SKIPPED by the person who started this run although \`${COMPONENT}-ci\` failed."
        else block "\`${COMPONENT}-ci\` FAILED for this code (run on \`${sha:0:7}\`). Fix it, or start Promote again with \"skip CI check\" if you accept that."; fi ;;
      *) ci_text="${conclusion} (run on \`${sha:0:7}\`)"; warn "the last \`${COMPONENT}-ci\` run ended '${conclusion}', which says nothing about the tests." ;;
    esac
  fi
fi

{
  echo "### Promote ${COMPONENT}: ${cur_version:-nothing deployed yet} -> ${new_version:-$VERSION}"
  echo
  echo "| | now on \`prod\` | will be on \`prod\` |"
  echo "|---|---|---|"
  echo "| version | ${cur_version:-none} | ${new_version:-?} |"
  echo "| commit | \`${cur_rev:0:7}\` | \`${new_rev:0:7}\` |"
  echo "| image | \`${cur_digest:0:19}\` | \`${new_digest:0:19}\` |"
  echo
  echo "CI for this code: ${ci_text}${ci_url:+ ([run](${ci_url}))}"
  echo
  for w in "${warnings[@]+"${warnings[@]}"}"; do echo "- WARNING: ${w}"; done
  for r in "${reasons[@]+"${reasons[@]}"}"; do echo "- REFUSED: ${r}"; done
  if [ "$blocked" = false ] && [ "$nochange" = false ]; then
    echo
    echo "Approve to move \`prod\` of ${COMPONENT}. Then run \`sportconnect-deploy\` on the box."
  fi
} >> "$SUMMARY"

{
  echo "image=${image}"
  echo "new_digest=${new_digest}"
  echo "current_version=${cur_version:-none}"
  echo "new_version=${new_version:-$VERSION}"
  echo "nochange=${nochange}"
} >> "$OUTPUT"

if [ "$blocked" = true ]; then
  printf 'promote-check: refused: %s\n' "${reasons[@]}" >&2
  exit 1
fi
echo "promote-check: ${COMPONENT} ${cur_version:-none} -> ${new_version:-$VERSION}; CI ${ci_text}; no change: ${nochange}"
