import { seedAuthenticatedSession, seedResultsRecordsOnNextLoad } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-GL-38: dialog-scoped visual regression for the session detail's Result section and the record
 * dialog, same harness shape as app-session-detail-modal.spec.ts (the dialog only, not the full page),
 * across the standard 3 breakpoints.
 *
 * Both states use the Pickleball fixture "Sunday pickup run" made ONGOING by `overrides.resultsOngoing`
 * with two logged records (`seedResultsRecordsOnNextLoad`): the caller beat the fixture friend 21-18 and
 * lost 15-21. The mock record schema is the badminton one (winner on the left, success / warning tones).
 *
 *  - results-section: the section expanded in the session detail, the two records drawn as cards.
 *  - results-dialog: the "Update results" dialog opened on those two records plus the empty placeholder.
 *
 * Clock frozen at the same instant as every other visual spec (the detail renders relative time).
 */

const FROZEN_TIME = new Date('2026-07-07T19:00:00');
const breakpoints = [375, 768, 1280] as const;

async function openDetail(page: import('@playwright/test').Page, mockSessionId: string, width: number) {
  await page.clock.setFixedTime(FROZEN_TIME);
  await page.setViewportSize({ width, height: 900 });
  await seedResultsRecordsOnNextLoad(mockSessionId);
  await seedAuthenticatedSession(page, '/matches');
  await page.getByRole('button', { name: 'Pickleball' }).click();
  await page.getByRole('button', { name: /Sunday pickup run — View details/ }).click();
  const detail = page.getByRole('dialog', { name: 'Sunday pickup run' });
  await detail.getByRole('button', { name: /Results \(2\)/ }).click();
  await expect(detail.getByTestId('record-card')).toHaveCount(2);
  return detail;
}

for (const width of breakpoints) {
  test(`session results — section @ ${width}px`, async ({ page, mockSessionId }) => {
    const detail = await openDetail(page, mockSessionId, width);
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');
    await expect(detail).toHaveScreenshot(`session-results-section-${width}.png`);
  });

  test(`session results — dialog @ ${width}px`, async ({ page, mockSessionId }) => {
    const detail = await openDetail(page, mockSessionId, width);
    await detail.getByRole('button', { name: 'Update' }).click();
    const dialog = page.getByRole('dialog', { name: 'Update results' });
    await expect(dialog.locator('[data-row-status="placeholder"]')).toHaveCount(1);
    await page.evaluate('document.activeElement && document.activeElement.blur()');
    await page.evaluate('document.fonts.ready');
    await expect(dialog).toHaveScreenshot(`session-results-dialog-${width}.png`);
  });
}
