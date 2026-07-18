import type { Page } from '@playwright/test';
import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * FEED-11: visual regression for the post comment modal (`CommentSection`),
 * the same pixel-diffing layer HF-10a/b added for Home Feed but missing here
 * since FEED-2 shipped it without a Playwright `visual-regression` spec.
 *
 * Unlike Home Feed, this captures just the dialog element
 * (`page.getByRole('dialog')`), not the full page — the dimmed backdrop
 * behind it is Home Feed content already covered by its own visual spec, so
 * diffing it a second time here would just be redundant surface area.
 *
 * FEED-12 shipped before this ticket was picked up, so `/posts/:postId` is
 * directly navigable — no click-through-the-feed setup needed, per the
 * ticket's own guidance for that case.
 *
 * 3 states x 3 breakpoints = 9 baselines, matching Home Feed's HF-10a/b shape:
 *  - empty: a post with zero seeded comments (mockBasketballPost, id 4)
 *  - populated: mockPost's existing root comment (mockComment) plus one reply
 *    added live through the real "Reply" UI, to catch CommentItem's nested-
 *    reply indentation — no second fixture set invented, per the ticket's own
 *    constraint.
 *  - draft: same populated thread, with text typed into the composer (not
 *    submitted) to capture the Post button's enabled treatment — `empty`/
 *    `populated` already show its default disabled treatment, so this is the
 *    one extra state needed to cover FEED-2's disabled->enabled addendum.
 *
 * Clock frozen before navigation, same as Home Feed's spec, for
 * formatRelativeTime determinism. The populated/draft states' reply is
 * created live against MSW-1's standalone mock server (a separate Node
 * process, NOT inside the frozen browser context) using the real wall-clock
 * time — but formatRelativeTime's `minutes < 1` branch also catches negative
 * diffs, so a reply created "after" a frozen-in-the-past page clock still
 * renders the same deterministic "just now", regardless of which real date
 * the suite actually runs on.
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

async function openPostModal(page: Page, postId: number) {
  await page.clock.setFixedTime(FROZEN_TIME);
  await seedAuthenticatedSession(page, `/posts/${postId}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const width of breakpoints) {
  test(`post modal — empty @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const dialog = await openPostModal(page, 4);
    await expect(dialog.getByText('No comments yet. Be the first to comment!')).toBeVisible();
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`post-modal-empty-${width}.png`);
  });

  test(`post modal — populated @ ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const dialog = await openPostModal(page, 1);
    await expect(dialog.getByText('Nice one, count me in for next week!')).toBeVisible();

    // Add one reply live, through the real UI, to catch CommentItem's
    // nested-reply indentation — reconciles via invalidate+refetch (same as
    // every other comment mutation against MSW-1's stateful fake backend).
    // Two "Post" buttons exist once the reply box is open — the reply's own
    // (inside the comments list) precedes the main composer's in DOM order,
    // so .first() is the reply's, not the composer's.
    await dialog.getByRole('button', { name: 'Reply' }).click();
    await dialog.getByLabel('Reply to Priya Shah').fill('Count me in too!');
    await dialog.getByRole('button', { name: 'Post' }).first().click();
    await expect(dialog.getByText('Count me in too!')).toBeVisible();
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`post-modal-populated-${width}.png`);
  });

  test(`post modal — draft (composer has text, Post button enabled) @ ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const dialog = await openPostModal(page, 1);
    await expect(dialog.getByText('Nice one, count me in for next week!')).toBeVisible();

    await dialog.getByLabel('Add a comment').fill('Great match!');
    await expect(dialog.getByRole('button', { name: 'Post' }).first()).toBeEnabled();
    await page.evaluate('document.fonts.ready');

    await expect(dialog).toHaveScreenshot(`post-modal-draft-${width}.png`);
  });
}
