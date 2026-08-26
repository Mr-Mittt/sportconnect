import { mockAdminUser, mockPassword } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * ADMIN-2: the sport master-detail admin screen, end to end in a real browser.
 *
 * What this covers that AdminSportsPage.test.tsx cannot: the real route tree
 * (/admin/sports and /admin/sports/:sportId both resolving to one component),
 * navigation into the section from the /admin index, and both saves surviving a
 * full app mount including the bootstrap refresh.
 *
 * The mock catalogue (e2e/mocks/handlers/sport.ts) deliberately carries an
 * inactive sport, Tennis, so the "A9's GET 404s for a deactivated sport, so don't
 * fire it" branch is exercised here and not only in unit tests.
 */

async function logInAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(mockAdminUser.email);
  await page.getByLabel('Password', { exact: true }).fill(mockPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('/');
}

test('Admin sports — an admin edits a sport field and saves it', async ({ page }) => {
  await logInAsAdmin(page);

  await page.goto('/admin');
  await page.getByRole('link', { name: 'Sports' }).first().click();
  await expect(page).toHaveURL('/admin/sports');

  await page.getByRole('button', { name: 'Show detail for Badminton' }).click();
  await expect(page).toHaveURL('/admin/sports/1');

  const category = page.getByLabel('Category');
  await expect(category).toHaveValue('Racket');
  await category.fill('Racquet');
  await page.getByRole('button', { name: 'Save fields' }).click();

  await expect(page.getByRole('status')).toHaveText('Saved');
  // The table re-reads /sports/all after the invalidate, so the new value is visible
  // in the master pane without a manual reload.
  await expect(page.getByRole('cell', { name: 'Racquet' })).toBeVisible();
});

test('Admin sports — an admin edits and saves the attribute schema', async ({ page }) => {
  await logInAsAdmin(page);
  await page.goto('/admin/sports/1');

  const textarea = page.getByLabel('Schema document (JSON)');
  await expect(textarea).toContainText('racketBrand');

  await textarea.fill('{"defaultLocale":"en","groups":[]}');
  await page.getByRole('button', { name: 'Save attributes' }).click();

  await expect(page.getByRole('status')).toHaveText('Saved');
});

test('Admin sports — invalid JSON is rejected locally before any request', async ({ page }) => {
  await logInAsAdmin(page);
  await page.goto('/admin/sports/1');

  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT') requests.push(request.url());
  });

  await page.getByLabel('Schema document (JSON)').fill('{ not json');
  await page.getByRole('button', { name: 'Save attributes' }).click();

  await expect(page.getByRole('alert')).toContainText('Invalid JSON');
  expect(requests).toEqual([]);
});

test('Admin sports — a deactivated sport is editable like any other (A11)', async ({ page }) => {
  await logInAsAdmin(page);
  await page.goto('/admin/sports/4');

  // A11 closed A9's read/write asymmetry: the admin schema read now resolves regardless of
  // active state, so configuring a sport *before* activating it actually works. Before it,
  // this panel had to skip the request and explain that the schema could not be loaded.
  await expect(page.getByLabel('Name')).toHaveValue('Tennis');
  await expect(page.getByRole('checkbox', { name: 'Active' })).not.toBeChecked();

  const textarea = page.getByLabel('Schema document (JSON)');
  await expect(textarea).toBeVisible();

  await textarea.fill('{"defaultLocale":"en","groups":[]}');
  await page.getByRole('button', { name: 'Save attributes' }).click();
  await expect(page.getByRole('status')).toHaveText('Saved');
});

/*
 * ADMIN-4: the unsaved-changes guard in front of logout. Lives in this file rather than
 * admin-route-guard.spec.ts because it needs a genuinely dirty admin form, which is what
 * this section provides — the guard's whole point is that the two forms here own drafts
 * that no navigation previously protected.
 */
test('Admin logout — unsaved sport-field edits are confirmed before discarding', async ({
  page,
}) => {
  await logInAsAdmin(page);
  await page.goto('/admin/sports/1');

  await page.getByLabel('Category').fill('Unsaved value');

  await page.getByRole('button', { name: 'Log out' }).click();

  // Warned, still on /admin, still signed in.
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(page).toHaveURL('/admin/sports/1');

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Unsaved changes')).toBeHidden();
  await expect(page.getByLabel('Category')).toHaveValue('Unsaved value');

  // Confirming does log out.
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByRole('button', { name: 'Discard & log out' }).click();
  await page.waitForURL('/login');
});

test('Admin logout — a clean form logs out with no confirmation', async ({ page }) => {
  await logInAsAdmin(page);
  await page.goto('/admin/sports/1');
  await expect(page.getByLabel('Category')).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();

  await page.waitForURL('/login');
});
