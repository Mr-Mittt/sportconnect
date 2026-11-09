#!/usr/bin/env bash
# INFRA-24: the release notes of the four images (server, client, chat, box). One file each in documentation/release-notes/
# (SERVER.md, CLIENT.md, CHAT.md, BOX.md). The mechanics live here so they can be tested and used by /release, the
# *-version.sh check commands and promote-check.sh; the judgement (is a deploy action concrete? is a ticket missing?) is /release's.
#
#   release-notes.sh check-unreleased <component>            the "## Unreleased" block is ready to be released
#   release-notes.sh cut <component> <X.Y.Z> [YYYY-MM-DD]    check, then rename Unreleased to "## X.Y.Z — date", prune it, write a fresh template
#   release-notes.sh check-released <component> <X.Y.Z>     the file has a "## X.Y.Z" section (CI: the *-version.sh check commands)
#   release-notes.sh section <component> <X.Y.Z>            print that section (the promote summary)
#   release-notes.sh pr-body <component>:<X.Y.Z> ...        the release PR description: one block per component, in the order given
#   release-notes.sh template                                print the empty Unreleased template
#
# File shape (see documentation/release-notes/README.md):
#   ## Unreleased
#   ### Changes / ### Applied automatically / ### Manual actions on the box / ### Rollback / ### Depends on
#   ## X.Y.Z — YYYY-MM-DD      (older releases, same subsections, empty ones removed)
#
# Ready to release means: Changes, Manual actions on the box and Rollback each have at least one "- " line ("- none" is an
# explicit answer for the last two; Applied automatically is optional), no placeholder (TBD, TODO, XXX, FIXME or <angle brackets>) anywhere in the block, and every
# Depends on line is "- none" or "- <server|client|chat|box> >= X.Y.Z".
# RELEASE_NOTES_DIR overrides the folder (the tests use it).
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
dir="${RELEASE_NOTES_DIR:-$root/documentation/release-notes}"

die() { echo "release-notes: $*" >&2; exit 1; }

template() {
  printf '%s\n' '## Unreleased' '' '### Changes' '' '### Applied automatically' '' '### Manual actions on the box' '' '### Rollback' '' '### Depends on' ''
}

notes_file() {
  case "${1:-}" in
    server|client|chat|box) printf '%s/%s.md' "$dir" "$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')" ;;
    *) die "component must be server, client, chat or box (got '${1:-}')" ;;
  esac
}

# The text of "## Unreleased" up to the next "## " heading, without the heading itself and without CRs.
unreleased_block() {
  tr -d '\r' < "$1" | awk '/^## Unreleased[[:space:]]*$/ {on=1; next} on && /^## / {exit} on {print}'
}

# The lines of one subsection ("### Name") of a block read on stdin.
subsection() {
  awk -v name="$1" '/^### / {on = ($0 == "### " name); next} on {print}'
}

bullets() { grep -E '^- ' || true; }

semver='^[0-9]+\.[0-9]+\.[0-9]+$'

