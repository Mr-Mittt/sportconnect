import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-NOTIF-1: the TopBar bell + dropdown journey (client/docs/BACKLOG_MVP.md §
 * CLIENT-NOTIF-1). Fixtures (`e2e/mocks/handlers/notifications.ts`'s
 * `defaultNotificationsState`): 2 unread (id 1 aggregated to 2 distinct actors
 * — Priya Shah + Hana Kim — exercising the "and 1 other" text; id 2 a single-
 * actor join-request-created), 1 already-read (id 3, join-request-approved,
 * no actor). All three point at `mockSession` ("Sunday pickup run").
 */
test('Notification bell journey', async ({ page }) => {
  await seedAuthenticatedSession(page);

  await test.step('1. unread badge shows the initial count, list not fetched yet', async () => {
    await expect(page.getByLabel('2 unread notifications')).toHaveText('2');
  });

  await test.step('2. opening the bell fetches and renders the list, aggregated text included', async () => {
    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByText('Priya Shah and 1 other commented on "Sunday pickup run"')).toBeVisible();
    await expect(page.getByText('Priya Shah requested to join "Sunday pickup run"')).toBeVisible();
    await expect(page.getByText('Your request to join "Sunday pickup run" was approved')).toBeVisible();
  });

  await test.step('3. clicking an unread row marks it read, decrements the badge, and opens the session modal in place — no navigation', async () => {
    await expect(page).toHaveURL(/^http:\/\/localhost:5174\/$/);
    await page.getByText('Priya Shah and 1 other commented on "Sunday pickup run"').click();
    await expect(page.getByRole('dialog', { name: 'Sunday pickup run' })).toBeVisible();
    // Still on Home Feed — CLIENT-NOTIF-1's shell-level modal overlays the current page rather
    // than navigating to /matches (a first draft did that; it also had a real bug — MatchesPage
    // only reads its own `?session=` search param once, at mount).
    await expect(page).toHaveURL(/^http:\/\/localhost:5174\/$/);
    await expect(page.getByLabel('1 unread notifications')).toHaveText('1');
  });

  await test.step('4. "Mark all read" clears the remaining unread row and the badge', async () => {
    await page.getByRole('dialog', { name: 'Sunday pickup run' }).getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Notifications' }).click();
    await page.getByRole('button', { name: 'Mark all read' }).click();
    await expect(page.getByRole('button', { name: 'Mark all read' })).not.toBeVisible();
    await expect(page.getByLabel(/unread notifications/)).not.toBeVisible();
  });
});

/*
 * Regression coverage for the exact bug a `/matches?session={id}` navigation had: MatchesPage's
 * own `?session=` search param is only ever read once, at mount (see MatchesPage.tsx's own
 * comment) — so navigating to that same route with a different `?session=` while already on
 * /matches silently did nothing. The shell-level modal (AppShell) sidesteps this entirely: it
 * never touches the URL, so clicking a notification works identically regardless of which page
 * — including /matches itself — the caller was already on.
 */
test('Notification bell journey — clicking a notification while already on /matches', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');

  await page.getByRole('button', { name: 'Notifications' }).click();
  await page.getByText('Priya Shah and 1 other commented on "Sunday pickup run"').click();

  await expect(page.getByRole('dialog', { name: 'Sunday pickup run' })).toBeVisible();
  await expect(page).toHaveURL(/^http:\/\/localhost:5174\/matches$/);
});
