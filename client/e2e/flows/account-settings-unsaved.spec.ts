import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * ACCOUNT-5: closing Account Settings with unsaved edits asks first (Keep editing / Discard / Save);
 * closing it untouched does not.
 */

async function openAccountSettings(page: import('@playwright/test').Page) {
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  return page.getByRole('dialog', { name: 'Account settings' });
}

test('closing without edits just closes', async ({ page }) => {
  const settings = await openAccountSettings(page);

  await page.keyboard.press('Escape');

  await expect(settings).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeHidden();
});

test('Esc with edits asks first; Close keeps the edits, Discard closes without saving', async ({ page }) => {
  let saves = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/profile')) saves += 1;
  });
  const settings = await openAccountSettings(page);
  await settings.getByLabel('Bio').fill('Edited but not saved');

  await page.keyboard.press('Escape');
  const prompt = page.getByRole('dialog', { name: 'Unsaved changes' });
  await expect(prompt).toBeVisible();

  await prompt.getByRole('button', { name: 'Close' }).click();
  await expect(prompt).toBeHidden();
  await expect(settings.getByLabel('Bio')).toHaveValue('Edited but not saved');

  await settings.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Discard changes' }).click();

  await expect(settings).toBeHidden();
  expect(saves).toBe(0);
});

test('Save in the prompt saves the edits and closes everything', async ({ page }) => {
  const settings = await openAccountSettings(page);
  await settings.getByLabel('Bio').fill('Saved from the prompt');

  const save = page.waitForRequest((request) => request.method() === 'PUT' && request.url().includes('/profile'));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Unsaved changes' }).getByRole('button', { name: 'Save changes' }).click();

  expect((await save).postDataJSON()).toMatchObject({ bio: 'Saved from the prompt' });
  await expect(settings).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeHidden();
  // ACCOUNT-3: a successful save confirms with a toast.
  await expect(page.getByText('Your account settings were saved.')).toBeVisible();
});

test('the Save button saves and confirms with a toast, keeps the modal open, and closing afterwards does not prompt', async ({ page }) => {
  const settings = await openAccountSettings(page);
  await settings.getByLabel('Bio').fill('Saved from the button');

  const save = page.waitForRequest((request) => request.method() === 'PUT' && request.url().includes('/profile'));
  await settings.getByRole('button', { name: 'Save changes' }).click();

  expect((await save).postDataJSON()).toMatchObject({ bio: 'Saved from the button' });
  await expect(page.getByText('Your account settings were saved.')).toBeVisible();
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel('Bio')).toHaveValue('Saved from the button');
  await expect(settings.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeHidden();
});

test('U25: a saved phone the server could not parse is kept and flagged with a hint on reopening', async ({ page }) => {
  const settings = await openAccountSettings(page);
  await expect(settings.getByText(/doesn’t look valid/)).toBeHidden();
  await settings.getByLabel('Phone number').fill('555-0100');

  const save = page.waitForRequest((request) => request.method() === 'PUT' && request.url().includes('/profile'));
  await settings.getByRole('button', { name: 'Save changes' }).click();
  expect((await save).postDataJSON()).toMatchObject({ phoneNumber: '555-0100' });
  await expect(page.getByText('Your account settings were saved.')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  const reopened = page.getByRole('dialog', { name: 'Account settings' });
  await expect(reopened.getByLabel('Phone number')).toHaveValue('555-0100');
  await expect(reopened.getByText('This phone number doesn’t look valid. Check it and save again.')).toBeVisible();

  await reopened.getByLabel('Phone number').fill('0901234567');
  await expect(reopened.getByText(/doesn’t look valid/)).toBeHidden();
});
