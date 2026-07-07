## What

<!-- One-paragraph summary of the change. Link the backlog ticket (e.g. HF-10b). -->

## Checklist

- [ ] Tests pass locally (`pnpm test`, `pnpm e2e`, `pnpm test:visual` for client changes; `./gradlew test` for backend)
- [ ] **Client visual changes: compared against the relevant `design-reference-*.html`** (HF-10b requirement); intended diffs re-baselined via `pnpm test:visual --update-snapshots` with the diff explained below
- [ ] New/changed components have Storybook stories for every visual state
- [ ] No hardcoded hex colors or arbitrary px values — design tokens only (client) / no cross-domain `-impl` imports (backend)
- [ ] Docs updated (ticket summary in `docs/`, `PROGRESS.md`, backlog status/deltas)
