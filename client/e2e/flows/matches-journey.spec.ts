import {
  mockBadmintonLocation,
  mockDiscoverableSession,
  mockFriend,
  mockLocation,
  seedAuthenticatedSession,
  seedSoftDeletedSportProfileOnNextLoad,
} from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-SESSION-1: the Matches page's create/list/join/leave/cancel journey
 * (client/docs/BACKLOG_MVP.md § CLIENT-SESSION-1), mirroring
 * feed-groups-journey.spec.ts's structure (one `test()`, sequential
 * `test.step()`s).
 *
 * Fixtures (e2e/mocks/fixtures.ts): `mockSession` — a standalone session
 * mockUser created, not yet joined by them (participantCount 0), reused
 * across the join/leave/cancel steps. `mockGroupSession` — group-linked to
 * `mockGroup` (mockUser is a group_member, not owner/admin, and didn't
 * create it), proving the Cancel button stays hidden for a session the
 * caller can only join/leave. `mockLocation` (Pickleball, sportId 3) backs
 * the create-session step's "search an existing location" flow — no
 * paste-a-link/resolve coverage here (that's LocationPicker's own
 * component/Storybook tests; e2e/mocks/handlers/locations.ts's
 * resolve-maps-url handler exists but isn't exercised by this spec).
 *
 * CLIENT-SESSION-4: step 6 also exercises "Invite your friend" (`mockFriend`)
 * and "Auto approve join request" in the create form. Step 7 is the
 * approval-queue journey against `mockOwnedGroupSession` ("Ladder night",
 * mockUser is group_owner there — `canManage` true) — `mockSessionJoinRequest`/
 * `mockSecondSessionJoinRequest` are pre-seeded REQUESTED rows (same
 * "pre-seed the other person's row" precedent as group-invitations.spec.ts's
 * `mockGroupJoinRequest`, since this mock server has no second live
 * authenticated identity to actually request-join as).
 *
 * CLIENT-SESSION-6: the page split into a Discover grid (`region` "Discover
 * sessions") and a collapsible "My sessions" panel (`region` "My sessions").
 * Steps 1-8 above all target sessions that render inside "My sessions"
 * (mockUser created or belongs to the group) and are unaffected by the
 * split — `page.getByText`/`getByRole('button', {name: ...})` finds them
 * regardless of which panel they're in. Step 9 covers what's actually new:
 * `mockDiscoverableSession` ("Weekend 5-a-side", created by someone else,
 * Badminton — a sport mockUser holds an active profile for) starts out visible
 * only in Discover; joining it moves it into "My sessions" without a
 * reload (both queries share the `sessionKeys.all` invalidation root).
 * Step 10 covers the search filter and the panel collapse toggle.
 *
 * CLIENT-SESSION-8: steps 3b/3c (inserted right after step 3, reusing the same "Sunday pickup
 * run" session before step 4 cancels it). 3b covers the Discussion section — reading the seeded
 * comment (`e2e/mocks/handlers/sessions.ts`'s `commentsState`) and posting a new one via
 * `POST /api/sessions/{sessionId}/comments`. 3c covers the heart button — like then unlike via
 * `POST`/`DELETE /api/sessions/{sessionId}/like`, asserting the count round-trips 0 -> 1 -> 0.
 *
 * CLIENT-SESSION-29 (2026-09-23, user decision): /matches drops the "All" sport pill — the
 * switcher always has exactly one real sport active, defaulting to the caller's first sport
 * profile (`mockSportProfiles`: Badminton, then Pickleball). Both Discover and "My sessions" now
 * filter by that one active sport (`useMatchesPageData`'s `mySessionDateGroups` filter dropped its
 * `activeSport === 'all'` branch), so this journey's fixtures — split across Badminton
 * (`mockGroupSession`/"Friday 5-a-side", `mockDiscoverableSession`/"Weekend 5-a-side",
 * `mockRequestedSession`/"Wednesday scrimmage") and Pickleball (`mockSession`/"Sunday pickup run",
 * `mockOwnedGroupSession`/"Ladder night", every session created mid-test) — need an explicit pill
 * switch inserted (steps 4b/5c/8d/10d) each time a later step needs the other sport's sessions
 * visible. `mockRequestedSession`'s own section is the one exception: `GET /sessions/requested`
 * has no `sportId` param, so "Requested sessions" (step 10c) is never sport-filtered.
 */

test('Matches journey', async ({ page }) => {
  // CLIENT-SESSION-29 (2026-09-23): this was already the suite's longest single test; the 4
  // sport-pill-switch steps the "no All pill" rewrite added (4b/5c/8d/10d) pushed its real
  // wall-clock time to ~29s against Playwright's 30s default — passing, but with no real margin,
  // so any ordinary machine-load variance tips it into a timeout on the final step. This is a
  // real regression this session's own rewrite introduced (found by actually timing a passing
  // run with `--reporter=list`, not assumed) — the fix is more budget for genuinely more work,
  // not a papered-over race.
  test.setTimeout(60000);
  await seedAuthenticatedSession(page, '/matches');

  await test.step('1. load — defaults to the first sport profile (Badminton); its own sessions render', async () => {
    // CLIENT-SESSION-29 (2026-09-23, user decision) — /matches no longer has an "All" pill; the
    // sport switcher defaults to the caller's first sport profile (mockSportProfiles: Badminton,
    // then Pickleball). "Sunday pickup run" (mockSession, Pickleball) is NOT visible yet — only
    // Badminton-sport sessions render until the caller switches pills.
    await expect(page.getByRole('button', { name: 'All' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Badminton' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Friday 5-a-side')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Discover sessions' }).getByText('Weekend 5-a-side'),
    ).toBeVisible();
    await expect(page.getByText('Sunday pickup run')).not.toBeVisible();
  });

  await test.step('2. sport filter narrows the list to the clicked sport (no "All" to restore)', async () => {
    // Switches to Pickleball and stays there — steps 3/3b/3c below all operate on mockSession
    // (Pickleball). There is no "All" pill to fall back to once a specific sport is picked.
    await page.getByRole('button', { name: 'Pickleball' }).click();
    await expect(page.getByText('Sunday pickup run')).toBeVisible();
    await expect(page.getByText('Friday 5-a-side')).not.toBeVisible();
  });

  await test.step('3. join the standalone session (creator never sees Leave)', async () => {
    await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sunday pickup run' });
    // mockSession has a real chosen capacity (10, CLIENT-SESSION-3) — not the 9999 "uncapped"
    // sentinel — so Players shows "N/10", not the plain "N" the sentinel would render.
    // CLIENT-SESSION-10 renamed the section "Participants" -> "Players".
    await expect(dialog.getByText('Players (0/10)')).toBeVisible();

    await dialog.getByRole('button', { name: 'Join' }).click();
    await expect(dialog.getByText('Players (1/10)')).toBeVisible();
    await expect(dialog.getByText('Jordan Lee', { exact: true })).toBeVisible();
    // mockSession is created by the test user themselves — once JOINED, the creator doesn't get
    // the plain participant Leave action (CLIENT-SESSION-10 post-ship), so neither Join nor Leave
    // shows here. The Leave mutation itself is still exercised e2e on a session the test user
    // didn't create — step 5b, mockGroupSession's card.
    await expect(dialog.getByRole('button', { name: 'Leave' })).not.toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Join' })).not.toBeVisible();

    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('3b. Discussion section — reads the seeded comment, posts a new one (CLIENT-SESSION-8)', async () => {
    await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sunday pickup run' });
    const discussion = dialog.getByRole('region', { name: 'Discussion' });

    await expect(discussion.getByText('What time are we meeting at the courts?')).toBeVisible();

    // CLIENT-SESSION-10 moved the composer out of the Discussion region into the dialog's pinned
    // footer (SessionCommentComposer) — scoped from the dialog, not the region, from here on.
    await dialog.getByRole('textbox', { name: 'Add a comment' }).fill('7pm works for me!');
    await dialog.getByRole('button', { name: 'Post comment' }).click();
    await expect(discussion.getByText('7pm works for me!')).toBeVisible();

    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('3c. heart button likes/unlikes the session (CLIENT-SESSION-8)', async () => {
    await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sunday pickup run' });

    const likeButton = dialog.getByRole('button', { name: 'Like', exact: true });
    await expect(likeButton).toHaveText('0');
    await likeButton.click();

    const unlikeButton = dialog.getByRole('button', { name: 'Unlike', exact: true });
    await expect(unlikeButton).toHaveText('1');
    await unlikeButton.click();
    await expect(dialog.getByRole('button', { name: 'Like', exact: true })).toHaveText('0');

    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  // Step 4 used to cancel the standalone session here (Cancel session -> reason -> Confirm
  // cancel -> Cancelled badge). CLIENT-SESSION-10 post-ship: the Cancel session button was
  // removed from SessionDetailModal entirely (user decision) — there is no longer any UI path to
  // cancel a session, so that flow is gone rather than reworked. Numbering keeps the gap (jumps
  // 3c -> 5) rather than renumbering every later step + docs/E2E_OVERVIEW.md's table for a purely
  // cosmetic concern.

  // mockGroupSession ("Friday 5-a-side") is Badminton — switch back from Pickleball (step 2).
  // CLIENT-SESSION-29 (2026-09-23): with no "All" pill, every step touching a session from a
  // different sport than the one currently active needs its own explicit pill switch.
  await test.step('4b. switch back to Badminton for the group session steps', async () => {
    await page.getByRole('button', { name: 'Badminton' }).click();
    await expect(page.getByText('Friday 5-a-side')).toBeVisible();
  });

  await test.step('5. a group session the caller only belongs to — Join/Leave still work', async () => {
    await page.getByRole('button', { name: /Friday 5-a-side — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Friday 5-a-side' });

    await expect(dialog.getByRole('button', { name: 'Join' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('5b. Join and Leave directly from the session card, no dialog required (CLIENT-SESSION-9)', async () => {
    await page.getByRole('button', { name: /Friday 5-a-side — Join/ }).click();
    await expect(page.getByRole('button', { name: /Friday 5-a-side — Leave/ })).toBeVisible();

    await page.getByRole('button', { name: /Friday 5-a-side — Leave/ }).click();
    await expect(page.getByRole('button', { name: /Friday 5-a-side — Join/ })).toBeVisible();
  });

  // Steps 6-8 create/manage Pickleball sessions (Ladder night is Pickleball too) — switch back.
  await test.step('5c. switch back to Pickleball for the create/approval-queue steps', async () => {
    await page.getByRole('button', { name: 'Pickleball' }).click();
    await expect(page.getByText('Sunday pickup run')).toBeVisible();
  });

  await test.step('6. create a standalone session, searching an existing location', async () => {
    await page.getByRole('button', { name: 'Create session' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create your session' });
    await createDialog.getByLabel(/^Sport/).selectOption('pickleball');

    // CLIENT-SESSION-5: "Choose location" is now a favorites dropdown trigger, not a direct
    // LocationPicker opener — "Choose a location…" is its trailing item.
    await createDialog.getByRole('button', { name: 'Choose location' }).click();
    await page.getByRole('menuitem', { name: 'Choose a location…' }).click();
    const locationDialog = page.getByRole('dialog', { name: 'Choose a location' });
    await locationDialog.getByLabel('Search locations').fill('Riverside');
    await locationDialog.getByRole('button', { name: 'Search' }).click();
    await locationDialog.getByText(mockLocation.name, { exact: true }).click();

    await expect(createDialog.getByText(mockLocation.name)).toBeVisible();
    // Starts at (Date/Hour/Minute) is left on its own default (Today/one-hour-from-now/:00) —
    // CLIENT-SESSION-2 pre-fills it on open, so there's nothing to fill in here anymore.
    await createDialog.getByLabel(/^Session title/).fill('New pickup game');
    await createDialog.getByLabel(/^Duration in minutes/).fill('90');
    await createDialog.getByLabel(/^Open slot/).fill('10');
    // CLIENT-SESSION-21: Fee has no default anymore (SESSION-24) — check "Free" explicitly so
    // this session lands SCHEDULED, not PREPARING (the PREPARING path is covered by its own
    // journey, step 11 below).
    await createDialog.getByRole('checkbox', { name: 'Free' }).check();

    // CLIENT-SESSION-4: invite a friend (dismissible badge) and check auto-approve (reveals the
    // inline warning, no separate confirm step).
    await createDialog.getByLabel('Search friends to invite').fill(mockFriend.fullName);
    await createDialog.getByRole('button', { name: new RegExp(mockFriend.fullName) }).click();
    await expect(createDialog.getByText(mockFriend.fullName, { exact: true })).toBeVisible();
    const autoApproveCheckbox = createDialog.getByRole('checkbox', { name: 'Auto approve join request' });
    await autoApproveCheckbox.check();
    await expect(createDialog.getByText('Everyone can join without your review.')).toBeVisible();

    await createDialog.getByRole('button', { name: 'Create session' }).click();

    await expect(createDialog).not.toBeVisible();
    await expect(page.getByText('New pickup game')).toBeVisible();
  });

  await test.step('7. approval queue: approve one requester, reject the other', async () => {
    await page.getByRole('button', { name: /Ladder night — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Ladder night' });
    const approvalSection = dialog.getByRole('region', { name: 'Waiting for approval' });

    await expect(approvalSection.getByText('Waiting for approval (2)')).toBeVisible();
    await expect(approvalSection.getByText('Alex Chen')).toBeVisible();
    await expect(approvalSection.getByText('Morgan Diaz')).toBeVisible();

    await approvalSection
      .getByText('Alex Chen')
      .locator('xpath=ancestor::div[contains(@class, "justify-between")][1]')
      .getByRole('button', { name: 'Approve' })
      .click();
    await expect(approvalSection.getByText('Alex Chen')).not.toBeVisible();
    await expect(dialog.getByText('Alex Chen', { exact: true })).toBeVisible(); // now a real participant

    const morganRow = approvalSection
      .getByText('Morgan Diaz')
      .locator('xpath=ancestor::div[contains(@class, "justify-between")][1]');
    await morganRow.getByRole('button', { name: 'Reject' }).click();
    await dialog.getByLabel('Reject reason for Morgan Diaz').fill('Ladder is full for this cycle.');
    await dialog.getByRole('button', { name: 'Confirm reject' }).click();

    await expect(approvalSection).not.toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('8. favorite a location in LocationPicker, then pick it from the favorites dropdown', async () => {
    await page.getByRole('button', { name: 'Create session' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create your session' });
    await createDialog.getByLabel(/^Sport/).selectOption('pickleball');

    await createDialog.getByRole('button', { name: 'Choose location' }).click();
    await expect(page.getByText('No favorites yet.')).toBeVisible();
    await page.getByRole('menuitem', { name: 'Choose a location…' }).click();

    const locationDialog = page.getByRole('dialog', { name: 'Choose a location' });
    await locationDialog.getByLabel('Search locations').fill('Riverside');
    await locationDialog.getByRole('button', { name: 'Search' }).click();

    const favoriteHeart = locationDialog.getByRole('button', {
      name: `Favorite ${mockLocation.name}`,
    });
    await favoriteHeart.click();
    await expect(
      locationDialog.getByRole('button', { name: `Unfavorite ${mockLocation.name}` }),
    ).toBeVisible();

    await locationDialog.getByText(mockLocation.name, { exact: true }).click();
    await expect(createDialog.getByText(mockLocation.name)).toBeVisible();

    // Reopen the dropdown — the just-favorited location now appears instead of "No favorites yet."
    await createDialog.getByRole('button', { name: 'Change location' }).click();
    await expect(page.getByText('No favorites yet.')).not.toBeVisible();
    await page.getByRole('menuitem', { name: mockLocation.name }).click();
    await expect(createDialog.getByText(mockLocation.name)).toBeVisible();

    await createDialog.getByRole('button', { name: 'Close' }).click();
  });

  // mockDiscoverableSession ("Weekend 5-a-side") is Badminton — switch back from Pickleball.
  await test.step('8d. switch back to Badminton for the Discover-filter/join steps', async () => {
    await page.getByRole('button', { name: 'Badminton' }).click();
    await expect(
      page.getByRole('region', { name: 'Discover sessions' }).getByText('Weekend 5-a-side'),
    ).toBeVisible();
  });

  await test.step('8c. Status/Open slots/Fee filters narrow the Discover results (CLIENT-SESSION-29)', async () => {
    const discoverSection = page.getByRole('region', { name: 'Discover sessions' });
    // mockDiscoverableSession ("Weekend 5-a-side"): status SCHEDULED, capacity 10,
    // participantCount 4 (6 open slots), feeType FREE. Run before step 9 joins it — once joined
    // it drops out of Discover entirely, so this step must come first.
    await expect(discoverSection.getByText('Weekend 5-a-side')).toBeVisible();

    // Status: the mock's own baseline is SCHEDULED-only regardless of the param, so checking
    // "Preparing" (never true here) proves the param round-trips without a false-positive match.
    await discoverSection.getByRole('button', { name: 'Status' }).click();
    await page.getByRole('checkbox', { name: 'Preparing' }).check();
    await expect(discoverSection.getByText('No sessions to discover on Today.')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Preparing' }).uncheck();
    await page.keyboard.press('Escape');
    await expect(discoverSection.getByText('Weekend 5-a-side')).toBeVisible();

    // Open slots: 7 excludes it (6 open < 7), 6 keeps it (6 open >= 6). Direct inline input
    // (CLIENT-SESSION-29 revision, 2026-09-23) — no trigger button/Popover to open first.
    await discoverSection.getByLabel('Minimum open slots').fill('7');
    await expect(discoverSection.getByText('No sessions to discover on Today.')).toBeVisible();
    await discoverSection.getByLabel('Minimum open slots').fill('6');
    await expect(discoverSection.getByText('Weekend 5-a-side')).toBeVisible();
    await discoverSection.getByRole('button', { name: 'Clear open slots filter' }).click();

    // Fee: FREE matches, SPLIT doesn't.
    await discoverSection.getByRole('button', { name: 'Fee' }).click();
    await page.getByRole('checkbox', { name: 'Split cost' }).check();
    await expect(discoverSection.getByText('No sessions to discover on Today.')).toBeVisible();
    await page.getByRole('checkbox', { name: 'Split cost' }).uncheck();
    await page.keyboard.press('Escape');
    await expect(discoverSection.getByText('Weekend 5-a-side')).toBeVisible();
  });

  await test.step('9. discover a session created by someone else, join it, and see it move into My sessions', async () => {
    const discoverSection = page.getByRole('region', { name: 'Discover sessions' });
    const mySessionsSection = page.getByRole('region', { name: 'My sessions' });

    await expect(discoverSection.getByText(mockDiscoverableSession.title!)).toBeVisible();
    await expect(mySessionsSection.getByText(mockDiscoverableSession.title!)).not.toBeVisible();

    await discoverSection
      .getByRole('button', { name: new RegExp(`${mockDiscoverableSession.title} — View details`) })
      .click();
    const dialog = page.getByRole('dialog', { name: mockDiscoverableSession.title! });

    // CLIENT-SESSION-17: the read-only "Session detail" summary — `mockDiscoverableSession`
    // (Badminton) carries `#ref` attribute values. A `LIST` `#ref` (`match/racketModel`) renders
    // as chips, a `SINGLE` `#ref` (`match/racketBrand`) and an own node (`match/format`) as plain
    // values — proving `SessionAttributesSummary` maps a `#ref` node's stored shape onto the right
    // render type by `cardinality`, not its inherited scalar `type`.
    const detailSummary = dialog.getByRole('region', { name: 'Session detail' });
    await expect(detailSummary.getByText('Yonex Astrox 99')).toBeVisible();
    await expect(detailSummary.getByText('Li-Ning Axforce 90')).toBeVisible();
    await expect(detailSummary.getByText('Yonex', { exact: true })).toBeVisible();
    await expect(detailSummary.getByText('Doubles')).toBeVisible();

    await dialog.getByRole('button', { name: 'Join' }).click();
    await expect(dialog.getByRole('button', { name: 'Leave' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();

    // autoApprove is true on this fixture, so the join is instant — the session no longer
    // qualifies for discover (already joined) and now shows up in My sessions instead.
    await expect(discoverSection.getByText(mockDiscoverableSession.title!)).not.toBeVisible();
    await expect(mySessionsSection.getByText(mockDiscoverableSession.title!)).toBeVisible();
  });

  await test.step('10. search filters Discover (server-side title param, CLIENT-SESSION-22), and the panel toggle hides/shows My sessions', async () => {
    // No "All" pill to click here anymore (CLIENT-SESSION-29) — this step is sport-agnostic
    // (search text + panel toggle), so it just continues on whatever sport step 8d left active
    // (Badminton).
    const discoverSection = page.getByRole('region', { name: 'Discover sessions' });

    await page.getByRole('textbox', { name: 'Search sessions' }).fill('nonexistent-session-title');
    // Debounced (400ms) before the real GET /sessions/discover?title=... request fires.
    await expect(discoverSection.getByText('No sessions to discover on Today.')).toBeVisible();
    await page.getByRole('textbox', { name: 'Search sessions' }).fill('');

    await expect(page.getByRole('region', { name: 'My sessions' })).toBeVisible();
    await page.getByRole('button', { name: 'Hide my sessions' }).click();
    await expect(page.getByRole('region', { name: 'My sessions' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Show my sessions' }).click();
    await expect(page.getByRole('region', { name: 'My sessions' })).toBeVisible();
  });

  await test.step('10b. the Date filter pill adds a second collapsible section (CLIENT-SESSION-22, absorbs CLIENT-SESSION-25)', async () => {
    const discoverSection = page.getByRole('region', { name: 'Discover sessions' });

    // Trigger label is "Today" here, not "Date" — exactly one date (today) is selected by
    // default, and CLIENT-SESSION-29 (2026-09-23) labels the trigger with that date itself
    // rather than the generic "Date" whenever exactly one is selected.
    await discoverSection.getByRole('button', { name: 'Today', exact: true }).click();
    // The checklist row's accessible name carries its own date, e.g. "Tomorrow (2nd Aug)"
    // (CLIENT-SESSION-29: <ordinal-day> <month-abbrev>, was "dd/MM") — unlike the section header
    // below, which stays bare "Tomorrow".
    const tomorrowOption = /^Tomorrow \(\d{1,2}(st|nd|rd|th) [A-Za-z]{3}\)$/;
    await page.getByRole('checkbox', { name: tomorrowOption }).check();
    await expect(discoverSection.getByRole('button', { name: 'Date (2)' })).toBeVisible();
    // Newly-checked dates start collapsed — a chevron + count header, no fetch until expanded.
    await expect(discoverSection.getByRole('button', { name: /Expand Tomorrow \(\d+\)/ })).toBeVisible();

    // Uncheck it again so later steps' assertions against the Discover grid aren't affected by a
    // second open section.
    await page.getByRole('checkbox', { name: tomorrowOption }).uncheck();
    await page.keyboard.press('Escape');
  });

  await test.step('10c. Requested sessions section shows the caller\'s own pending request (CLIENT-SESSION-29, SESSION-42)', async () => {
    const requestedSection = page.getByRole('region', { name: 'Requested sessions' });
    await expect(requestedSection).toBeVisible();
    // mockRequestedSession ("Wednesday scrimmage") — mockUser holds a pre-seeded REQUESTED row.
    await expect(requestedSection.getByText('Wednesday scrimmage')).toBeVisible();
    await expect(
      requestedSection.getByRole('button', { name: /Wednesday scrimmage.*Cancel/s }),
    ).toBeVisible();
  });

  // Step 11 creates a Pickleball session again — switch back from Badminton (step 8d).
  await test.step('10d. switch back to Pickleball for the final create step', async () => {
    await page.getByRole('button', { name: 'Pickleball' }).click();
    await expect(page.getByText('Sunday pickup run')).toBeVisible();
  });

  await test.step('11. create without location/fee shows the Preparing warning; completing both via the detail modal flips it to Scheduled (CLIENT-SESSION-21, SESSION-24)', async () => {
    await page.getByRole('button', { name: 'Create session' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create your session' });
    await createDialog.getByLabel(/^Sport/).selectOption('pickleball');
    await createDialog.getByLabel(/^Session title/).fill('Needs setup');
    await createDialog.getByLabel(/^Duration in minutes/).fill('60');
    await createDialog.getByLabel(/^Open slot/).fill('6');

    await expect(createDialog.getByText(/will be created as/)).toBeVisible();
    await createDialog.getByRole('button', { name: 'Create session' }).click();
    await expect(createDialog).not.toBeVisible();

    await page.getByRole('button', { name: /Needs setup — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Needs setup' });
    await expect(dialog.getByText('Preparing')).toBeVisible();
    const completion = dialog.getByRole('region', { name: 'Complete session setup' });
    await expect(completion.getByText('Location and Fee', { exact: true })).toBeVisible();

    await completion.getByRole('button', { name: 'Choose location' }).click();
    const locationDialog = page.getByRole('dialog', { name: 'Choose a location' });
    await locationDialog.getByLabel('Search locations').fill('Riverside');
    await locationDialog.getByRole('button', { name: 'Search' }).click();
    await locationDialog.getByText(mockLocation.name, { exact: true }).click();
    await expect(completion.getByText(mockLocation.name)).toBeVisible();

    await completion.getByRole('checkbox', { name: 'Free' }).check();
    await completion.getByRole('button', { name: 'Save' }).click();

    await expect(dialog.getByText('Scheduled')).toBeVisible();
    await expect(dialog.getByRole('region', { name: 'Complete session setup' })).not.toBeVisible();
  });
});

/*
 * CLIENT-SESSION-17 Part B: `#ref` session attributes render as single-/multi-select sourced from
 * the creator's own profile, with an "Other…" nested modal for a value not on the profile, and the
 * selections are folded into the `POST /api/sessions` `attributes` payload under each node's path.
 * Its own `test()` (not a step of the journey above) so it gets a fresh page and its own 30s
 * budget — the journey test is already long. Badminton has a session attribute schema with two
 * `#ref` nodes; Pickleball (used by the journey's create step) has none.
 */
test('Matches — Session detail #ref attributes render, and land in the create payload', async ({
  page,
}) => {
  let createBody: Record<string, unknown> | undefined;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/sessions') && request.method() === 'POST') {
      createBody = request.postDataJSON() as Record<string, unknown>;
    }
  });

  await seedAuthenticatedSession(page, '/matches');

  await page.getByRole('button', { name: 'Create session' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Create your session' });
  await createDialog.getByLabel(/^Sport/).selectOption('badminton');
  await createDialog.getByRole('button', { name: 'Session detail' }).click();

  // LIST `#ref` — one checkbox per racket model on the creator's profile
  // (fixture: gear/racketModels = two entries).
  await expect(createDialog.getByLabel('Yonex Astrox 99')).toBeVisible();
  await expect(createDialog.getByLabel('Li-Ning Axforce 90')).toBeVisible();
  await createDialog.getByLabel('Yonex Astrox 99').check();

  // SINGLE `#ref` — the profile has nothing at its path, so the control is just a dropdown ending
  // in "Other…" + a hint.
  await expect(createDialog.getByText('Nothing on your profile to pick from')).toBeVisible();

  // The LIST `#ref`'s "Other…" opens a nested modal; the added value becomes a checked draft.
  await createDialog.getByRole('button', { name: 'Other…' }).click();
  const otherDialog = page.getByRole('dialog', { name: /^Add — / });
  await otherDialog.getByLabel('Value').fill('Victor Thruster');
  await otherDialog.getByRole('button', { name: 'Add' }).click();
  await expect(otherDialog).not.toBeVisible();
  await expect(createDialog.getByLabel('Victor Thruster')).toBeChecked();

  // Fill the remaining required fields and create — the `#ref` selections must reach the payload.
  await createDialog.getByLabel(/^Session title/).fill('Ref payload session');
  await createDialog.getByRole('button', { name: 'Choose location' }).click();
  await page.getByRole('menuitem', { name: 'Choose a location…' }).click();
  const locationDialog = page.getByRole('dialog', { name: 'Choose a location' });
  await locationDialog.getByLabel('Search locations').fill('Smashers');
  await locationDialog.getByRole('button', { name: 'Search' }).click();
  await locationDialog.getByText(mockBadmintonLocation.name, { exact: true }).click();
  await expect(createDialog.getByText(mockBadmintonLocation.name)).toBeVisible();
  await createDialog.getByLabel(/^Duration in minutes/).fill('60');
  await createDialog.getByLabel(/^Open slot/).fill('4');
  await createDialog.getByRole('button', { name: 'Create session' }).click();

  await expect(createDialog).not.toBeVisible();
  await expect(page.getByText('Ref payload session')).toBeVisible();
  expect(createBody?.attributes).toEqual({
    // the LIST `#ref` — the checked profile option + the "Other…" draft, keyed by node path
    'match/racketModel': ['Yonex Astrox 99', 'Victor Thruster'],
    // the own node's `defaultValue`, seeded by SportAttributesFields
    'match/format': 'Doubles',
  });
});

/*
 * SPORT-10 §2e: the reactivate nudge on a non-profile page also covers "Yes" (reactivate),
 * exercised here on the Matches page.
 */
test('Matches — a deactivated sport pill nudge, "Yes" reactivates it', async ({
  page,
  mockSessionId,
}) => {
  await seedSoftDeletedSportProfileOnNextLoad(mockSessionId); // Pickleball soft-deleted
  await seedAuthenticatedSession(page, '/matches');

  const filter = page.getByRole('group', { name: 'Sport filter' });
  const pickleball = filter.getByRole('button', { name: 'Pickleball' });
  await expect(pickleball).toHaveClass(/text-text-muted/);

  await pickleball.click();
  const nudge = page.getByRole('dialog');
  await expect(nudge.getByText('This sport profile is down. Do you want to bring it up?')).toBeVisible();
  await nudge.getByRole('button', { name: 'Yes' }).click();
  await expect(nudge).toBeHidden();

  // Reactivated: the muted "Reactivate Pickleball" pill is gone, Pickleball is a normal pill.
  await expect(
    filter.getByRole('button', { name: 'Pickleball', description: 'Reactivate Pickleball' }),
  ).toBeHidden();
  await expect(filter.getByRole('button', { name: 'Pickleball' })).not.toHaveClass(/text-text-muted/);
});
