import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/*
 * HF-8: accessibility + responsive gate for the Home Feed. Two invariants at
 * every supported breakpoint:
 *  1. no horizontal overflow (the page never scrolls sideways)
 *  2. axe reports zero critical/serious violations
 * Runs against the real app (same e2e project as the functional flows), so a
 * regressing token or layout change fails CI, not a manual audit.
 */

const breakpoints = [375, 768, 1280] as const;

async function loadHomeFeed(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/');
  // Rail content present = page fully assembled
  await expect(page.getByRole('region', { name: 'Upcoming matches' })).toBeVisible();
}

async function gatingViolations(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.impact} ${v.id} (${v.nodes.length} nodes): ${v.help}`);
}

for (const width of breakpoints) {
  test(`home feed @ ${width}px — no horizontal overflow`, async ({ page }) => {
    await loadHomeFeed(page, width);
    // String form on purpose: the e2e tsconfig has no DOM lib (same idiom as
    // the visual spec's 'document.fonts.ready')
    const overflow = await page.evaluate<number>(
      'document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth',
    );
    expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0);
  });

  test(`home feed @ ${width}px — axe reports no critical/serious violations`, async ({ page }) => {
    await loadHomeFeed(page, width);
    expect(await gatingViolations(page)).toEqual([]);
  });
}

test('sport-filtered state — axe reports no critical/serious violations', async ({ page }) => {
  await loadHomeFeed(page, 1280);
  await page.getByRole('button', { name: 'Basketball', exact: true }).click();
  // Filtered feed rendered (single basketball post from mock data)
  await expect(page.getByRole('article')).toHaveCount(1);
  expect(await gatingViolations(page)).toEqual([]);
});
