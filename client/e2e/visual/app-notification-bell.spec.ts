import type { Page } from '@playwright/test';
import {
  seedAuthenticatedSession,
  seedEmptyNotificationsOnNextLoad,
  seedPaginatedNotificationsOnNextLoad,
} from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-NOTIF-2: dialog-scoped visual regression for the `NotificationBell`
 * popover, matching `app-post-modal.spec.ts` (FEED-11)'s harness shape —
 * `page.getByRole('dialog')`, not full-page (the dimmed backdrop/page
 * content behind it is Home Feed's own full-page spec's concern). Radix's
 * `Popover.Content` renders `role="dialog"` in the DOM (confirmed against
 * `@radix-ui/react-popover`'s source) even though it's visually a floating
 * dropdown, not a centered modal — so this crop approach carries over from
 * the `Dialog`-based precedents unchanged; no `TopBar`-plus-popover region
 * capture needed. No `name` filter on `getByRole('dialog')` since nothing
 * else in these tests renders a second dialog.
 *
 * 3 states x 3 breakpoints = 9 baselines — scoped down from `NotificationBell`'s
 * full 6 Storybook stories (user decision at pickup): `loading`/`error` are
 * transient states already covered by Storybook, and no other visual-regression
 * spec in this suite baselines a loading/error state either.
 *  - empty: `seedEmptyNotificationsOnNextLoad` (new MSW override,
 *    `notificationsEmpty`, same shape as `feedEmpty`) — the default fixture
 *    always has 3 seeded notifications, so this state needs its own override
 *    rather than a fixture edit that would break the populated/with-load-more
 *    states and the existing functional `notification-bell.spec.ts` journey.
 *  - populated: the default fixture (`defaultNotificationsState` in
 *    `handlers/notifications.ts`) — 2 unread (one aggregated to 2 actors), 1
 *    read — already covers this, same data the functional journey spec uses.
 *  - with-load-more: `seedPaginatedNotificationsOnNextLoad` (new fixture, 11
 *    items — one more than the list's page size of 10 — same "genuine second
 *    page" reasoning as FEED-10's `seedPaginatedFeedOnNextLoad`).
 *
 * Clock frozen at the same instant as every other visual-regression spec in
 * this suite (`formatRelativeTime` determinism). All three fixtures' notification
 * timestamps are in 2026-08, after this frozen instant — `formatRelativeTime`'s
 * `minutes < 1` branch also catches negative diffs, so every row deterministically
 * renders "just now" regardless of which fixture is in play, same accepted
 * behavior `app-post-modal.spec.ts` already documented for its own comment
 * timestamps.
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

async function openBell(page: Page) {
  await page.getByRole('button', { name: 'Notifications' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const width of breakpoints) {
  test(`notification bell — empty @ ${width}px`, async ({ page, mockSessionId }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedEmptyNotificationsOnNextLoad(mockSessionId);
    await seedAuthenticatedSession(page);

    const dialog = await openBell(page);
    await expect(dialog.getByText("You're all caught up.")).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`notification-bell-empty-${width}.png`);
  });

  test(`notification bell — populated @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page);

    const dialog = await openBell(page);
    await expect(
      dialog.getByText('Priya Shah and 1 other commented on "Sunday pickup run"'),
    ).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`notification-bell-populated-${width}.png`);
  });

  test(`notification bell — with-load-more @ ${width}px`, async ({ page, mockSessionId }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedPaginatedNotificationsOnNextLoad(mockSessionId);
    await seedAuthenticatedSession(page);

    const dialog = await openBell(page);
    const loadMoreButton = dialog.getByRole('button', { name: 'Load more' });
    await expect(loadMoreButton).toBeVisible();
    // The row list is its own internal scroll container (max-h-96
    // overflow-y-auto) — "Load more" sits below the fold with 11 seeded
    // rows, so it wouldn't actually appear in the screenshot without this.
    await loadMoreButton.scrollIntoViewIfNeeded();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`notification-bell-with-load-more-${width}.png`);
  });
}
