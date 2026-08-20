import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-SESSION-12: dialog-scoped visual regression for SessionDetailModal, matching
 * app-post-modal.spec.ts (FEED-11)'s harness shape — `page.getByRole('dialog')`, not full-page
 * (the dimmed backdrop behind it is Matches/Home Feed/Groups content already covered by their own
 * full-page specs), across the standard 3 breakpoints.
 *
 * 7 states, all reached via real seeded MSW data or a live click, never a Storybook-style direct
 * prop injection:
 *  - not-joined: mockDiscoverableSession, fresh (never joined).
 *  - already-joined: mockGroupSession, joined live via the real Join button first.
 *  - invited: mockInvitedSession — mockUser's own pre-seeded INVITED row (new fixture; this mock
 *    backend has no second live identity to actually invite as, same "pre-seed the other side"
 *    precedent as mockSessionJoinRequest for the approval-queue state below).
 *  - requested: mockRequestedSession — mockUser's own pre-seeded REQUESTED row (new fixture, same
 *    reasoning).
 *  - approval-queue: mockOwnedGroupSession ("Ladder night") — already has 2 pre-seeded REQUESTED
 *    rows from other users; mockUser is the group owner (canManage).
 *  - discussion: mockSession — pre-seeded with one user comment (CLIENT-SESSION-8) and one
 *    SESSION_SYSTEM entry (CLIENT-SESSION-13), so the crop covers both row kinds.
 *  - cancelled: mockCancelledSession (new fixture, pre-set status CANCELLED) — SessionDetailModal's
 *    Cancel session button was removed entirely (CLIENT-SESSION-10), so there is no live UI path
 *    left to reach a CANCELLED session from a fresh SCHEDULED one.
 *
 * Clock frozen at the same instant as every other visual-regression spec in this suite, for
 * consistency (formatRelativeTime determinism — this modal renders "starts in..."-style relative
 * text for scheduledStart).
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

for (const width of breakpoints) {
  test(`session detail modal — not-joined @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    await page.getByRole('button', { name: /Weekend 5-a-side — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Weekend 5-a-side' });
    await expect(dialog.getByRole('button', { name: 'Join' })).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`session-detail-not-joined-${width}.png`);
  });

  test(`session detail modal — already-joined @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    await page.getByRole('button', { name: /Friday 5-a-side — Join/ }).click();
    await expect(page.getByRole('button', { name: /Friday 5-a-side — Leave/ })).toBeVisible();
    await page.getByRole('button', { name: /Friday 5-a-side — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Friday 5-a-side' });
    await expect(dialog.getByRole('button', { name: 'Leave' })).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`session-detail-already-joined-${width}.png`);
  });

  test(`session detail modal — invited (Accept/Decline) @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    await page.getByRole('button', { name: /Tuesday drop-in — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Tuesday drop-in' });
    await expect(dialog.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Decline' })).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`session-detail-invited-${width}.png`);
  });

  test(`session detail modal — requested (pending approval) @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    await page.getByRole('button', { name: /Wednesday scrimmage — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Wednesday scrimmage' });
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`session-detail-requested-${width}.png`);
  });

  test(`session detail modal — approval-queue (owner view) @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    await page.getByRole('button', { name: /Ladder night — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Ladder night' });
    await expect(dialog.getByRole('region', { name: 'Waiting for approval' })).toBeVisible();
    await expect(dialog.getByText('Alex Chen')).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`session-detail-approval-queue-${width}.png`);
  });

  test(`session detail modal — discussion @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Sunday pickup run' });
    await expect(dialog.getByRole('region', { name: 'Discussion' })).toBeVisible();
    await expect(dialog.getByText('What time are we meeting at the courts?')).toBeVisible();
    // CLIENT-SESSION-13: assert the system entry is actually in the crop rather than trusting the
    // screenshot to have caught it — a fixture regression would otherwise silently produce a
    // baseline missing the row it exists to cover.
    await expect(dialog.getByText('Priya Shah joined the session')).toBeVisible();
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`session-detail-discussion-${width}.png`);
  });

  test(`session detail modal — cancelled @ ${width}px`, async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');

    await page.getByRole('button', { name: /Monday night run — View details/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Monday night run' });
    await expect(dialog.getByText('Court unavailable due to maintenance.')).toBeVisible();
    // canJoinOrLeave gates the whole action area off for CANCELLED — callerParticipation is null
    // here, so the only button that could otherwise render is "Join"; its absence proves the gate.
    await expect(dialog.getByRole('button', { name: 'Join' })).toHaveCount(0);
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`session-detail-cancelled-${width}.png`);
  });
}
