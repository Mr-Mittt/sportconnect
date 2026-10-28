#!/usr/bin/env bash
# INFRA-4: the server's one version lives in the root gradle.properties (`version=X.Y.Z`); a release is the merge of a PR
# that raises it (.github/workflows/server-image.yml releases when the tag server-v<version> does not exist yet).
#
#   infra/scripts/server-version.sh bump [minor|patch|major|X.Y.Z]   # edits gradle.properties; default: minor
#   infra/scripts/server-version.sh check                            # validates the version in the repo (CI runs it)
#
# Flow: git switch -c chore/server-<X.Y.Z> master; infra/scripts/server-version.sh bump; commit
# "chore(release): server X.Y.Z"; open the PR; merging it releases.
#
# Rules (both commands): the version is X.Y.Z; it is never lower than the highest existing server-vX.Y.Z tag. `bump` also
# refuses a result that is not strictly higher than the current version and than the highest tag, so a repeat or a
# downgrade fails. 0.0.0 is the placeholder before the first release and is never released.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
props="$root/gradle.properties"
semver='^[0-9]+\.[0-9]+\.[0-9]+$'

die() { echo "server-version: $*" >&2; exit 1; }

current() { sed -n 's/^version=//p' "$props" | tr -d '\r'; }

# Highest released version (from the server-v* tags), empty when there is none.
latest_released() {
  git -C "$root" tag -l 'server-v*' | sed 's/^server-v//' | grep -E "$semver" | sort -V | tail -n 1 || true
}

# true when $1 is strictly higher than $2 (version order, not text order: 0.10.0 > 0.9.0)
higher() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]; }

cmd="${1:-}"
case "$cmd" in
  bump)
    arg="${2:-minor}"
    # Tags are the record of what was released; make the local view current when a remote exists (a failure only warns).
    git -C "$root" fetch --tags --quiet origin 2>/dev/null || echo "server-version: could not fetch tags, using the local ones" >&2

    cur="$(current)"
    [[ "$cur" =~ $semver ]] || die "gradle.properties version '$cur' is not X.Y.Z"
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
      higher "$new" "$latest" || die "$new is not higher than the latest release $latest (tag server-v$latest)"
    fi

    sed -i -E "s/^version=[0-9.]+/version=${new}/" "$props"
    [ "$(current)" = "$new" ] || die "could not write the version into gradle.properties"
    echo "server version: $cur -> $new${latest:+ (latest release: $latest)}"
    echo "next: commit gradle.properties as 'chore(release): server $new', open the PR; merging it releases $new"
    ;;

  check)
    cur="$(current)"
    [[ "$cur" =~ $semver ]] || die "gradle.properties version '$cur' is not X.Y.Z"
    latest="$(latest_released)"
    if [ -n "$latest" ] && higher "$latest" "$cur"; then
      die "gradle.properties version $cur is lower than the latest release $latest (tag server-v$latest)"
    fi
    if [ "$cur" = "0.0.0" ]; then
      echo "server-version: $cur is the placeholder; nothing will be released"
    elif git -C "$root" rev-parse -q --verify "refs/tags/server-v$cur" >/dev/null; then
      echo "server-version: $cur is already released (tag server-v$cur); builds are ordinary builds"
    else
      echo "server-version: $cur has no tag yet; merging to master will release it"
    fi
    ;;

  *) die "usage: server-version.sh bump [minor|patch|major|X.Y.Z] | check" ;;
esac
