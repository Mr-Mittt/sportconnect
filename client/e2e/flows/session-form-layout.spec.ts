import type { Page } from '@playwright/test';
import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-SESSION-34: the sectioned create form and the PREPARING detail must fit a phone — no
 * horizontal scroll at 320 or 375px — and the section header actions are icon-only there (each one
 * keeps its accessible name). Real browser only: jsdom has no layout.
 *
 * One `test()` per width: open the create form, fill enough to exercise the Who section's gender
 * rows, create a Preparing session (location and fee left out), open its detail, and check the
 * header actions in view and in edit mode.
 */

const widths = [320, 375] as const;

/**
 * True when the open dialog and its scrolling body are no wider than what is visible, and the page
 * itself does not scroll sideways. A string expression, like the other specs' `page.evaluate` calls:
 * this project's tsconfig has no DOM lib.
 */
async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return (await page.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog === null) return false;
    const scrollers = [dialog, ...Array.from(dialog.querySelectorAll('.overflow-y-auto'))];
    return (
      scrollers.every((node) => node.scrollWidth <= node.clientWidth + 1) &&
      document.documentElement.scrollWidth <= window.innerWidth + 1
    );
  })()`)) as boolean;
}

for (const width of widths) {
  test(`session form — create form and Preparing detail fit ${width}px, header actions are icon-only`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await seedAuthenticatedSession(page, '/matches');
    // The new session is a Pickleball one; its pill makes the card show on the page.
    await page.getByRole('button', { name: 'Pickleball' }).click();

    await page.getByRole('button', { name: 'Create session' }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create your session' });
    await createDialog.getByLabel(/^Sport/).selectOption('pickleball');
    await createDialog.getByLabel(/^Session title/).fill(`Narrow ${width}`);
    await createDialog.getByLabel(/^Duration \(min\)/).fill('90');
    await createDialog.getByLabel(/^Open slot/).fill('6');
    await createDialog.getByRole('radio', { name: 'By gender' }).check();
    await createDialog.getByRole('checkbox', { name: 'Male slot', exact: true }).check();
    await createDialog.getByLabel('Male slots', { exact: true }).fill('3');
    await createDialog.getByRole('checkbox', { name: 'Female slot', exact: true }).check();
    await createDialog.getByLabel('Female slots', { exact: true }).fill('2');

    // Every section is on screen and the dialog does not scroll sideways.
    for (const name of [/^Overview/, /^When/, /^Where/, /^Who/, /^Cost/]) {
      await expect(createDialog.getByRole('button', { name })).toBeVisible();
    }
    expect(await hasNoHorizontalOverflow(page)).toBe(true);

    // The sections stack in a scrolling body — they never squash or overlap: each one starts below the
    // previous one's header by at least a section's worth (its fields), and the body itself scrolls.
    const tops: number[] = [];
    for (const name of [/^Overview/, /^When/, /^Where/, /^Who/, /^Cost/]) {
      const box = await createDialog.getByRole('button', { name }).boundingBox();
      tops.push(box?.y ?? 0);
    }
    for (let i = 1; i < tops.length; i += 1) expect(tops[i] - tops[i - 1]).toBeGreaterThan(60);
    expect(
      await page.evaluate(`(() => {
        const body = document.querySelector('[role="dialog"] .overflow-y-auto');
        return body !== null && body.scrollHeight > body.clientHeight;
      })()`),
    ).toBe(true);

    // On a phone "Who can join" wraps below Open slot.
    const openBox = await createDialog.getByLabel(/^Open slot/).boundingBox();
    const whoCanJoinBox = await createDialog.getByText('Who can join', { exact: true }).boundingBox();
    expect(whoCanJoinBox?.y ?? 0).toBeGreaterThan((openBox?.y ?? 0) + 20);

    // The hour and minute selects are narrow (two characters), and the end picker sits on the form.
    const hourWidth = ((await createDialog
      .getByLabel('Hour', { exact: true })
      .boundingBox()) ?? { width: 999 }).width;
    expect(hourWidth).toBeLessThan(80);

    await createDialog.getByRole('button', { name: 'Create session' }).click();
    await page
      .getByRole('dialog', { name: 'Are you ready?' })
      .getByRole('button', { name: 'Create preparing session' })
      .click();
    await expect(createDialog).not.toBeVisible();

    await page.getByRole('button', { name: new RegExp(`Narrow ${width} — View details`) }).click();
    const dialog = page.getByRole('dialog', { name: `Narrow ${width}` });
    await expect(dialog.getByText('The host is still preparing this session.')).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);

    // View mode: Edit is icon-only (its text span is hidden) but keeps its accessible name.
    const edit = dialog.getByRole('button', { name: 'Edit' }).first();
    await expect(edit).toBeVisible();
    await expect(edit.locator('span')).toBeHidden();

    // Edit mode: Discard and Save replace it, still icon-only, and the editing section fits too.
    await edit.click();
    const save = dialog.getByRole('button', { name: 'Save' });
    const discard = dialog.getByRole('button', { name: 'Discard' });
    await expect(save).toBeVisible();
    await expect(discard).toBeVisible();
    await expect(save.locator('span')).toBeHidden();
    await expect(discard.locator('span')).toBeHidden();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);

    // The Who section in edit mode (the widest one: slots, gender rows, mood) fits as well.
    await discard.click();
    await dialog.getByRole('button', { name: 'Edit' }).nth(3).click();
    await expect(dialog.getByRole('radio', { name: 'By gender' })).toBeChecked();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });
}

test('session form — on a wide screen "Who can join" sits to the right of Open slot, on the same row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedAuthenticatedSession(page, '/matches');
  await page.getByRole('button', { name: 'Create session' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Create your session' });

  // Opening the form leaves it on top: no section scrolled itself into view on mount.
  expect(
    await page.evaluate(`document.querySelector('[role="dialog"] .overflow-y-auto').scrollTop`),
  ).toBe(0);

  // The gap between two sections is half of what it was (12px -> 6px).
  const sectionBox = (name: RegExp) =>
    createDialog
      .getByRole('button', { name })
      .locator('xpath=ancestor::div[contains(@class, "border-hairline")][1]')
      .boundingBox();
  const overviewSection = await sectionBox(/^Overview/);
  const whenSection = await sectionBox(/^When/);
  const gap = (whenSection?.y ?? 0) - ((overviewSection?.y ?? 0) + (overviewSection?.height ?? 0));
  expect(gap).toBeGreaterThan(4);
  expect(gap).toBeLessThan(8);

  // When: Starts at and Duration share the first line, Ends at is on the second.
  const startDateBox = await createDialog.getByLabel('Date', { exact: true }).boundingBox();
  const durationBox = await createDialog.getByLabel(/^Duration [(]min[)]/).boundingBox();
  const endDateBox = await createDialog.getByLabel('Ends at: date').boundingBox();
  expect(Math.abs((durationBox?.y ?? 999) - (startDateBox?.y ?? 0))).toBeLessThan(12);
  expect((durationBox?.x ?? 0) > (startDateBox?.x ?? 999) + (startDateBox?.width ?? 0)).toBe(true);
  expect((endDateBox?.y ?? 0) > (startDateBox?.y ?? 999) + 20).toBe(true);

  // The form is 70vh tall (630px of a 900px window), not the old 60vh.
  const dialogBox = await createDialog.boundingBox();
  expect(Math.round(dialogBox?.height ?? 0)).toBe(630);

  const openBox = await createDialog.getByLabel(/^Open slot/).boundingBox();
  // The "Taken slot" label, so the comparison is label to legend (both sit at the top of the row).
  const takenBox = await createDialog.getByText('Taken slot', { exact: true }).boundingBox();
  const whoCanJoinBox = await createDialog.getByText('Who can join', { exact: true }).boundingBox();
  const byGenderBox = await createDialog.getByRole('radio', { name: 'By gender' }).boundingBox();
  // Same row as the slot inputs (their label sits at the row's top), and clearly to the right of Open slot.
  expect(Math.abs((whoCanJoinBox?.y ?? 999) - (takenBox?.y ?? 0))).toBeLessThan(12);
  expect((whoCanJoinBox?.x ?? 0) > (openBox?.x ?? 999) + (openBox?.width ?? 0)).toBe(true);
  // …with its two options stacked in a column.
  const anyoneBox = await createDialog.getByRole('radio', { name: 'Anyone' }).boundingBox();
  expect(Math.abs((anyoneBox?.x ?? 0) - (byGenderBox?.x ?? 999))).toBeLessThan(4);
  expect((byGenderBox?.y ?? 0) > (anyoneBox?.y ?? 999)).toBe(true);
  // Male slot and Female slot are one per row (not side by side), the number inputs lined up.
  const maleBox = await createDialog.getByRole('checkbox', { name: 'Male slot', exact: true }).boundingBox();
  const femaleBox = await createDialog.getByRole('checkbox', { name: 'Female slot', exact: true }).boundingBox();
  const maleInputBox = await createDialog.getByLabel('Male slots', { exact: true }).boundingBox();
  const femaleInputBox = await createDialog.getByLabel('Female slots', { exact: true }).boundingBox();
  expect((femaleBox?.y ?? 0) > (maleBox?.y ?? 999) + 10).toBe(true);
  expect(Math.abs((femaleBox?.x ?? 0) - (maleBox?.x ?? 999))).toBeLessThan(4);
  expect(Math.abs((femaleInputBox?.x ?? 0) - (maleInputBox?.x ?? 999))).toBeLessThan(4);
});

test('session form — closing the create form with unsent entries asks "Leave without saving?"', async ({ page }) => {
  await seedAuthenticatedSession(page, '/matches');
  await page.getByRole('button', { name: 'Create session' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Create your session' });

  // Nothing entered: Escape closes at once. Wait for the dialog first: an Escape sent before it has
  // mounted and taken focus is lost, which is a timing flake on a slow CI runner.
  await expect(createDialog).toBeVisible();
  // The Session detail section seeds the schema's default ("Format: Doubles") once the schema has loaded.
  // That is not something the user entered, so it must not make the form ask. Wait for it, so this runs
  // the way a slow CI runner does (schema already loaded) on every machine.
  await expect(createDialog.getByLabel('Format')).toHaveValue('Doubles');
  await page.keyboard.press('Escape');
  // `createDialog` is a role locator, and a role locator skips aria-hidden content. If "Leave without
  // saving?" had opened on top of the form, the form would count as "not visible" and this would pass
  // while the page stayed covered. Assert that no dialog of any kind is left.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Something entered: Escape asks first, "Keep editing" keeps the form and its text.
  await page.getByRole('button', { name: 'Create session' }).click();
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel(/^Session title/).fill('Do not lose me');
  await page.keyboard.press('Escape');
  const leaveDialog = page.getByRole('dialog', { name: 'Leave without saving?' });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole('button', { name: 'Keep editing' }).click();
  await expect(leaveDialog).not.toBeVisible();
  await expect(createDialog.getByLabel(/^Session title/)).toHaveValue('Do not lose me');

  // The close button asks too; "Leave" closes the form.
  await createDialog.getByRole('button', { name: 'Close' }).click();
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole('button', { name: 'Leave' }).click();
  await expect(createDialog).not.toBeVisible();
});
