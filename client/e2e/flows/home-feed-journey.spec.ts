import { seedAuthenticatedSession, seedEmptyUpcomingMatchesOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * HF-11: the 7(+1)-step Home Feed journey (HF epic § HF-11). Feed/PostCard
 * are real now (FEED-1, usePersonalFeed via e2e/mocks/handlers/feed.ts's
 * stateful fixture — 3 posts: mockPost/mockGroupPost owned by the logged-in
 * test user "Jordan Lee" (Badminton, sportId 1), mockBasketballPost owned by
 * a friend "Priya Shah" (Pickleball, sportId 3)). SportSwitcher is real now
 * too (SPORT-1, via e2e/mocks/handlers/sport.ts's mockSportProfiles fixture).
 * Trending hashtags are real now too (FEED-6, via feed.ts's
 * `GET /api/hashtags/trending` handler — a single `mockHashtag`, `fridayrun`).
 * Group broadcasts are real now too (FEED-7, via groups.ts's single
 * `mockGroup`/feed.ts's single `mockBroadcastPost` — "Friday Night Football",
 * replacing the old mock array's 2 rows). Auto-waiting assertions only; no
 * sleeps.
 *
 * Premise corrections vs the epic's literal steps (user-approved; see the
 * backlog entry's deltas): the fixture user holds a profile for every sport
 * the catalog serves, so step 7 asserts HF-2's at-cap behavior
 * (SPORT-5: now opens an explanatory dialog rather than rendering aria-disabled).
 *
 * CLIENT-SESSION-1 update: matches are real now (modules/session via
 * e2e/mocks/handlers/sessions.ts's stateful fixtures — mockSession/Pickleball,
 * mockGroupSession/Badminton, mockOwnedGroupSession/Pickleball). The old
 * spots-left/full CTA is gone — every card shows a status badge + a
 * "View details" CTA, which now has a real destination (step 6, rewritten).
 * CLIENT-SESSION-9 update: "View details" opens SessionDetailModal in place instead of
 * navigating to /matches (step 6, rewritten again) — and each card may render a second
 * participation-action button (Join/Accept/Cancel/Leave) next to it, so `matchCtas` below is
 * scoped to "view details" specifically, not every button on the rail card.
 *
 * SPORT-3 update: the real sport catalog shrank to exactly 2 active sports
 * (Badminton, Pickleball — sport-impl's A6). mockUser now holds a profile
 * for both (every available sport), not a "3-sport cap" that's no longer
 * representable at all with only 2 real sports. Step 2 now clicks the
 * "Pickleball" pill (was "Basketball") — the feed narrows to 1 post
 * (unchanged split: 2 posts Badminton, 1 Pickleball), but matches now narrow
 * to 2, not 1 (mockSession AND mockOwnedGroupSession are both Pickleball —
 * with only 2 real sports, the old "one session per sport" 1:1:1 split isn't
 * representable either; Badminton keeps exactly 1 (mockGroupSession)).
 *
 * AUTH-4 update: Home Feed now sits behind ProtectedRoute — step 1 seeds an
 * authenticated session (MSW-backed) instead of a bare page.goto('/').
 *
 * FEED-1 update: step 1 and step 4 now exercise the real feed/like MSW
 * handlers (previously mock-internal, per this file's own former note).
 * Step 8 is new — the delete menu FEED-1 added (no equivalent in the
 * original HF-11 spec, which predates PostCard having any ownership
 * concept).
 *
 * FEED-6 update: step 5 (hashtag click) now asserts the real destination — a
 * modal (`HashtagPostsModal`, user decision — no route) listing the real
 * MSW-backed posts tagged `fridayrun` (mockPost + mockGroupPost, both real
 * fixtures), reachable from both a post's inline tag and the trending card's
 * row. Trending now has exactly 1 row (the real `mockHashtag` fixture),
 * replacing the old mock array's 4 — step 1/2's trending-count assertions
 * are updated accordingly.
 *
 * FEED-7 update: step 1/2's broadcast-count assertions drop from 2 (the old
 * mock array) to 1 (the real `mockBroadcastPost`/`mockGroup` fixture pair) —
 * same reasoning as the FEED-6 trending-count update above. The fixture user
 * is only a `group_member` of `mockGroup`, not owner/admin, so the
 * composer's "Broadcast" toggle never renders in this journey — creating/
 * updating a broadcast isn't covered here (would need an owner/admin
 * fixture, a future ticket's concern if that flow needs its own e2e spec).
 *
 * CLIENT-SESSION-12 update: two new Badminton, `mockGroup`-linked `SCHEDULED` sessions
 * (`mockInvitedSession`/`mockRequestedSession`, seeded for that ticket's own visual-regression
 * fixtures) now also count as "upcoming" for mockUser here — `useUpcomingMatches` reads every
 * `SCHEDULED`/`ONGOING` session from a group mockUser belongs to, regardless of mockUser's own
 * participation status. Step 1/3's unfiltered rail count rises from 3 to 4 (`UpcomingMatches`'
 * own `maxVisible=4` cap, not the full 5 — one of the two new sessions is pushed below the fold).
 * Step 2's Pickleball-filtered count is unaffected — both new sessions are Badminton.
 */

test('Home Feed journey', async ({ page }) => {
  const upcoming = page.getByRole('region', { name: 'Upcoming matches' });
  const trending = page.getByRole('region', { name: 'Trending hashtags' });
  const broadcasts = page.getByRole('region', { name: 'Group broadcasts' });
  const matchCtas = upcoming.getByRole('button', { name: /view details/i });

  await test.step('1. load — shell, switcher, feed, and all three rail blocks render', async () => {
    await seedAuthenticatedSession(page);
    await expect(page.getByText('SportHub', { exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Sport filter' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(3);
    // CLIENT-SESSION-12: 5 upcoming sessions now exist, capped to maxVisible=4 — see this file's
    // own top comment.
    await expect(matchCtas).toHaveCount(4);
    await expect(trending.getByRole('button')).toHaveCount(1);
    await expect(broadcasts.getByRole('button')).toHaveCount(1);
  });

  await test.step('2. pickleball pill — feed and matches filter; trending/broadcasts unchanged', async () => {
    await page.getByRole('button', { name: 'Pickleball', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('article')).toContainText('Priya Shah');
    await expect(matchCtas).toHaveCount(2);
    await expect(upcoming).toContainText('Sunday pickup run');
    await expect(trending.getByRole('button')).toHaveCount(1);
    await expect(broadcasts.getByRole('button')).toHaveCount(1);
  });

  await test.step('3. "All" — filters clear', async () => {
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByRole('article')).toHaveCount(3);
    await expect(matchCtas).toHaveCount(4); // CLIENT-SESSION-12 — see step 1's comment.
  });

  await test.step('4. like toggle — fills and increments, reverts on second click', async () => {
    const like = page.getByRole('button', { name: 'Like' }).first();
    await expect(like).toContainText('3'); // Jordan Lee's own post, first in feed order
    await like.click();

    const unlike = page.getByRole('button', { name: 'Unlike' }).first();
    await expect(unlike).toHaveAttribute('aria-pressed', 'true');
    await expect(unlike).toContainText('4');
    await unlike.click();

    const reverted = page.getByRole('button', { name: 'Like' }).first();
    await expect(reverted).toHaveAttribute('aria-pressed', 'false');
    await expect(reverted).toContainText('3');
  });

  await test.step('5. hashtags — clicking opens a modal with the real filtered posts', async () => {
    const postTag = page.getByRole('article').first().getByRole('button', { name: '#fridayrun' });
    await expect(postTag).toBeEnabled();
    await postTag.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '#fridayrun' })).toBeVisible();
    // mockPost + mockGroupPost are both tagged 'fridayrun'; mockBasketballPost isn't.
    await expect(dialog.getByRole('article')).toHaveCount(2);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();

    // No navigation — the modal doesn't change the URL.
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('article')).toHaveCount(3);

    // Same destination, reached from the trending card's row instead.
    const trendingTag = trending.getByRole('button', { name: /^#fridayrun/ });
    await expect(trendingTag).toBeEnabled();
    await trendingTag.click();
    await expect(dialog.getByRole('heading', { name: '#fridayrun' })).toBeVisible();
    await expect(dialog.getByRole('article')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  await test.step('6. match CTA — "View details" opens SessionDetailModal in place, no navigation (CLIENT-SESSION-9)', async () => {
    await matchCtas.first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // No navigation — the modal opens over Home Feed, not the Matches page.
    await expect(page).toHaveURL('/');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  // SPORT-5 reverses HF-2 here: this step used to assert the pill was aria-disabled once
  // every catalog sport was held. A disabled control cannot explain itself, so the pill now
  // always fires, re-reads the catalogue, and opens a dialog that states the situation.
  await test.step('7. "Add sport" — every catalog sport already held opens the explanatory dialog (SPORT-5, reverses HF-2)', async () => {
    const addSport = page.getByRole('button', { name: 'Add sport' });
    await expect(addSport).toBeVisible();
    await expect(addSport).not.toHaveAttribute('aria-disabled', 'true');

    await addSport.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Nothing left to add')).toBeVisible();
    // The completeness claim is only made because the re-read succeeded — a failed one
    // shows "Could not load sports" with a retry instead.
    await expect(dialog.getByText(/added every sport available/)).toBeVisible();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step('8. delete — the "..." menu only appears on the caller\'s own posts, and removes them', async () => {
    const firstArticle = page.getByRole('article').first();
    // Jordan Lee's own post (first in feed order) has the menu; Priya Shah's does not.
    await expect(firstArticle.getByRole('button', { name: 'Post options' })).toBeVisible();
    const lastArticle = page.getByRole('article').last();
    await expect(lastArticle.getByRole('button', { name: 'Post options' })).toHaveCount(0);

    await firstArticle.getByRole('button', { name: 'Post options' }).click();
    await page.getByRole('menuitem', { name: 'Delete post' }).click();
    await expect(page.getByRole('article')).toHaveCount(2);
  });
});

/*
 * Regression test — found live 2026-09-22 investigating a user report that
 * `DiscoverTimeFilter`'s Before/After buttons "can't be selected" on the rail's "Join a match"
 * modal (`SessionDiscoverModal`). Root cause: a *modal* `Dialog` (default `modal=true`) sets
 * `pointer-events: none` on `<body>` while open and restores `auto` only on its own Content node;
 * `Popover`'s portaled content is a *sibling* of that Content under `<body>`, not a descendant, so
 * it inherited `none` — visually on top, but every click passed straight through to whatever
 * Dialog content sat underneath (here, a `SessionCard` title in the results grid). Fixed at the
 * shared primitive (`shared/ui/popover.tsx`: `pointer-events-auto` on `PopoverContent`), so it
 * covers every `Popover` usage, not just this one, including `DiscoverLocationFilter` in this same
 * modal (its own trigger/popover opening and button-click interactions are covered below too).
 *
 * No unit/component (Vitest) test could have caught this: jsdom doesn't do real CSS
 * cascade/pointer-events hit-testing, and this component's own jsdom test couldn't even get the
 * popover to report `open` reliably once nested in a real Dialog. Only a real-browser test proves
 * the click actually lands on the right element — hence a dedicated e2e spec rather than folding
 * this into the main journey above, which never opens this modal at all (the main journey's
 * fixture user always has non-empty upcoming matches, and "Join a match" only renders in the rail's
 * empty state).
 *
 * Two further, related layering issues were found live while writing this test but are
 * DELIBERATELY NOT covered/fixed here — filed as their own client backlog tickets instead of only
 * living in this comment (CLAUDE.md's API Change Discipline "file the moment it comes out" rule
 * extends to any deferred finding, not just API changes): (1) pressing Escape while the Time/
 * Location popover is open closes the whole Dialog too, not just the popover; (2) clicking into
 * `DiscoverLocationFilter`'s search text input focuses it only momentarily — the Dialog's own
 * focus trap immediately yanks focus back inside itself since the input, like the popover it's in,
 * lives outside the Dialog's DOM subtree, so typing into it is currently impossible. Both share
 * this same "Popover portals outside the Dialog it's nested in" root cause but need Radix
 * `FocusScope`/`DismissableLayer` fixes distinct from the pointer-events one above.
 */
test('Home Feed — the "Join a match" modal\'s Time filter popover is actually clickable', async ({
  page,
  mockSessionId,
}) => {
  await seedEmptyUpcomingMatchesOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page);

  await expect(page.getByText('No upcoming matches.')).toBeVisible();
  await page.getByRole('button', { name: 'Join a match' }).click();

  const dialog = page.getByRole('dialog', { name: 'Discover today session' });
  await expect(dialog).toBeVisible();
  // A real discoverable session card renders underneath the filter pills — exactly the element
  // the original bug's clicks silently landed on instead of the popover content.
  await expect(dialog.getByText('Weekend 5-a-side')).toBeVisible();

  await dialog.getByRole('button', { name: 'Time' }).click();
  const beforeBtn = page.getByRole('button', { name: 'Before', exact: true });
  await expect(beforeBtn).toBeVisible();
  await beforeBtn.click();
  await expect(beforeBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('button', { name: /^Before \d{2}:\d{2}$/ })).toBeVisible();
});

/**
 * CLIENT-SESSION-29 (2026-09-23) — regression test for the fix underlying this ticket's item 5
 * and CLIENT-SESSION-28: `shared/ui/floatingPortalContainer.ts` makes a `Popover` nested inside
 * this app's own `Dialog` portal into the Dialog's own Content node instead of `document.body`,
 * so it stops tripping the Dialog's `FocusScope` focus trap. Covers both symptoms that root cause
 * produced — `DiscoverTimeFilter`'s Hour/Minute inputs not committing (this ticket) and
 * `DiscoverLocationFilter`'s search input being untypeable (CLIENT-SESSION-28) — in one spec,
 * since both are the same fix. Real browser only: jsdom can't reproduce `FocusScope`'s
 * focus-trap interactions any more than it could reproduce the pointer-events bug above.
 */
test('Home Feed — the "Join a match" modal\'s Time/Location popovers stay focused and typeable', async ({
  page,
  mockSessionId,
}) => {
  await seedEmptyUpcomingMatchesOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page);

  await page.getByRole('button', { name: 'Badminton' }).click();
  await page.getByRole('button', { name: 'Join a match' }).click();
  const dialog = page.getByRole('dialog', { name: 'Discover today session' });
  await expect(dialog).toBeVisible();

  // --- Time filter: Hour/Minute edits auto-apply once a direction is set ---
  await dialog.getByRole('button', { name: 'Time' }).click();
  await page.getByRole('button', { name: 'Before', exact: true }).click();
  const hourInput = page.getByLabel('Hour');
  await hourInput.click();
  await expect(hourInput).toBeFocused();
  await hourInput.fill('05');
  // Tab to the Minute input (still inside the same popover), not a bare `.blur()` — CI (Linux)
  // reported `getByLabel('Hour')` gone entirely after `.blur()` (not a value mismatch, a genuine
  // absence for the full retry window), never reproduced locally across several runs. `.blur()`
  // doesn't move focus anywhere specific, unlike a real user action; Tab is deterministic and
  // matches how a caller would actually move between the two fields.
  await hourInput.press('Tab');
  await expect(page.getByLabel('Minute')).toBeFocused();
  await expect(hourInput).toHaveValue('05');
  await expect(dialog.getByRole('button', { name: /^Before 05:\d{2}$/ })).toBeVisible();
  // Closes the Time popover so it doesn't shadow the Location trigger below. The exact
  // "Before HH:MM" pattern (not just /^Before/) disambiguates the trigger from the popover's own
  // inner "Before" direction-toggle button, which also matches a bare /^Before/ prefix now that
  // the trigger's own label dropped its "Start " prefix.
  await page.getByRole('button', { name: /^Before \d{2}:\d{2}$/ }).click();

  // --- Location filter: the search input actually accepts typed text ---
  await dialog.getByRole('button', { name: /^Location/ }).click();
  const searchInput = dialog.getByLabel('Search locations');
  await searchInput.click();
  await expect(searchInput).toBeFocused();
  await searchInput.fill('river');
  await expect(searchInput).toHaveValue('river');
});

/**
 * CLIENT-SESSION-29 (2026-09-24) — regression for a bug CI caught and this suite had been unable to
 * reproduce: tabbing out of the Time filter's Hour input closed the whole Time popover.
 *
 * Root cause: during Tab, `document.activeElement` is briefly `<body>` between the Hour blur and
 * the Minute focus. Committing the Hour changes the discover filters, and — because the query has no
 * placeholder data — a *non-empty* result grid is removed synchronously inside that window. The
 * Dialog's FocusScope treats "body focused + node removed" as focus lost and focuses its own
 * container, which the nested Popover read as focus outside itself and dismissed. Fixed twice:
 * `DiscoverTimeFilter` defers the parent update (`startTransition`) so focus lands first, and the
 * shared `PopoverContent` ignores focus landing on the Dialog's own container.
 *
 * Why every earlier run passed locally: the mock's time filter empties the list at the moment of the
 * commit, so nothing was ever removed. Real data (and CI, depending on the hour) has cards. This test
 * strips the time params from the request so the results stay non-empty — the exact condition that
 * triggers the bug.
 */
test('Home Feed — tabbing out of the Time filter\'s Hour input keeps the popover open with results on screen', async ({
  page,
  mockSessionId,
}) => {
  await page.route('**/api/sessions/discover**', async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.delete('startTime');
    url.searchParams.delete('startTimeFilter');
    await route.continue({ url: url.toString() });
  });
  await seedEmptyUpcomingMatchesOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page);

  await page.getByRole('button', { name: 'Badminton' }).click();
  await page.getByRole('button', { name: 'Join a match' }).click();
  const dialog = page.getByRole('dialog', { name: 'Discover today session' });
  await expect(dialog.getByText('Weekend 5-a-side')).toBeVisible();

  await dialog.getByRole('button', { name: 'Time' }).click();
  await page.getByRole('button', { name: 'Before', exact: true }).click();
  // Results are non-empty here, so the Hour commit below has a card grid to remove.
  await expect(dialog.getByText('Weekend 5-a-side')).toBeVisible();

  const hourInput = page.getByLabel('Hour');
  await hourInput.click();
  await hourInput.fill('05');
  await hourInput.press('Tab');

  await expect(page.getByLabel('Minute')).toBeFocused();
  await expect(hourInput).toHaveValue('05');
  await expect(dialog.getByRole('button', { name: /^Before 05:\d{2}$/ })).toBeVisible();
});

/**
 * CLIENT-SESSION-27 (2026-09-24) — regression for Escape closing the whole "Join a match" Dialog
 * along with the filter popover that was open inside it.
 *
 * Root cause: `@radix-ui/react-dialog` (and `react-menu`) resolved `react-dismissable-layer` to
 * 1.1.15 while `react-popover` resolved 1.1.19. The layer stack ("only the highest layer answers
 * Escape") is a module-level context, so two installed copies meant two independent stacks — the
 * Dialog and the Popover each saw themselves as the only, hence highest, layer and both handled
 * the same Escape `keydown`. Fixed by a `pnpm.overrides` entry pinning a single copy, so this is
 * a dependency-graph regression: any future install that re-splits the copies fails here. Real
 * browser only — jsdom has no bearing on it (Radix's own layer wiring, not DOM or CSS).
 */
test('Home Feed — Escape closes only the open Time/Location popover, then a second Escape closes the "Join a match" modal', async ({
  page,
  mockSessionId,
}) => {
  await seedEmptyUpcomingMatchesOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page);

  await page.getByRole('button', { name: 'Badminton' }).click();
  await page.getByRole('button', { name: 'Join a match' }).click();
  const dialog = page.getByRole('dialog', { name: 'Discover today session' });
  await expect(dialog).toBeVisible();

  // --- Time filter ---
  await dialog.getByRole('button', { name: 'Time' }).click();
  const beforeBtn = page.getByRole('button', { name: 'Before', exact: true });
  await expect(beforeBtn).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(beforeBtn).toBeHidden();
  await expect(dialog).toBeVisible();

  // --- Location filter ---
  await dialog.getByRole('button', { name: /^Location/ }).click();
  const searchInput = dialog.getByLabel('Search locations');
  await expect(searchInput).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(searchInput).toBeHidden();
  await expect(dialog).toBeVisible();

  // --- With no popover open, Escape still dismisses the Dialog itself ---
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

/**
 * CLIENT-SESSION-32 (2026-09-24) — a Dialog-nested filter popover must stay inside the dialog's
 * own box on narrow screens.
 *
 * `DialogContent` is `overflow-hidden` and (since CLIENT-SESSION-29) a nested popover portals into
 * that same node, so anything overhanging the dialog is clipped rather than escaping to `<body>`.
 * Radix Popper only collided against the *viewport*, so at 375px the Location popover (`w-72`,
 * started at the trigger's left edge) fit the viewport yet ran ~17px past the 343px-wide dialog and
 * lost its right border. Fixed in the shared `PopoverContent` (`collisionBoundary` = the dialog's
 * Content node + `max-w` of the available width). Real browser only — jsdom has no layout, so it
 * can't measure this. 320px is the narrowest supported phone: there even `w-72` (288px) exceeds
 * the 288px dialog, so the `max-w` cap (not just Radix's shift) is what's exercised.
 */
for (const viewportWidth of [375, 320]) {
  test(`Home Feed — every "Join a match" filter popover stays inside the dialog @ ${viewportWidth}px`, async ({
    page,
    mockSessionId,
  }) => {
    await seedEmptyUpcomingMatchesOnNextLoad(mockSessionId);
    await page.setViewportSize({ width: viewportWidth, height: 900 });
    await seedAuthenticatedSession(page);

    await page.getByRole('button', { name: 'Badminton' }).click();
    await page.getByRole('button', { name: 'Join a match' }).click();
    const dialog = page.getByRole('dialog', { name: 'Discover today session' });
    await expect(dialog.getByText('Weekend 5-a-side')).toBeVisible();

    const triggers = [
      dialog.getByRole('button', { name: 'Time', exact: true }),
      dialog.getByRole('button', { name: /^Location/ }),
      dialog.getByRole('button', { name: 'Status', exact: true }),
      dialog.getByRole('button', { name: 'Fee', exact: true }),
    ];
    const popover = dialog.locator('[data-slot="popover-content"]');

    for (const trigger of triggers) {
      await trigger.click();
      await expect(popover).toBeVisible();
      // Let Radix's positioning settle (it measures after the first paint).
      await expect
        .poll(async () => {
          const dialogBox = await dialog.boundingBox();
          const popoverBox = await popover.boundingBox();
          if (!dialogBox || !popoverBox) return 'not rendered';
          const tolerance = 0.5;
          const inside =
            popoverBox.x >= dialogBox.x - tolerance &&
            popoverBox.y >= dialogBox.y - tolerance &&
            popoverBox.x + popoverBox.width <= dialogBox.x + dialogBox.width + tolerance &&
            popoverBox.y + popoverBox.height <= dialogBox.y + dialogBox.height + tolerance;
          return inside ? 'inside' : `outside: popover ${JSON.stringify(popoverBox)} dialog ${JSON.stringify(dialogBox)}`;
        })
        .toBe('inside');
      // Escape closes only the popover (CLIENT-SESSION-27), so the next trigger is reachable.
      await page.keyboard.press('Escape');
      await expect(popover).toBeHidden();
      await expect(dialog).toBeVisible();
    }
  });
}
