import { installFakeChatSocket } from '../mocks/fakeChatSocket.ts';
import { mockGroupMembers, seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-GROUP-SESSION-1: the "Session" shortcut under the post composer of a group's Posts tab, the create form in group
 * mode, and cancelling a group session as its host.
 *
 * Uses `mockOwnedGroup` ("Weekend Tennis Ladder": the test user is its owner and the host of "Ladder night", whose
 * fixture start is re-timed to noon today by the `GET /sessions/group/:id` mock because the shortcut lists only today's
 * sessions) and `mockGroup` ("Friday Night Football": a plain member, its one session is on a fixed past date, so
 * nothing is on today there).
 */

const SAM_ITO_ID = mockGroupMembers.find((member) => member.userFullName === 'Sam Ito')!.userId;

test('Group Posts tab: the Session shortcut lists today, collapses, and its plus opens the group-mode form', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Weekend Tennis Ladder/ }).click();

  const shortcut = page.getByRole('region', { name: "Today's session", exact: true });
  const list = page.getByRole('region', { name: "Today's group sessions" });

  await test.step("1. today's session shows as a card with the joined count only, and the plus card is last", async () => {
    await expect(shortcut).toBeVisible();
    await expect(list.getByText('Ladder night')).toBeVisible();
    await expect(list.getByText('5 joined')).toBeVisible();
    await expect(list.getByText(/participants/)).toHaveCount(0);
    await expect(list.getByRole('button', { name: 'Create a session for this group' })).toBeVisible();
  });

  await test.step('2. it collapses and expands from its title', async () => {
    const toggle = shortcut.getByRole('button', { name: "Today's session" });
    await toggle.click();
    await expect(list).toHaveCount(0);
    await toggle.click();
    await expect(list).toBeVisible();
  });

  await test.step('3. the plus opens the form for this group: its sport, no slots, All members by default', async () => {
    await list.getByRole('button', { name: 'Create a session for this group' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create session', exact: true });
    await expect(dialog.getByText(/This session is for your group members/)).toBeVisible();
    const titleInput = dialog.getByLabel(/^Session title/);
    await expect(titleInput).toHaveValue("Weekend Tennis Ladder's session");
    // The title label and its input sit side by side, under the hint row.
    const labelBox = await dialog.getByText(/^Session title/).first().boundingBox();
    const inputBox = await titleInput.boundingBox();
    const hintBox = await dialog.getByText(/This session is for your group members/).boundingBox();
    expect(inputBox!.x).toBeGreaterThan(labelBox!.x + labelBox!.width - 1);
    expect(Math.abs(inputBox!.y + inputBox!.height / 2 - (labelBox!.y + labelBox!.height / 2))).toBeLessThan(12);
    expect(hintBox!.y).toBeLessThan(labelBox!.y);
    await expect(dialog.getByText('Who is this session for?', { exact: true })).toHaveCount(0);
    await expect(dialog.getByLabel(/^Sport/)).toHaveCount(0);
    await expect(dialog.getByLabel(/^Open slot/)).toHaveCount(0);
    await expect(dialog.getByRole('switch')).toHaveCount(0);
    await expect(dialog.getByRole('radio', { name: 'All members' })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Auto approve join request' })).toBeChecked();
  });

  await test.step('4. creating for specific members sends the group, the audience and the ids picked', async () => {
    const dialog = page.getByRole('dialog', { name: 'Create session', exact: true });
    await dialog.getByRole('radio', { name: 'Specific members' }).check();
    await dialog.getByRole('textbox', { name: 'Search members' }).fill('sam');
    await dialog.getByRole('button', { name: /Sam Ito/ }).click();
    await expect(dialog.getByRole('list', { name: 'Picked members' }).getByText('Sam Ito')).toBeVisible();

    const created = page.waitForRequest((request) => request.url().endsWith('/api/sessions') && request.method() === 'POST');
    await dialog.getByRole('button', { name: 'Create session' }).click();
    // Neither a location nor a fee is chosen, so the "Are you ready?" popup is the incomplete variant.
    await page.getByRole('dialog', { name: 'Are you ready?' }).getByRole('button', { name: 'Create preparing session' }).click();

    const body = (await created).postDataJSON();
    expect(body).toMatchObject({ groupId: 3, audience: 'SPECIFIC', audienceUserIds: [SAM_ITO_ID], capacity: 9999, autoApprove: true });
    expect(body).not.toHaveProperty('sportId');
    expect(body).not.toHaveProperty('isPublic');
    await expect(dialog).not.toBeVisible();
    // The new session opens in the session detail right away.
    await expect(page.getByRole('dialog', { name: "Weekend Tennis Ladder's session" })).toBeVisible();
  });
});

test('Group Posts tab: a group with nothing on today shows only the plus row, and Specific members needs someone picked', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Friday Night Football/ }).click();

  const list = page.getByRole('region', { name: "Today's group sessions" });
  await expect(list.getByRole('button', { name: 'Create a session for this group' })).toHaveText(/No session today\. Create one/);
  // The group's one session is on a fixed past date: not today, so not listed.
  await expect(list.getByText('Friday 5-a-side')).toHaveCount(0);

  await list.getByRole('button', { name: 'Create a session for this group' }).click();
  const dialog = page.getByRole('dialog', { name: 'Create session', exact: true });
  await dialog.getByRole('radio', { name: 'Specific members' }).check();
  await dialog.getByRole('button', { name: 'Create session' }).click();
  await expect(dialog.getByText('Pick at least one member.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Are you ready?' })).toHaveCount(0);
});

