import type { Page } from '@playwright/test';
import { mockLocation, mockOwnedGroup, seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-GROUP-SESSION-5: the recurrence configuration form behind the Sessions section's Add and Edit. `mockOwnedGroup` ("Weekend Tennis Ladder", the
 * test user owns it, Pickleball) has generation ON, weekly, with Tuesday 18:00 (90 min, Riverside Courts) and 20:00 (60 min) and a Friday draft. The mock
 * server answers POST and PUT like the real one: draft when the location, the duration or a fixed amount is missing, 5 per day, the audience members named.
 */

const OWNED = 'Weekend Tennis Ladder';
const SAM = { id: '33333333-3333-4333-8333-333333333333', name: 'Sam Ito' };

async function openSessionsSection(page: Page) {
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: new RegExp(OWNED) }).click();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
}

const recurrencesUrl = new RegExp(`/api/sessions/group/${mockOwnedGroup.id}/recurrences$`);
const recurrenceUrl = (id: number) => new RegExp(`/api/sessions/group/${mockOwnedGroup.id}/recurrences/${id}$`);
const form = (page: Page, name: string) => page.getByRole('dialog', { name });

/** Picks Riverside Courts through the location picker, as the session form does. */
async function chooseRiverside(page: Page, dialog: ReturnType<typeof form>) {
  await dialog.getByRole('button', { name: 'Choose location' }).click();
  await page.getByRole('menuitem', { name: 'Choose a location…' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a location' });
  await picker.getByLabel('Search locations').fill('Riverside');
  await picker.getByRole('button', { name: 'Search' }).click();
  await picker.getByText(mockLocation.name, { exact: true }).click();
  await expect(dialog.getByText(mockLocation.name)).toBeVisible();
}

test('Add: a draft first (with the warning), then a complete one, with Create more starting the form over', async ({ page }) => {
  await openSessionsSection(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const add = form(page, 'Add a regular session');

  await test.step('1. the form opens on Monday 18:00, free, for everyone, with no date picker', async () => {
    await expect(add.getByLabel(/Day of the week/)).toHaveValue('1');
    await expect(add.getByLabel('Starts at: hour')).toHaveValue('18');
    await expect(add.getByRole('checkbox', { name: 'Free' })).toBeChecked();
    await expect(add.getByRole('radio', { name: 'All members' })).toBeChecked();
    await expect(add.getByLabel(/: date/)).toHaveCount(0);
  });

  await test.step('2. Save without a location or a duration warns, naming both; Keep editing goes back', async () => {
    await add.getByRole('button', { name: 'Save' }).click();
    const warning = form(page, 'Your recurrence session is missing information');
    await expect(warning).toContainText('It will be saved as a DRAFT');
    await expect(warning.getByRole('listitem')).toHaveText(['Location', 'Duration']);
    await warning.getByRole('button', { name: 'Keep editing' }).click();
    await expect(warning).toBeHidden();
    await expect(add).toBeVisible();
  });

  await test.step('3. Save as draft sends only what was entered and tells the next session is coming', async () => {
    await add.getByRole('button', { name: 'Save' }).click();
    const request = page.waitForRequest((r) => r.method() === 'POST' && recurrencesUrl.test(r.url()));
    await form(page, 'Your recurrence session is missing information').getByRole('button', { name: 'Save as draft' }).click();
    const body = (await request).postDataJSON();
    expect(body).toMatchObject({ dayKey: 1, startTime: '18:00', audience: 'ALL_MEMBERS', feeType: 'FREE', gameMood: 5 });
    expect(body.locationId).toBeUndefined();
    expect(body.durationMinutes).toBeUndefined();

    const saved = form(page, 'Regular session saved');
    await expect(saved).toContainText('saved as a DRAFT');
    await expect(saved).not.toContainText('created soon');
    await expect(saved).toContainText('Do you want to schedule another regular session?');
  });

  await test.step('4. Create more brings back a blank form (the day too), where a complete one saves without a warning', async () => {
    await form(page, 'Regular session saved').getByRole('button', { name: 'Create more' }).click();
    await expect(add).toBeVisible();
    await add.getByLabel(/Day of the week/).selectOption('3');
    await add.getByLabel(/Duration/).fill('90');
    await chooseRiverside(page, add);

    const request = page.waitForRequest((r) => r.method() === 'POST' && recurrencesUrl.test(r.url()));
    await add.getByRole('button', { name: 'Save' }).click();
    expect((await request).postDataJSON()).toMatchObject({ dayKey: 3, startTime: '18:00', durationMinutes: 90, locationId: mockLocation.id });
    await expect(form(page, 'Your recurrence session is missing information')).toHaveCount(0);

    await expect(form(page, 'Regular session saved')).toContainText('Its next regular session will be created soon.');
    await form(page, 'Regular session saved').getByRole('button', { name: 'No' }).click();
    await expect(add).toBeHidden();
  });

  await test.step('5. both are in the list, the draft marked as one', async () => {
    await expect(page.getByRole('button', { name: /Monday \(1\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Wednesday \(1\)/ })).toBeVisible();
    await page.getByRole('button', { name: /Monday \(1\)/ }).click();
    await expect(page.getByText('Draft').first()).toBeVisible();
  });
});

test('Edit: the form opens filled, the change goes to that configuration (PUT), and the list shows it', async ({ page }) => {
  await openSessionsSection(page);
  await page.getByRole('button', { name: /Tuesday \(2\)/ }).click();
  await page.getByRole('button', { name: 'Edit Tuesday at 18:00' }).click();
  const edit = form(page, 'Edit regular session');

  await expect(edit.getByLabel(/Day of the week/)).toHaveValue('2');
  await expect(edit.getByLabel('Starts at: hour')).toHaveValue('18');
  await expect(edit.getByLabel(/Duration/)).toHaveValue('90');
  await expect(edit.getByLabel('Ends at: hour')).toHaveValue('19');
  await expect(edit.getByLabel('Ends at: minute')).toHaveValue('30');
  await expect(edit.getByText(mockLocation.name)).toBeVisible();

  await edit.getByLabel(/Duration/).fill('120');
  await expect(edit.getByLabel('Ends at: hour')).toHaveValue('20');
  const request = page.waitForRequest((r) => r.method() === 'PUT' && recurrenceUrl(1).test(r.url()));
  await edit.getByRole('button', { name: 'Save' }).click();
  expect((await request).postDataJSON()).toMatchObject({ dayKey: 2, startTime: '18:00', durationMinutes: 120, locationId: mockLocation.id });

  await form(page, 'Regular session saved').getByRole('button', { name: 'No' }).click();
  await expect(page.getByRole('button', { name: /Tuesday \(2\)/ })).toBeVisible();
  await expect(page.getByText(/18:00\s*[-–]\s*20:00/).first()).toBeVisible();
});

test('Specific members: the picked member is sent, and Edit shows them by name', async ({ page }) => {
  await openSessionsSection(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const add = form(page, 'Add a regular session');

  await add.getByLabel(/Day of the week/).selectOption('4');
  await add.getByLabel(/Duration/).fill('60');
  await chooseRiverside(page, add);
  await add.getByRole('radio', { name: 'Specific members' }).click();

  await test.step('Save with nobody picked is refused', async () => {
    await add.getByRole('button', { name: 'Save' }).click();
    await expect(add.getByText('Pick at least one member.')).toBeVisible();
  });

  await add.getByLabel('Search members').fill('sam');
  await add.getByRole('button', { name: new RegExp(SAM.name) }).click();
  const request = page.waitForRequest((r) => r.method() === 'POST' && recurrencesUrl.test(r.url()));
  await add.getByRole('button', { name: 'Save' }).click();
  expect((await request).postDataJSON()).toMatchObject({ dayKey: 4, audience: 'SPECIFIC', audienceUserIds: [SAM.id] });
  await form(page, 'Regular session saved').getByRole('button', { name: 'No' }).click();

  await page.getByRole('button', { name: /Thursday \(1\)/ }).click();
  await page.getByRole('button', { name: 'Edit Thursday at 18:00' }).click();
  const edit = form(page, 'Edit regular session');
  await expect(edit.getByRole('radio', { name: 'Specific members' })).toBeChecked();
  await expect(edit.getByText(SAM.name)).toBeVisible();
});

test('a refused save keeps the form with its message, nothing is added', async ({ page }) => {
  await openSessionsSection(page);
  await page.route(recurrencesUrl, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 409,
          json: { success: false, message: 'English server prose', data: null, timestamp: '', errorCode: 'SESSION_RECURRENCE_DAY_LIMIT', errorParams: { limit: 5 } },
        })
      : route.fallback(),
  );
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const add = form(page, 'Add a regular session');
  await add.getByLabel(/Day of the week/).selectOption('2');
  await add.getByLabel(/Duration/).fill('60');
  await chooseRiverside(page, add);
  await add.getByRole('button', { name: 'Save' }).click();

  await expect(add.getByRole('alert')).toHaveText('A day can have up to 5 configurations.');
  await expect(form(page, 'Regular session saved')).toHaveCount(0);
  await expect(add).toBeVisible();
});

test('closing a form with entries asks first; nothing entered closes at once', async ({ page }) => {
  await openSessionsSection(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const add = form(page, 'Add a regular session');

  await add.getByRole('button', { name: 'Close' }).click();
  await expect(add).toBeHidden();

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await add.getByLabel(/Day of the week/).selectOption('6');
  await add.getByRole('button', { name: 'Close' }).click();
  await expect(form(page, 'Discard this configuration?')).toBeVisible();
  await form(page, 'Discard this configuration?').getByRole('button', { name: 'Keep editing' }).click();
  await expect(add).toBeVisible();

  await add.getByRole('button', { name: 'Close' }).click();
  await form(page, 'Discard this configuration?').getByRole('button', { name: 'Discard' }).click();
  await expect(add).toBeHidden();
});

test('a member of the group sees no Add and no Edit', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Friday Night Football/ }).click();
  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
});
