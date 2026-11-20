import type { Locator, Page } from '@playwright/test';
import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-GROUP-SESSION-2: a group's Sessions tab. Three collapsible sections (Today's, Other sessions, History), each with a
 * multi-select status filter on the right, over the SESSION-GROUP-12 endpoints, and the "See all" link of the Posts tab's
 * Today's session shortcut that opens the tab.
 *
 * Uses `mockOwnedGroup` ("Weekend Tennis Ladder"). The mock's `groupSessionsFor` lays sessions out relative to today:
 * ongoing "Night ladder" (started yesterday, ends tomorrow), "Ladder night" (scheduled, noon today), "Early drills" (completed
 * today), "Cancelled today"; "Tomorrow doubles", "Cancelled tomorrow", "Next week draft"; yesterday's "Yesterday evening" and
 * "Yesterday morning" (completed) and "Cancelled yesterday"; "Last week play" 6 days ago; "Long ago play" 40 days ago (outside
 * the first 30-day window).
 */

async function openTab(page: Page) {
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
}

const section = (page: Page, name: string): Locator => page.getByRole('region', { name, exact: true });

async function toggleStatus(page: Page, sectionName: string, status: string) {
  await section(page, sectionName).getByRole('button', { name: /^Filter .* by status$/ }).click();
  await page.getByRole('menuitemcheckbox', { name: status, exact: true }).click();
  await page.keyboard.press('Escape');
}