test('Group session detail: the host cancels it with a reason and it leaves the shortcut', async ({ page }) => {
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Weekend Tennis Ladder/ }).click();

  const list = page.getByRole('region', { name: "Today's group sessions" });
  await list.getByRole('button', { name: 'Ladder night — View details' }).click();
  const detail = page.getByRole('dialog').filter({ hasText: 'Ladder night' });

  await detail.getByRole('button', { name: 'Cancel session' }).click();
  const confirm = page.getByRole('dialog', { name: 'Cancel this session?' });
  await expect(confirm.getByText(/The members of the group are told/)).toBeVisible();
  await confirm.getByRole('textbox', { name: 'Reason for cancelling' }).fill('Court closed');
  await confirm.getByRole('button', { name: 'Cancel session' }).click();

  await expect(detail.getByText('Reason: Court closed')).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Cancel session' })).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(list.getByText('Ladder night')).toHaveCount(0);
});

// CLIENT-GROUP-UI-1 (owner, 2026-11-22): the shortcut shows on the Chat tab too, right above the chat window.
test('Group Chat tab: the Session shortcut sits above the chat window and the composer stays in view', async ({ page }) => {
  // A tall window: the chat box ends at the bottom of the viewport and shares its height with the shortcut.
  await page.setViewportSize({ width: 1280, height: 1100 });
  await installFakeChatSocket(page);
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
  await page.getByRole('tab', { name: 'Chat' }).click();

  const shortcut = page.getByRole('region', { name: "Today's session", exact: true });
  const list = page.getByRole('region', { name: "Today's group sessions" });
  const composer = page.getByLabel('Message the group', { exact: true });

  await expect(shortcut).toBeVisible();
  await expect(list.getByText('Ladder night')).toBeVisible();
  await expect(composer).toBeVisible();

  const shortcutBox = await shortcut.boundingBox();
  const composerBox = await composer.boundingBox();
  expect(shortcutBox!.y + shortcutBox!.height).toBeLessThanOrEqual(composerBox!.y);
  const viewport = page.viewportSize()!;
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(viewport.height);

  // The plus still opens the group-mode form from here.
  await list.getByRole('button', { name: 'Create a session for this group' }).click();
  await expect(page.getByRole('dialog', { name: 'Create session', exact: true })).toBeVisible();
});