check_unreleased() {
  local comp="$1" file block problems=() sub n
  file="$(notes_file "$comp")"
  [ -f "$file" ] || die "$file does not exist"
  [ "$(tr -d '\r' < "$file" | grep -cE '^## Unreleased[[:space:]]*$')" = 1 ] || die "$file must have exactly one '## Unreleased' heading"
  block="$(unreleased_block "$file")"

  for sub in "Changes" "Manual actions on the box" "Rollback"; do
    n="$(printf '%s\n' "$block" | subsection "$sub" | bullets | wc -l | tr -d ' ')"
    if ! printf '%s\n' "$block" | grep -qx "### $sub"; then
      problems+=("the '### $sub' heading is missing")
    elif [ "$n" = 0 ]; then
      if [ "$sub" = "Changes" ]; then problems+=("'### Changes' is empty: nothing to release")
      else problems+=("'### $sub' is empty: write the steps, or '- none' if there are none"); fi
    fi
  done

  # placeholders anywhere in the block
  local hits
  hits="$(printf '%s\n' "$block" | grep -nE '\b(TBD|TODO|XXX|FIXME)\b|<[^>]+>' || true)"
  [ -z "$hits" ] || problems+=("placeholder text left in the block: $(printf '%s' "$hits" | head -3 | tr '\n' ' ')")

  # Depends on lines
  local line
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    if ! [[ "$line" =~ ^-\ none$ || "$line" =~ ^-\ (server|client|chat|box)\ \>=\ [0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      problems+=("Depends on line '$line' is not '- none' or '- <server|client|chat|box> >= X.Y.Z'")
    fi
  done < <(printf '%s\n' "$block" | subsection "Depends on" | bullets)

  if [ "${#problems[@]}" -gt 0 ]; then
    echo "release-notes: $comp is not ready to release ($file):" >&2
    printf '  - %s\n' "${problems[@]}" >&2
    return 1
  fi
  echo "release-notes: $comp: the Unreleased block is ready"
}

check_released() {
  local comp="$1" version="$2" file
  [[ "$version" =~ $semver ]] || die "'$version' is not X.Y.Z"
  file="$(notes_file "$comp")"
  [ -f "$file" ] || die "$file does not exist (every released version needs a '## $version' section, INFRA-24)"
  tr -d '\r' < "$file" | grep -qE "^## ${version//./\\.}( |\$)" \
    || die "$file has no '## $version' section: /release writes it (or run: infra/scripts/release-notes.sh cut $comp $version)"
  echo "release-notes: $comp $version has its section"
}

section() {
  local comp="$1" version="$2" file out
  [[ "$version" =~ $semver ]] || die "'$version' is not X.Y.Z"
  file="$(notes_file "$comp")"
  [ -f "$file" ] || die "$file does not exist"
  out="$(tr -d '\r' < "$file" | awk -v h="## $version" '
    $0 == h || index($0, h " ") == 1 {on=1; next}
    on && /^## / {exit}
    on {print}')"
  [ -n "$(printf '%s' "$out" | tr -d '[:space:]')" ] || die "no '## $version' section in $file"
  printf '%s\n' "$out"
}

cut_release() {
  local comp="$1" version="$2" date="${3:-$(date +%F)}" file tmp
  [[ "$version" =~ $semver ]] || die "'$version' is not X.Y.Z"
  [[ "$date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "'$date' is not YYYY-MM-DD"
  file="$(notes_file "$comp")"
  check_unreleased "$comp" >/dev/null || { check_unreleased "$comp"; return 1; }
  if tr -d '\r' < "$file" | grep -qE "^## ${version//./\\.}( |\$)"; then
    die "$file already has a '## $version' section"
  fi
  tmp="$(mktemp)"
  tr -d '\r' < "$file" | TEMPLATE="$(template)" awk -v ver="$version" -v dt="$date" '
    function flush(   i, j, k, kept, n, seen, dropnone, name, line, bulletcount, nonenly) {
      for (i = 1; i <= nsub; i++) {
        name = subname[i]
        n = cnt[i]; bulletcount = 0; nonenly = 1
        for (j = 1; j <= n; j++) if (sub_lines[i, j] ~ /^- /) { bulletcount++; if (sub_lines[i, j] != "- none") nonenly = 0 }
        if (n == 0) continue                                                    # empty subsection
        if ((name == "Applied automatically" || name == "Depends on") && bulletcount > 0 && nonenly) continue   # only "- none"
        print "### " name
        delete seen
        for (j = 1; j <= n; j++) {
          line = sub_lines[i, j]
          if (line ~ /^- /) { if (line in seen) continue; seen[line] = 1 }
          print line
        }
        print ""
      }
    }
    BEGIN { state = 0; nsub = 0 }
    state == 0 && /^## Unreleased[[:space:]]*$/ {
      print ENVIRON["TEMPLATE"]; print ""; print "## " ver " — " dt; print ""; state = 1; next
    }
    state == 1 && /^## / { flush(); state = 2 }
    state == 1 {
      if ($0 ~ /^### /) { nsub++; subname[nsub] = substr($0, 5); cnt[nsub] = 0; next }
      if ($0 ~ /^[[:space:]]*$/) next
      if (nsub > 0) { cnt[nsub]++; sub_lines[nsub, cnt[nsub]] = $0 }
      next
    }
    { print }
    END { if (state == 1) flush() }
  ' > "$tmp"
  # Keep exactly one blank line before the first older section and a final newline.
  mv "$tmp" "$file"
  echo "release-notes: $comp: Unreleased is now '## $version — $date', a fresh template was written ($file)"
}

# The release PR description (INFRA-24): one block per "<component>:<X.Y.Z>" argument, in the order given (the release order).
# Each block is that version's cut section: what changes, what is applied automatically, what needs a manual action on the
# box, how to roll back, what it depends on. Read from the notes files, so the PR shows exactly what was committed.
pr_body() {
  [ $# -ge 1 ] || die "usage: pr-body <component>:<X.Y.Z> [<component>:<X.Y.Z> ...]"
  local arg comp ver body names=() manual
  for arg in "$@"; do
    [[ "$arg" =~ ^(server|client|chat|box):([0-9]+\.[0-9]+\.[0-9]+)$ ]] || die "'$arg' is not <component>:<X.Y.Z>"
    names+=("${BASH_REMATCH[1]} ${BASH_REMATCH[2]}")
  done
  echo "## Release: $(printf '%s, ' "${names[@]}" | sed 's/, $//')"
  echo
  if [ "$#" -gt 1 ]; then
    echo "**Release order:** $(printf '%s -> ' "${names[@]}" | sed 's/ -> $//')"
    echo
  fi
  echo "Cut from \`documentation/release-notes/\` by \`/release\`. After merging: promote each image (Actions, promote), then run \`sportconnect-deploy\` (server, chat, client) or \`sportconnect-setup\` (box) on the box, doing the manual actions in the order below."
  echo
  for arg in "$@"; do
    comp="${arg%%:*}"; ver="${arg##*:}"
    body="$(section "$comp" "$ver")" || return 1
    echo "## $comp $ver"
    echo
    manual="$(printf '%s\n' "$body" | subsection "Manual actions on the box" | bullets)"
    if [ -n "$manual" ] && [ "$(printf '%s\n' "$manual" | tr -d '[:space:]')" != "-none" ]; then
      echo "> **Manual action needed on the box** (see below)"
      echo
    fi
    printf '%s\n' "$body" | sed '/./,$!d'
    echo
  done
}

cmd="${1:-}"
case "$cmd" in
  template)         template ;;
  pr-body)          shift; pr_body "$@" ;;
  check-unreleased) [ $# -eq 2 ] || die "usage: check-unreleased <component>"; check_unreleased "$2" ;;
  check-released)   [ $# -eq 3 ] || die "usage: check-released <component> <X.Y.Z>"; check_released "$2" "$3" ;;
  section)          [ $# -eq 3 ] || die "usage: section <component> <X.Y.Z>"; section "$2" "$3" ;;
  cut)              [ $# -ge 3 ] && [ $# -le 4 ] || die "usage: cut <component> <X.Y.Z> [YYYY-MM-DD]"; cut_release "$2" "$3" "${4:-}" ;;
  *) die "usage: release-notes.sh check-unreleased <component> | cut <component> <X.Y.Z> [date] | check-released <component> <X.Y.Z> | section <component> <X.Y.Z> | template" ;;
esac
