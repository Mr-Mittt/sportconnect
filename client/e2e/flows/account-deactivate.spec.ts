import { mockPassword, seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { KEYCLOAK_AUTH_URL } from '../mocks/keycloakStub.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * ACCOUNT-4: deactivating one's own account from Account Settings. The auth handler
 * (e2e/mocks/handlers/auth.ts) mirrors backend U22: POST /api/users/me/deactivate answers 200 for the
 * right password and 400 CURRENT_PASSWORD_INCORRECT otherwise.
 */

async function openDeactivateDialog(page: import('@playwright/test').Page) {
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  await page.getByRole('dialog', { name: 'Account settings' }).getByRole('button', { name: 'Deactivate account' }).click();
  return page.getByRole('dialog', { name: 'Deactivate your account?' });
}

test('the right password deactivates, signs out and lands on the sign-in page', async ({ page }) => {
  const dialog = await openDeactivateDialog(page);

  const request = page.waitForRequest('**/api/users/me/deactivate');
  await dialog.getByLabel('Confirm with your password').click();
  await dialog.getByLabel('Confirm with your password').fill(mockPassword);
  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  expect((await request).postDataJSON()).toEqual({ currentPassword: mockPassword });
  // AUTH-14: /login is a redirect, so the signed-out user ends up on Keycloak's sign-in page; the
  // re-activate dialog is shown by /auth/callback after the next sign-in (auth-callback.spec.ts).
  await expect(page).toHaveURL(KEYCLOAK_AUTH_URL);
});

test('a wrong password keeps the dialog open with the localized error', async ({ page }) => {
  const dialog = await openDeactivateDialog(page);

  await dialog.getByLabel('Confirm with your password').click();
  await dialog.getByLabel('Confirm with your password').fill('definitely-wrong');
  await dialog.getByRole('button', { name: 'Deactivate' }).click();

  await expect(dialog.getByRole('alert')).toHaveText('Your current password is incorrect.');
  await expect(page).not.toHaveURL(KEYCLOAK_AUTH_URL);
});

test('the confirmation stacks over Account settings, which keeps its edits when Cancel returns to it', async ({ page }) => {
  let calls = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/users/me/deactivate')) calls += 1;
  });
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Account settings' });
  await settings.getByLabel('Bio').fill('Edited but not saved');
  await settings.getByRole('button', { name: 'Deactivate account' }).click();

  const confirm = page.getByRole('dialog', { name: 'Deactivate your account?' });
  await expect(confirm).toBeVisible();
  // Radix marks everything behind a modal aria-hidden, so look for it including hidden nodes.
  await expect(page.getByRole('dialog', { name: 'Account settings', includeHidden: true })).toBeAttached();

  await confirm.getByRole('button', { name: 'Cancel' }).click();

  await expect(confirm).toBeHidden();
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel('Bio')).toHaveValue('Edited but not saved');
  expect(calls).toBe(0);
});

test('Esc closes only the confirmation, not Account settings underneath', async ({ page }) => {
  const confirm = await openDeactivateDialog(page);

  await page.keyboard.press('Escape');

  await expect(confirm).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Account settings' })).toBeVisible();
});

test('deactivating with unsaved edits in Account settings signs out without the unsaved-changes prompt', async ({ page }) => {
  await seedAuthenticatedSession(page, '/profile');
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('menuitem', { name: 'Account settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Account settings' });
  await settings.getByLabel('Bio').fill('Edited but not saved');
  await settings.getByRole('button', { name: 'Deactivate account' }).click();

  const confirm = page.getByRole('dialog', { name: 'Deactivate your account?' });
  await confirm.getByLabel('Confirm with your password').click();
  await confirm.getByLabel('Confirm with your password').fill(mockPassword);
  await confirm.getByRole('button', { name: 'Deactivate' }).click();

  await expect(page).toHaveURL(KEYCLOAK_AUTH_URL);
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeHidden();
});
