# Release notes

One file per image that is released on its own: [SERVER.md](SERVER.md), [CLIENT.md](CLIENT.md), [CHAT.md](CHAT.md) and
[BOX.md](BOX.md) (the box config image: Compose files, Caddyfile, scripts, the realm, the Keycloak JARs). They live here, not next to
the code, so editing one never triggers an image workflow's path filter. Ticket: INFRA-24. The deployment guide (§ 15) says how a
release is cut; this folder says what each release contains and what the owner must run.

## Who writes what

- **Every ticket** adds its lines under `## Unreleased` of each component it changes, in the same PR. A change that needs nothing from
  the owner still says so (`- none`). A component with no change gets no line.
- **`/release <component>`** checks the block, turns it into `## X.Y.Z — date`, writes a fresh template, commits the file with the
  version bump and gives you the section as the release PR description. It never invents a line: a commit whose ticket is missing is put to you first.
- **CI** (`<component>-version.sh check`) fails when the current version has no section, so a hand-made bump cannot skip this.
- **The promote summary** shows the section of the version being promoted, so the reviewer reads it before approving.

## The block

```
## Unreleased

### Changes
- What changes, one line per thing a user or the owner can notice, ticket id in brackets: `- Roles come from the Keycloak token (A37).`

### Applied automatically
- What the deploy does by itself, nobody has to run it: migrations that run at start-up (`- V084 drops the roles tables when the server starts`),
  files the box image installs, new defaults that ship in the image. Left out (or `- none`) when there is nothing.

### Manual actions on the box
- What the owner must run, in order, who and where: `- box: sportconnect-setup, then apply-realm-production.sh apply (INFRA-25).`
  A new environment variable the owner must set, a console step, a restart, belong here too.
- `- none` when the normal promote and deploy are enough.

### Rollback
- Whether the previous release still works against what this one changed: `- V084 drops roles; the previous release does not read them: safe to go back.`
- `- none` when nothing was migrated or changed that the previous release cares about.

### Depends on
- `- server >= 0.2.0` / `- box >= 0.1.4` (a version that must already be on the box), or `- none`.
```

Ready to release means: Changes, Manual actions on the box and Rollback each have a `- ` line; no `TBD`, `TODO`, `XXX`, `FIXME` or
`<angle brackets>`; every Depends on line is `- none` or `- <component> >= X.Y.Z`. `infra/scripts/release-notes.sh check-unreleased
<component>` runs exactly that. Empty subsections, and Applied automatically or Depends on holding only `- none`, are removed when the release is cut.

## The release PR description

`/release` builds the PR description from the sections it just cut (`infra/scripts/release-notes.sh pr-body <component>:<X.Y.Z> ...`):
one block per component in release order, each grouped as above, so the reviewer sees what changes, what is applied by itself and what
needs a manual action on the box, and a component with a manual action carries a marker at the top of its block. The same section is
what the promote summary shows later.

## Release order

`Depends on` is the order for a release of several components. With no dependency the default is box, then server, then chat, then client
(the box carries the realm and scripts the server may need; the client waits for the server API it calls).
