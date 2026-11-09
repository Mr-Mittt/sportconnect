#!/usr/bin/env bash
# INFRA-24: tests of infra/scripts/release-notes.sh and of the *-version.sh check integration. Plain bash, no framework:
#   infra/scripts/test-release-notes.sh        prints "ok" / "FAIL" per case, exit 1 if any failed
set -uo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
rn="$here/release-notes.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export RELEASE_NOTES_DIR="$work"
fails=0

pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; fails=$((fails + 1)); }

# expect <name> <0|1> <command...>: the command's exit status must be zero (0) or non-zero (1)
expect() {
  local name="$1" want="$2"; shift 2
  "$@" >"$work/out" 2>&1; local rc=$?
  if { [ "$want" = 0 ] && [ $rc -eq 0 ]; } || { [ "$want" = 1 ] && [ $rc -ne 0 ]; }; then pass "$name"; else fail "$name (rc=$rc: $(head -c 300 "$work/out" | tr '\n' ' '))"; fi
}
# expect_out <name> <fixed text> : the last command's output must contain the text
expect_out() { grep -qF -- "$2" "$work/out" && pass "$1" || fail "$1 (output: $(head -c 300 "$work/out" | tr '\n' ' '))"; }

good() {   # a ready SERVER.md with an older release below
  cat > "$work/SERVER.md" <<'EOF'
# server release notes

## Unreleased

### Changes

- Roles come from the token (A37).
- Roles come from the token (A37).
- Another change (A38).

### Manual actions on the box

- box: apply-realm-production.sh apply (INFRA-25).

### Rollback

- none

### Applied automatically

- none

### Depends on

- box >= 0.1.4

## 0.1.2 — 2026-11-05

### Changes

- Older.
EOF
}

# --- check-unreleased -------------------------------------------------------------------------------------------------
good;                                             expect "good block is ready" 0 "$rn" check-unreleased server
rm "$work/SERVER.md";                             expect "missing file fails" 1 "$rn" check-unreleased server
"$rn" template > "$work/SERVER.md";               expect "empty template fails" 1 "$rn" check-unreleased server
                                                  expect_out "empty template says nothing to release" "nothing to release"
good; sed -i 's/^- none$/- TBD/;' "$work/SERVER.md"; expect "TBD placeholder fails" 1 "$rn" check-unreleased server
good; sed -i 's/(A38)/<ticket>/' "$work/SERVER.md";  expect "<angle> placeholder fails" 1 "$rn" check-unreleased server
good; awk '/^### Rollback/ {skip=1; next} skip && /^### / {skip=0} !skip' "$work/SERVER.md" > "$work/x" && mv "$work/x" "$work/SERVER.md"
                                                  expect "missing Rollback heading fails" 1 "$rn" check-unreleased server
good; sed -i 's/^- box >= 0.1.4/- soon/' "$work/SERVER.md"; expect "bad Depends on fails" 1 "$rn" check-unreleased server
good; sed -i '/^- box: apply-realm/d' "$work/SERVER.md";    expect "empty Manual actions on the box fails" 1 "$rn" check-unreleased server
                                                  expect_out "names the empty Manual actions on the box" "Manual actions on the box"
expect "unknown component fails" 1 "$rn" check-unreleased db

# --- cut ----------------------------------------------------------------------------------------------------------------
good; expect "cut succeeds" 0 "$rn" cut server 0.2.0 2026-12-01
f="$work/SERVER.md"
[ "$(grep -c '^## Unreleased' "$f")" = 1 ] && pass "one Unreleased after cut" || fail "one Unreleased after cut"
grep -q '^## 0.2.0 — 2026-12-01$' "$f" && pass "new section heading" || fail "new section heading"
[ "$(grep -c -- '- Roles come from the token (A37).' "$f")" = 1 ] && pass "duplicate line removed" || fail "duplicate line removed"
! awk '/^## 0.2.0/ {on=1; next} on && /^## / {exit} on' "$f" | grep -q '### Applied automatically' && pass "Applied automatically with only 'none' removed" || fail "Applied automatically with only 'none' removed"
awk '/^## 0.2.0/ {on=1; next} on && /^## / {exit} on' "$f" | grep -q '### Rollback' && pass "Rollback none kept" || fail "Rollback none kept"
grep -q '^## 0.1.2 — 2026-11-05$' "$f" && pass "older release untouched" || fail "older release untouched"
expect "fresh template is not ready" 1 "$rn" check-unreleased server
expect "second cut of the same version refused" 1 "$rn" cut server 0.2.0 2026-12-02
expect "cut of a not-ready file refused" 1 "$rn" cut server 0.3.0 2026-12-02
expect "bad version refused" 1 "$rn" cut server 0.3 2026-12-02
expect "bad date refused" 1 "$rn" cut server 0.3.0 12/02/2026