test('Group Sessions tab: See all, the three sections, their filters, the history dates and Create session', async ({ page }) => {
  await openTab(page);

  await test.step('1. "See all" in the Posts shortcut header opens the Sessions tab', async () => {
    const shortcut = section(page, "Today's session");
    const seeAll = shortcut.getByRole('button', { name: "See all of this group's sessions" });
    await expect(seeAll).toHaveText('See all');
    // Right-aligned: it sits to the right of the title in the same header row.
    const titleBox = await shortcut.getByRole('button', { name: "Today's session", exact: true }).boundingBox();
    const linkBox = await seeAll.boundingBox();
    expect(linkBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width);
    await seeAll.click();
    await expect(page.getByRole('tab', { name: 'Sessions' })).toHaveAttribute('aria-selected', 'true');
    await expect(section(page, "Today's sessions")).toBeVisible();
  });

  const today = section(page, "Today's sessions");
  const others = section(page, 'Other sessions');
  const history = section(page, 'History');

  await test.step("2. Today's lists what overlaps today, ongoing first; finished and cancelled ones are not in the defaults", async () => {
    await expect(today.getByText('Night ladder')).toBeVisible();
    await expect(today.getByText('Ladder night')).toBeVisible();
    const titles = await today.getByText(/^(Night ladder|Ladder night|Early drills|Cancelled today)$/).allTextContents();
    expect(titles).toEqual(['Night ladder', 'Ladder night']);
  });

  await test.step("3. Today's status filter: ticking Completed and Cancelled adds those, in the server's order", async () => {
    await toggleStatus(page, "Today's sessions", 'Completed');
    await expect(today.getByText('Early drills')).toBeVisible();
    await toggleStatus(page, "Today's sessions", 'Cancelled');
    await expect(today.getByText('Cancelled today')).toBeVisible();
    await expect(today.getByRole('button', { name: /^Filter .* by status$/ })).toContainText('Status (5)');
    const titles = await today.getByText(/^(Night ladder|Ladder night|Early drills|Cancelled today)$/).allTextContents();
    expect(titles).toEqual(['Night ladder', 'Ladder night', 'Early drills', 'Cancelled today']);
  });

  await test.step('4. Other sessions starts collapsed; opening it lists tomorrow on, drafts included, cancelled ones only when ticked', async () => {
    await expect(others.getByRole('button', { name: 'Other sessions', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Tomorrow doubles')).toHaveCount(0);
    await others.getByRole('button', { name: 'Other sessions', exact: true }).click();
    await expect(others.getByText('Tomorrow doubles')).toBeVisible();
    await expect(others.getByText('Next week draft')).toBeVisible();
    await expect(others.getByText('Cancelled tomorrow')).toHaveCount(0);
    await toggleStatus(page, 'Other sessions', 'Cancelled');
    await expect(others.getByText('Cancelled tomorrow')).toBeVisible();
  });

  await test.step('5. History: a row for each of the 30 days before today, zero days included; yesterday is open with its sessions (newest end first)', async () => {
    await expect(history.getByRole('button', { name: /^(Expand|Collapse) / })).toHaveCount(30);
    await expect(history.getByRole('button', { name: /^Expand .*\(0\)$/ })).toHaveCount(28);
    const yesterdayRow = history.getByRole('button', { name: /^Collapse .*\(2\)$/ });
    await expect(yesterdayRow).toHaveAttribute('aria-expanded', 'true');
    const titles = await history.getByText(/^(Yesterday evening|Yesterday morning)$/).allTextContents();
    expect(titles).toEqual(['Yesterday evening', 'Yesterday morning']);
    const lastWeekRow = history.getByRole('button', { name: /^Expand .*\(1\)$/ });
    await expect(lastWeekRow).toHaveAttribute('aria-expanded', 'false');
    await expect(history.getByText('Last week play')).toHaveCount(0);
    await lastWeekRow.click();
    await expect(history.getByText('Last week play')).toBeVisible();
    // A day with no finished session opens to a plain line, with no request for its sessions.
    await history.getByRole('button', { name: /^Expand .*\(0\)$/ }).first().click();
    await expect(history.getByText('No session on this day.')).toBeVisible();
  });

  await test.step('6. History: the date 40 days ago is outside the first 30 days; Load the previous 30 days adds 30 more rows', async () => {
    await expect(history.getByText('Long ago play')).toHaveCount(0);
    await history.getByRole('button', { name: 'Load the previous 30 days' }).click();
    await expect(history.getByRole('button', { name: /^(Expand|Collapse) / })).toHaveCount(60);
    await history.getByRole('button', { name: /^Expand .*\(1\)$/ }).click();
    await expect(history.getByText('Long ago play')).toBeVisible();
    await expect(history.getByRole('button', { name: 'Load the previous 30 days' })).toHaveCount(0);
  });

  await test.step('7. History filter: Cancelled adds the cancelled one and the date count changes', async () => {
    await toggleStatus(page, 'History', 'Cancelled');
    await expect(history.getByRole('button', { name: /^Collapse .*\(3\)$/ })).toBeVisible();
    await expect(history.getByText('Cancelled yesterday')).toBeVisible();
  });

  await test.step('8. the filters stay when you leave the tab and come back', async () => {
    await page.getByRole('tab', { name: 'Posts' }).click();
    await page.getByRole('tab', { name: 'Sessions' }).click();
    await expect(section(page, "Today's sessions").getByRole('button', { name: /^Filter .* by status$/ })).toContainText('Status (5)');
    await expect(section(page, 'History').getByRole('button', { name: /^Filter .* by status$/ })).toContainText('Status (2)');
  });

  await test.step('9. Create session opens the form for this group', async () => {
    await page.getByRole('button', { name: 'Create session', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Create session', exact: true });
    await expect(dialog.getByLabel(/^Session title/)).toHaveValue("Weekend Tennis Ladder's session");
  });
});

test('Group Sessions tab: a section with no status asks for one and sends no request', async ({ page }) => {
  await openTab(page);
  await page.getByRole('tab', { name: 'Sessions' }).click();
  const history = section(page, 'History');

  let historyCalls = 0;
  page.on('request', (request) => {
    if (/\/api\/sessions\/group\/\d+\/history/.test(request.url())) historyCalls += 1;
  });
  // Let the dates load first: rows appearing under the trigger while its menu opens moves the page under it.
  await expect(history.getByRole('button', { name: /^(Expand|Collapse) / }).first()).toBeVisible();
  await history.getByRole('button', { name: /^Filter .* by status$/ }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Completed', exact: true }).click();
  await page.keyboard.press('Escape');

  await expect(history.getByText('Select at least one status.')).toBeVisible();
  await expect(history.getByRole('button', { name: /^(Expand|Collapse) / })).toHaveCount(0);
  const before = historyCalls;
  await page.waitForTimeout(300);
  expect(historyCalls).toBe(before);
});

test('Group Sessions tab: a group with no session shows the empty hint today and a row for each of the 30 days in History', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Friday Night Football/ }).click();
  await page.getByRole('tab', { name: 'Sessions' }).click();
  await expect(section(page, "Today's sessions").getByText('No session today.')).toBeVisible();
  // History lists every day of the window whether or not the group has a finished session: 30 rows, every one "(0)".
  const history = section(page, 'History');
  await expect(history.getByRole('button', { name: /^(Expand|Collapse) / })).toHaveCount(30);
  await expect(history.getByRole('button', { name: /\(0\)$/ })).toHaveCount(30);
  // Yesterday is open and says so without a request; the older days are collapsed.
  await expect(history.getByText('No session on this day.')).toHaveCount(1);
  await expect(history.getByRole('button', { name: 'Load the previous 30 days' })).toHaveCount(0);
});

test('Group page: the tab you are on survives a reload', async ({ page }) => {
  await openTab(page);
  await page.getByRole('tab', { name: 'Sessions' }).click();
  await expect(page.getByRole('tab', { name: 'Sessions' })).toHaveAttribute('aria-selected', 'true');

  await page.reload();
  await expect(page.getByRole('tab', { name: 'Sessions' })).toHaveAttribute('aria-selected', 'true');
  await expect(section(page, "Today's sessions")).toBeVisible();
});
