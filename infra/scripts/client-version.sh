#!/usr/bin/env bash
# INFRA-5: the client's one version lives in client/package.json (`"version": "X.Y.Z"`); a release is the merge of a PR
# that raises it (.github/workflows/client-image.yml releases when the tag client-v<version> does not exist yet).
# Same flow and rules as server-version.sh, with its own version line and its own client-v* tags.
#
#   infra/scripts/client-version.sh bump [minor|patch|major|X.Y.Z]   # edits client/package.json; default: minor
#   infra/scripts/client-version.sh check                            # validates the version in the repo (CI runs it)
#
# Rules (both commands): the version is X.Y.Z; it is never lower than the highest existing client-vX.Y.Z tag. `bump` also
# refuses a result that is not strictly higher than the current version and than the highest tag, so a repeat or a
# downgrade fails. 0.0.0 is the placeholder before the first release and is never released.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
pkg="$root/client/package.json"
semver='^[0-9]+\.[0-9]+\.[0-9]+$'

die() { echo "client-version: $*" >&2; exit 1; }

# The first top-level "version" line (two-space indent), so a nested "version" key can never be picked up.
current() { sed -n 's/^  "version": "\([^"]*\)".*/\1/p' "$pkg" | head -n 1 | tr -d '\r'; }

# Highest released version (from the client-v* tags), empty when there is none.
latest_released() {
  git -C "$root" tag -l 'client-v*' | sed 's/^client-v//' | grep -E "$semver" | sort -V | tail -n 1 || true
}

# true when $1 is strictly higher than $2 (version order, not text order: 0.10.0 > 0.9.0)
higher() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]; }

cmd="${1:-}"
case "$cmd" in
  bump)
    arg="${2:-minor}"
    git -C "$root" fetch --tags --quiet origin 2>/dev/null || echo "client-version: could not fetch tags, using the local ones" >&2

    cur="$(current)"
    [[ "$cur" =~ $semver ]] || die "client/package.json version '$cur' is not X.Y.Z"
    IFS=. read -r major minor patch <<<"$cur"
    case "$arg" in
      minor) new="${major}.$((minor + 1)).0" ;;
      patch) new="${major}.${minor}.$((patch + 1))" ;;
      major) new="$((major + 1)).0.0" ;;
      *)     [[ "$arg" =~ $semver ]] || die "'$arg' is not minor, patch, major or X.Y.Z"; new="$arg" ;;
    esac

    higher "$new" "$cur" || die "$new is not higher than the current version $cur"
    latest="$(latest_released)"
    if [ -n "$latest" ]; then
      higher "$new" "$latest" || die "$new is not higher than the latest release $latest (tag client-v$latest)"
    fi

    # Only the first matching line is changed (the top-level key), and the file's line endings are left alone.
    sed -b -i -E "0,/^  \"version\": \"[0-9.]+\"/s//  \"version\": \"${new}\"/" "$pkg"
    [ "$(current)" = "$new" ] || die "could not write the version into client/package.json"
    echo "client version: $cur -> $new${latest:+ (latest release: $latest)}"
    echo "next: commit client/package.json as 'chore(release): client $new', open the PR; merging it releases $new"
    ;;

  check)
    cur="$(current)"
    [[ "$cur" =~ $semver ]] || die "client/package.json version '$cur' is not X.Y.Z"
    latest="$(latest_released)"
    if [ -n "$latest" ] && higher "$latest" "$cur"; then
      die "client/package.json version $cur is lower than the latest release $latest (tag client-v$latest)"
    fi
    if [ "$cur" = "0.0.0" ]; then
      echo "client-version: $cur is the placeholder; nothing will be released"
    elif git -C "$root" rev-parse -q --verify "refs/tags/client-v$cur" >/dev/null; then
      echo "client-version: $cur is already released (tag client-v$cur); builds are ordinary builds"
    else
      echo "client-version: $cur has no tag yet; merging to master will release it"
    fi
    ;;

  *) die "usage: client-version.sh bump [minor|patch|major|X.Y.Z] | check" ;;
esac
