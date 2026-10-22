import { signIn } from '../mocks/keycloakStub.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * AUTH-16: the "complete your profile" dialog. The mock profile (fixtures.ts `mockMyProfile`) has no
 * country, like a first-time social user. signIn() skips the dialog for every other spec; these
 * ones ask to see it. Reference data (Vietnam with two regions, Singapore with none) and the
 * profile save are the stateful MSW handlers, so a save really changes the next GET.
 */

async function signInSeeingTheDialog(page: import('@playwright/test').Page, path = '/profile') {
  await signIn(page, 'user', { path, completeProfileDialog: 'show' });
  return page.getByRole('dialog', { name: 'Complete your profile' });
}

test('a user with no country is asked, with the zone notice', async ({ page }) => {
  const dialog = await signInSeeingTheDialog(page);

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/discover the sport community in your area/i)).toBeVisible();
  await expect(dialog.getByText(/change it any time in Account Settings/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Skip for now' })).toBeVisible();
});

test('picking a country and region saves them, closes the dialog and it stays away after a reload', async ({ page }) => {
  const dialog = await signInSeeingTheDialog(page);

  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog.getByLabel('Country').selectOption({ label: 'Vietnam' });
  await dialog.getByLabel('Region').selectOption({ label: 'Ho Chi Minh City' });

  const request = page.waitForRequest((r) => r.url().includes('/profile') && r.method() === 'PUT');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const body = (await request).postDataJSON() as { countryId?: number; regionId?: number };
  expect(body.countryId).toBe(1);
  expect(body.regionId).toBe(102);
  await expect(page.getByRole('dialog')).toBeHidden();

  // The profile is complete now: a fresh session start (the skip flag is not seeded) does not ask again.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('Skip for now hides it for the rest of the session, across pages and a reload', async ({ page }) => {
  const dialog = await signInSeeingTheDialog(page);

  await dialog.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.goto('/groups');
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload();
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('a country saved without a region is not asked again in the same session', async ({ page }) => {
  const dialog = await signInSeeingTheDialog(page);

  await dialog.getByLabel('Country').selectOption({ label: 'Vietnam' });
  const request = page.waitForRequest((r) => r.url().includes('/profile') && r.method() === 'PUT');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const body = (await request).postDataJSON() as { countryId?: number; regionId?: number };
  expect(body.countryId).toBe(1);
  expect(body.regionId).toBeUndefined();
  await expect(page.getByRole('dialog')).toBeHidden();
  // Vietnam has regions and none is set, but the user chose that: no immediate re-prompt.
  await page.waitForTimeout(500);
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('a country without regions (Singapore) needs no region and completes the profile', async ({ page }) => {
  const dialog = await signInSeeingTheDialog(page);

  await dialog.getByLabel('Country').selectOption({ label: 'Singapore' });
  await expect(dialog.getByLabel('Region')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('dialog')).toBeHidden();
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();
});
