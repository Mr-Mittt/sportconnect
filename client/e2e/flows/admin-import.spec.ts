import { signIn } from '../mocks/keycloakStub.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-ADMIN-IMPORT-1: the admin page that imports finished sessions, end to end in a real browser, against the mock of
 * SESSION-70's two endpoints (e2e/mocks/handlers/adminImport.ts: group 46 with six members, location 7).
 *
 * What this covers that AdminImportPage.test.tsx cannot: the route and the link into it from the /admin index, a real file
 * upload through the browser's file input, the native <select> choosing a member, and the apply being repeatable (the second
 * apply skips what the first made).
 */

const importFile = {
  sheet: '102026',
  sessions: [
    {
      title: "BkBg's session on 29th, Oct 2026", localDate: '2026-10-29', startTime: '07:00', endTime: '09:00',
      games: [
        // "Ánh" is two members' first name; "Anh_VL" is nobody's: both need a member chosen.
        { winners: ['Hiếu', 'Ánh'], losers: ['Bảo', 'Đức'] },
        { winners: ['Anh_VL', 'Viên'], losers: ['Hiếu', 'Bảo'] },
      ],
    },
    {
      title: "BkBg's session on 27th, Oct 2026", localDate: '2026-10-27', startTime: '07:00', endTime: '09:00',
      games: [{ winners: ['Hiếu', 'Bảo'], losers: ['Đức', 'Viên'] }],
    },
  ],
};

async function openImportPage(page: import('@playwright/test').Page) {
  await signIn(page, 'admin');
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Import sessions' }).click();
  await expect(page).toHaveURL('/admin/import');
}

async function chooseFile(page: import('@playwright/test').Page, content: unknown = importFile) {
  await page.getByLabel('Import file').setInputFiles({
    name: 'sessions-102026.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(content)),
  });
}

test('Admin import — an admin previews a file, matches the names nobody matched, applies, and a repeat skips', async ({ page }) => {
  await openImportPage(page);

  await chooseFile(page);
  await expect(page.getByText('2 sessions from sheet 102026')).toBeVisible();
  await page.getByLabel('Group id').fill('46');
  await page.getByLabel('Location id').fill('7');
  await page.getByRole('button', { name: 'Preview' }).click();

  // Both sessions are listed, and two names need a member: the apply waits for them.
  await expect(page.getByRole('list', { name: 'Sessions to import' }).getByRole('button')).toHaveCount(2);
  await expect(page.getByLabel('Who is "Ánh"?')).toBeVisible();
  await expect(page.getByLabel('Who is "Anh_VL"?')).toBeVisible();
  await expect(page.getByText('No member has this first name.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();

  await page.getByLabel('Who is "Ánh"?').selectOption({ label: 'Ánh Nguyễn' });
  await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await page.getByLabel('Who is "Anh_VL"?').selectOption({ label: 'Ánh Vãng Lai' });
  await expect(page.getByRole('button', { name: 'Apply' })).toBeEnabled();

  // The first session opened: the chosen members replace "(not matched)".
  await page.getByRole('button', { name: /2026-10-29/ }).click();
  await expect(page.getByText(/Hiếu Nguyễn, Ánh Nguyễn/)).toBeVisible();
  await expect(page.getByText(/Ánh Vãng Lai, Viên Nguyễn/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Sessions to import' }).getByText(/not matched/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status')).toHaveText('Imported 2, already imported 0, failed 0.');

  // The same call again: what is already there is skipped, not made twice.
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('status')).toHaveText('Imported 0, already imported 2, failed 0.');
});

test('Admin import — a group that does not exist is refused with a plain message and the file is kept', async ({ page }) => {
  await openImportPage(page);
  await chooseFile(page);
  await page.getByLabel('Group id').fill('999');
  await page.getByLabel('Location id').fill('7');

  await page.getByRole('button', { name: 'Preview' }).click();

  await expect(page.getByRole('alert')).toHaveText('No active group has that id.');
  await expect(page.getByText('2 sessions from sheet 102026')).toBeVisible();
  await expect(page.getByLabel('Group id')).toHaveValue('999');
  await expect(page.getByRole('button', { name: 'Preview' })).toBeEnabled();
});

test('Admin import — a file that is not an import file is refused before anything is sent', async ({ page }) => {
  await openImportPage(page);

  await page.getByLabel('Import file').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });

  await expect(page.getByRole('alert')).toHaveText("This isn't an import file made by the sheet script.");
  await page.getByLabel('Group id').fill('46');
  await page.getByLabel('Location id').fill('7');
  await expect(page.getByRole('button', { name: 'Preview' })).toBeDisabled();
});
