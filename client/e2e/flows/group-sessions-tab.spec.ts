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
 * "Yesterday morning" (completed) and "Cancelled yesterday"; "Last week play" 6 days ago; "Long ago play" 40 days ago (in an
 * earlier month, reached with the History's previous-month arrow, CLIENT-GROUP-UI-1).
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

  // CLIENT-GROUP-UI-1: the History shows one month, yesterday's by default (the previous month on the 1st). The mock lays its
  // sessions out relative to today, so what falls in the shown month depends on the date the test runs: worked out here.
  const daysAgo = (n: number) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - n);
    return date;
  };
  const monthLabel = (date: Date) => date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const yesterday = daysAgo(1);
  const lastDayShown = (month: Date) => (sameMonth(month, new Date()) ? daysAgo(1).getDate() : new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate());

  await test.step("5. History: opens on yesterday's month with a row for each of its days up to yesterday, zero days included; yesterday is open with its sessions (newest end first)", async () => {
    await expect(history.getByText(monthLabel(yesterday), { exact: true })).toBeVisible();
    await expect(history.getByRole('button', { name: 'Next month' })).toBeDisabled();
    const lastWeekShown = sameMonth(daysAgo(6), yesterday);
    await expect(history.getByRole('button', { name: /^(Expand|Collapse) / })).toHaveCount(lastDayShown(yesterday));
    await expect(history.getByRole('button', { name: /^Expand .*\(0\)$/ })).toHaveCount(lastDayShown(yesterday) - 1 - (lastWeekShown ? 1 : 0));
    const yesterdayRow = history.getByRole('button', { name: /^Collapse .*\(2\)$/ });
    await expect(yesterdayRow).toHaveAttribute('aria-expanded', 'true');
    const titles = await history.getByText(/^(Yesterday evening|Yesterday morning)$/).allTextContents();
    expect(titles).toEqual(['Yesterday evening', 'Yesterday morning']);
    if (lastWeekShown) {
      const lastWeekRow = history.getByRole('button', { name: /^Expand .*\(1\)$/ });
      await expect(lastWeekRow).toHaveAttribute('aria-expanded', 'false');
      await expect(history.getByText('Last week play')).toHaveCount(0);
      await lastWeekRow.click();
      await expect(history.getByText('Last week play')).toBeVisible();
    }
    // A day with no finished session opens to a plain line, with no request for its sessions.
    await history.getByRole('button', { name: /^Expand .*\(0\)$/ }).first().click();
    await expect(history.getByText('No session on this day.')).toBeVisible();
    await expect(history.getByRole('button', { name: 'Load the previous 30 days' })).toHaveCount(0);
  });

  await test.step('6. History: the previous arrow goes back a month at a time to the month of the session 40 days ago, and forward again', async () => {
    const longAgo = daysAgo(40);
    let shown = yesterday;
    while (!sameMonth(shown, longAgo)) {
      await history.getByRole('button', { name: 'Previous month' }).click();
      shown = new Date(shown.getFullYear(), shown.getMonth() - 1, 15);
      await expect(history.getByText(monthLabel(shown), { exact: true })).toBeVisible();
      const days = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
      await expect(history.getByRole('button', { name: /^(Expand|Collapse) / })).toHaveCount(days);
    }
    await expect(history.getByText('Long ago play')).toHaveCount(0);
    await history.getByRole('button', { name: /^Expand .*\(1\)$/ }).click();
    await expect(history.getByText('Long ago play')).toBeVisible();
    await history.getByRole('button', { name: 'Next month' }).click();
    await expect(history.getByRole('button', { name: /^(Expand|Collapse) / }).first()).toBeVisible();
  });

  await test.step("6b. History: the previous arrow stops at the month the group was created in (June 2026)", async () => {
    const previous = history.getByRole('button', { name: 'Previous month' });
    for (let guard = 0; guard < 60 && (await previous.isEnabled()); guard += 1) await previous.click();
    await expect(history.getByText('June 2026', { exact: true })).toBeVisible();
    await expect(previous).toBeDisabled();
    // ...and the month filter starts again from yesterday's month when the tab is opened again.
    await page.getByRole('tab', { name: 'Posts' }).click();
    await page.getByRole('tab', { name: 'Sessions' }).click();
    await expect(section(page, 'History').getByText(monthLabel(yesterday), { exact: true })).toBeVisible();
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

test('Group Sessions tab: a group with no session shows the empty hint today and one hint for the month in History', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Friday Night Football/ }).click();
  await page.getByRole('tab', { name: 'Sessions' }).click();
  await expect(section(page, "Today's sessions").getByText('No session today.')).toBeVisible();
  // CLIENT-GROUP-UI-1: a month with no finished session shows one hint (the month's name in it) instead of a row per day.
  const history = section(page, 'History');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const month = yesterday.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  await expect(history.getByText(`No finished session in ${month}.`)).toBeVisible();
  await expect(history.getByRole('button', { name: /^(Expand|Collapse) / })).toHaveCount(0);
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
