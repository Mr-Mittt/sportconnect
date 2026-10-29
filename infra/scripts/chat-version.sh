#!/usr/bin/env bash
# INFRA-8: the chat service's one version lives in services/chat/VERSION (a single line, `X.Y.Z`); a release is the merge of
# a PR that raises it (.github/workflows/chat-image.yml releases when the tag chat-v<version> does not exist yet).
# Same flow and rules as server-version.sh and client-version.sh, with its own version file and its own chat-v* tags.
#
#   infra/scripts/chat-version.sh bump [minor|patch|major|X.Y.Z]   # edits services/chat/VERSION; default: minor
#   infra/scripts/chat-version.sh check                            # validates the version in the repo (CI runs it)
#
# Rules (both commands): the version is X.Y.Z; it is never lower than the highest existing chat-vX.Y.Z tag. `bump` also
# refuses a result that is not strictly higher than the current version and than the highest tag, so a repeat or a
# downgrade fails. 0.0.0 is the placeholder before the first release and is never released.
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
file="$root/services/chat/VERSION"
semver='^[0-9]+\.[0-9]+\.[0-9]+$'

die() { echo "chat-version: $*" >&2; exit 1; }

# The first line of the file, without a trailing CR (a Windows checkout may have CRLF endings).
current() { head -n 1 "$file" | tr -d '\r'; }

# Highest released version (from the chat-v* tags), empty when there is none.
latest_released() {
  git -C "$root" tag -l 'chat-v*' | sed 's/^chat-v//' | grep -E "$semver" | sort -V | tail -n 1 || true
}

# true when $1 is strictly higher than $2 (version order, not text order: 0.10.0 > 0.9.0)
higher() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]; }

[ -f "$file" ] || die "services/chat/VERSION does not exist"

cmd="${1:-}"
case "$cmd" in
  bump)
    arg="${2:-minor}"
    git -C "$root" fetch --tags --quiet origin 2>/dev/null || echo "chat-version: could not fetch tags, using the local ones" >&2

    cur="$(current)"
    [[ "$cur" =~ $semver ]] || die "services/chat/VERSION '$cur' is not X.Y.Z"
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
      higher "$new" "$latest" || die "$new is not higher than the latest release $latest (tag chat-v$latest)"
    fi

    # Only the first line is changed, and the file's line endings are left alone.
    sed -b -i -E "1s/^[0-9.]+/${new}/" "$file"
    [ "$(current)" = "$new" ] || die "could not write the version into services/chat/VERSION"
    echo "chat version: $cur -> $new${latest:+ (latest release: $latest)}"
    echo "next: commit services/chat/VERSION as 'chore(release): chat $new', open the PR; merging it releases $new"
    ;;

  check)
    cur="$(current)"
    [[ "$cur" =~ $semver ]] || die "services/chat/VERSION '$cur' is not X.Y.Z"
    latest="$(latest_released)"
    if [ -n "$latest" ] && higher "$latest" "$cur"; then
      die "services/chat/VERSION $cur is lower than the latest release $latest (tag chat-v$latest)"
    fi
    if [ "$cur" = "0.0.0" ]; then
      echo "chat-version: $cur is the placeholder; nothing will be released"
    elif git -C "$root" rev-parse -q --verify "refs/tags/chat-v$cur" >/dev/null; then
      echo "chat-version: $cur is already released (tag chat-v$cur); builds are ordinary builds"
    else
      echo "chat-version: $cur has no tag yet; merging to master will release it"
    fi
    ;;

  *) die "usage: chat-version.sh bump [minor|patch|major|X.Y.Z] | check" ;;
esac
