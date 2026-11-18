import type { Page } from '@playwright/test';
import { mockPreparingSession, seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-SESSION-52: the public / private switch of a standalone session (SESSION-69). The MSW session handlers keep
 * `isPublic` (create and PUT), so the requests are what is asserted; who can see a private session is the server's rule
 * (covered by its integration tests), not something this mock enforces beyond Discover.
 */

const PREPARING_ID = mockPreparingSession.id;
const createUrl = /\/api\/sessions$/;
const updateUrl = new RegExp(`/api/sessions/${PREPARING_ID}$`);

const publicHint = 'Everyone can see and ask to join your session';
const privateHint = 'Except for your invitee, everyone cannot find and ask to join your session';
const warning = "Only you and invited friends can see this session; everyone else won't be able to find it and join.";

/** Opens the create form with the minimum a PREPARING session needs (a sport and an open slot). */
async function openCreateForm(page: Page) {
  await page.getByRole('button', { name: 'Create session' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create your session' });
  await dialog.getByLabel(/^Sport/).selectOption('pickleball');
  await dialog.getByLabel(/^Open slot/).fill('10');
  return dialog;
}

test('the create form has the switch in its footer, on by default, and a new session is public', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');
  const dialog = await openCreateForm(page);

  const toggle = dialog.getByRole('switch', { name: 'Public session' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByText(publicHint)).toBeVisible();
  await expect(dialog.getByText(warning)).toHaveCount(0);
  // In the footer, left of the Create button.
  const toggleBox = (await toggle.boundingBox())!;
  const createBox = (await dialog.getByRole('button', { name: 'Create session' }).boundingBox())!;
  expect(toggleBox.x).toBeLessThan(createBox.x);

  const created = page.waitForRequest((request) => createUrl.test(request.url()) && request.method() === 'POST');
  await dialog.getByRole('button', { name: 'Create session' }).click();
  await page.getByRole('dialog', { name: 'Are you ready?' }).getByRole('button', { name: 'Create preparing session' }).click();

  expect((await created).postDataJSON()).toMatchObject({ isPublic: true });
  await expect(dialog).not.toBeVisible();
});

test('switching it off shows the hint and a footer warning, and the request carries isPublic: false', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');
  const dialog = await openCreateForm(page);
  await dialog.getByLabel(/^Session title/).fill('Invite-only run');

  await dialog.getByRole('switch', { name: 'Public session' }).click();

  await expect(dialog.getByRole('switch', { name: 'Public session' })).toHaveAttribute('aria-checked', 'false');
  await expect(dialog.getByText(privateHint)).toBeVisible();
  await expect(dialog.getByText(warning)).toBeVisible();
  await expect(dialog.getByText(publicHint)).toHaveCount(0);

  const created = page.waitForRequest((request) => createUrl.test(request.url()) && request.method() === 'POST');
  await dialog.getByRole('button', { name: 'Create session' }).click();
  await page.getByRole('dialog', { name: 'Are you ready?' }).getByRole('button', { name: 'Create preparing session' }).click();

  expect((await created).postDataJSON()).toMatchObject({ title: 'Invite-only run', isPublic: false });
  await expect(dialog).not.toBeVisible();
});

test('the host switches a PREPARING session to private from the Who section; the Share button goes away', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');
  await page.getByRole('button', { name: /Court booking pending — View details/ }).click();
  const detail = page.getByRole('dialog', { name: 'Court booking pending' });
  await expect(detail.getByRole('button', { name: 'Share this session' })).toBeVisible();

  // Who is the fourth section: Overview, When, Where, Who.
  await detail.getByRole('button', { name: 'Edit' }).nth(3).click();
  const toggle = detail.getByRole('switch', { name: 'Public session' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(detail.getByText(warning)).toBeVisible();

  const saved = page.waitForRequest((request) => updateUrl.test(request.url()) && request.method() === 'PUT');
  await detail.getByRole('button', { name: 'Save' }).click();

  expect((await saved).postDataJSON()).toMatchObject({ isPublic: false });
  await expect(detail.getByText('Private').first()).toBeVisible();
  await expect(detail.getByRole('switch', { name: 'Public session' })).toHaveCount(0);
  // A shared friend could not open a private session: no Share button.
  await expect(detail.getByRole('button', { name: 'Share this session' })).toHaveCount(0);
});
