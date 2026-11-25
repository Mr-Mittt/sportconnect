# CLIENT-SESSION-59 · The scoreboard has no default columns

**Status:** `TODO`
**Type:** Enhancement (one config for the client and the server) · **Depends on:** SESSION-53 (its 2026-11-25 rework)
**Filed:** 2026-11-25, from the SESSION-53 rework (owner decision): `record.scoreboard.columns` is the one place a sport says which statistics it shows, and the server collects exactly those; with **no defaults at all**, a sport that lists none collects nothing. The client's own fallback has to go with it, so the two sides behave the same.

Today `scoreboard.ts` (CLIENT-GL-49) draws the columns `games`, `wins`, `losses` (`defaultColumns` in `record-ui-v1.json`) when a schema has no `record.scoreboard`, or none of its `columns` is supported. That fallback is removed:

- A schema with no `record.scoreboard.columns`, or with none the catalog supports, shows **no scoreboard** in the Result section and in the record dialog (the record list and the dialog's rows are unaffected). The in-session table is still hidden by `scoreboard.enabled: false` as before.
- Remove `defaultColumns` from `COMPETITIVE.scoreboard` in `record-ui-v1.json`. **The server's `StatsCatalogSpec` reads this file** (it fails when `COMPETITIVE.scoreboard.columns` differs from the server's catalog, which is the drift guard for the shared stats list), and until this ticket it also checks that every `defaultColumns` entry is a catalog stat: make that check tolerate the key being gone in the same change. `defaultSort` stays: it is the order of what is shown, not what is collected.
- The badminton example `badminton-record-schema-v1.json` lists its columns, `groupBy` and ranking order explicitly (it is also the example in `documentation/md/RECORD_SCHEMA_CONTRACT.md`), so nothing relies on a default.
- Update `scoreboard.test.ts`, `recordSchema.test.ts` and the component tests that assert the default, and the Storybook story that shows it.

**No catalog test is needed on the client:** the server side of the contract reads the client's `record-ui-v1.json` itself, so the two lists cannot drift unnoticed (SESSION-53).

**Out of scope:** the statistics screens (CLIENT-SESSION-41), the admin switch (SPORT-19), a metric record type's own catalog (SESSION-58).

**Tests:** Vitest for each case (no block, empty `columns`, only unknown columns, a valid list), mutation check; a scoped e2e that opens a session of a sport with no scoreboard block. Visual baselines: the Result section of a session with no scoreboard changes; list it in the open baseline ticket (`BASELINE-UPDATE-1` now).
