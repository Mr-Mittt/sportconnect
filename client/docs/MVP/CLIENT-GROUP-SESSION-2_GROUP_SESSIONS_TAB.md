# CLIENT-GROUP-SESSION-2 · The group's Sessions tab, and no slot information for a group session

**Status:** `TODO`
**Type:** New Feature · **Depends on:** SESSION-GROUP-2
**Filed:** 2026-11-19, from the owner's group-session specification ("How it shows": a Sessions tab between Posts and Chat, grouped into collapsible Ongoing, Scheduled and History; the modal hides taken and open slots). The owner decided a PREPARING session is not mixed into Scheduled.

- **Tab:** `'sessions'` added to `GroupTabKey`/`TABS` in `GroupTabs.tsx` between Posts and Chat, rendered by `GroupsPage` (`{activeGroupTab === 'sessions' && ...}`), label in `groups.json` en/vi; existing `GroupTabs`, `GroupsPage` tests and `group-settings.spec.ts` updated.
- **Content:** collapsible groups built on `Collapsible`: **Ongoing**, **Scheduled**, **Preparing** (own group, only shown when it has sessions), **History** (loads on first expand). One hook per bucket on `GET /sessions/group/{groupId}?bucket=` with a `sessionKeys` group key invalidated by create, join and cancel; `SessionCard` rows; `EmptyHint` for empty groups; a "Create session" button opens the group-mode form (CLIENT-GROUP-SESSION-1). Opening a card opens `SessionDetailModal`.
- **No slot information:** for a group session the taken and open slot rows are hidden in the three places of `SessionDetailModal` (`WhoSection` summary and view rows, `InformationSection`, the Players header count and `PlayersMeter`) and in `SessionCard`'s participant count.
- All strings en and vi; stories for the tab states; MSW handler for the bucket query; Playwright flow (open the tab, expand History, create from the tab).

**Consumer census:** `GroupTabs`, `GroupsPage`, `groups.json`, `SessionDetailModal`, `SessionDetailSections`, `SessionCard`, `useSessionDetailModalData`, `sessionKeys`, e2e mocks, `BASELINE-UPDATE-1` rows for the new visual surfaces.

---