# --- check-released / section ------------------------------------------------------------------------------------------
expect "released section found" 0 "$rn" check-released server 0.2.0
expect "older section found" 0 "$rn" check-released server 0.1.2
expect "missing section fails" 1 "$rn" check-released server 0.9.9
expect "0.1.2 is not matched by 0.1.20" 1 "$rn" check-released server 0.1.20
"$rn" section server 0.2.0 > "$work/out" 2>&1; grep -q 'Depends on' "$work/out" && grep -q 'box >= 0.1.4' "$work/out" && ! grep -q 'Older' "$work/out" && pass "section prints only that release" || fail "section prints only that release"
expect "section of a missing version fails" 1 "$rn" section server 0.9.9


# --- pr-body --------------------------------------------------------------------------------------------------------------
cat > "$work/BOX.md" <<'EOF'
# box release notes

## Unreleased

### Changes

### Applied automatically

### Manual actions on the box

### Rollback

### Depends on

## 0.1.4 — 2026-12-01

### Changes

- New roles step (INFRA-25).

### Manual actions on the box

- box: sportconnect-setup, then apply-realm-production.sh apply (INFRA-25).

### Rollback

- none
EOF
cat > "$work/SERVER.md" <<'EOF'
# server release notes

## Unreleased

### Changes

## 0.2.0 — 2026-12-01

### Changes

- Roles from the token (A37).

### Applied automatically

- The cache entry shrinks to 1 or 0 (A37).

### Manual actions on the box

- none

### Rollback

- Previous release still works.

### Depends on

- box >= 0.1.4
EOF
"$rn" pr-body box:0.1.4 server:0.2.0 > "$work/pr" 2>&1; rc=$?
[ $rc -eq 0 ] && pass "pr-body succeeds" || fail "pr-body succeeds ($(head -c 200 "$work/pr"))"
grep -qF '**Release order:** box 0.1.4 -> server 0.2.0' "$work/pr" && pass "pr-body shows the release order" || fail "pr-body shows the release order"
[ "$(grep -n '^## box 0.1.4' "$work/pr" | cut -d: -f1)" -lt "$(grep -n '^## server 0.2.0' "$work/pr" | cut -d: -f1)" ] && pass "pr-body keeps the order given" || fail "pr-body keeps the order given"
awk '/^## box 0.1.4/ {on=1; next} /^## server/ {on=0} on' "$work/pr" | grep -q 'Manual action needed on the box' && pass "manual-action marker on the box block" || fail "manual-action marker on the box block"
! awk '/^## server 0.2.0/ {on=1; next} on' "$work/pr" | grep -q 'Manual action needed' && pass "no marker when the manual action is none" || fail "no marker when the manual action is none"
grep -q '### Applied automatically' "$work/pr" && grep -q '### Manual actions on the box' "$work/pr" && grep -q '### Changes' "$work/pr" && pass "pr-body has the three groups" || fail "pr-body has the three groups"
expect "pr-body of a missing version fails" 1 "$rn" pr-body server:9.9.9
expect "pr-body with a bad argument fails" 1 "$rn" pr-body server
expect "pr-body with no argument fails" 1 "$rn" pr-body

# --- CRLF files (a Windows checkout) ------------------------------------------------------------------------------------
good; sed -i 's/$/\r/' "$work/SERVER.md"; expect "CRLF file is ready" 0 "$rn" check-unreleased server
expect "CRLF cut succeeds" 0 "$rn" cut server 0.4.0 2026-12-03
grep -q $'\r' "$work/SERVER.md" && fail "cut output has no CR" || pass "cut output has no CR"

# --- the *-version.sh check integration (uses the repository's own notes) ------------------------------------------------
unset RELEASE_NOTES_DIR
for c in server client chat box; do
  RELEASE_NOTES_DIR="$work/empty" expect "$c-version.sh check fails when the version has no section" 1 "$here/$c-version.sh" check
done
for c in server client chat box; do
  expect "$c-version.sh check passes in this repository" 0 "$here/$c-version.sh" check
done

echo
if [ "$fails" -gt 0 ]; then echo "$fails case(s) FAILED"; exit 1; fi
echo "all cases passed"
