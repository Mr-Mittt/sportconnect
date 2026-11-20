import type { Page } from '@playwright/test';
import { mockGroup, mockOwnedGroup, seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * GRP-2 + CLIENT-GROUP-SESSION-4: the group Settings tab. Three collapsible sections, all collapsed by default: General (Privacy, rules/schedule,
 * the read-only Group type), Permission (the three owner-only toggles, with their own Save) and Sessions (regular-session generation: the switch, the
 * recurrence mode, the configurations by day). Rules and Schedule are saved when the field loses focus; the unsaved-changes guard still protects a
 * Permission draft and a rules/schedule save that failed. Leave Group asks first.
 *
 * `mockOwnedGroup` ("Weekend Tennis Ladder") is the one group the test user owns; `mockGroup` ("Friday Night Football") is the one they only belong to.
 * Its mock settings are generation ON, weekly, with Tuesday 18:00 (90 min) and 20:00 (60 min), a Friday draft with no location or duration, and a
 * monthly configuration on the 15th that is not listed while the mode is weekly.
 *
 * The unsaved-changes guard has three trigger points: real router navigation (`useBlocker`), an in-page tab switch, and the browser close/refresh
 * (`beforeunload`, which can only show the browser's own prompt and cannot be asserted). The first two are covered below.
 */

const OWNED = 'Weekend Tennis Ladder';
const MEMBER = 'Friday Night Football';

async function openSettings(page: Page, groupName: string) {
  await seedAuthenticatedSession(page, '/groups');
  await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: new RegExp(groupName) }).click();
  await page.getByRole('tab', { name: 'Settings' }).click();
}

const settingsUrl = (groupId: number) => new RegExp(`/api/sessions/group/${groupId}/settings$`);
const recurrenceUrl = (groupId: number, id: number) => new RegExp(`/api/sessions/group/${groupId}/recurrences/${id}$`);

function failure(status: number, errorCode: string) {
  return { status, json: { success: false, message: 'English server prose', data: null, timestamp: '', errorCode } };
}

test('Settings tab: every section starts collapsed, and opening one leaves the others closed', async ({ page }) => {
  await openSettings(page, OWNED);

  for (const name of ['General', 'Permission', 'Sessions']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('data-state', 'closed');
  }
  await expect(page.getByText('DEFAULT')).toBeHidden();
  await expect(page.getByRole('button', { name: /Allow member invites/ })).toBeHidden();
  await expect(page.getByText('Regular sessions')).toBeHidden();
  // Leave and Delete are not in a section: always there.
  await expect(page.getByRole('button', { name: 'Delete Group' })).toBeVisible();

  await page.getByRole('button', { name: 'General', exact: true }).click();
  await expect(page.getByText('DEFAULT')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Permission', exact: true })).toHaveAttribute('data-state', 'closed');
  await expect(page.getByRole('button', { name: /Allow member invites/ })).toBeHidden();

  await page.getByRole('button', { name: 'General', exact: true }).click();
  await expect(page.getByText('DEFAULT')).toBeHidden();
});

test('Group Settings tab — Permission has its own Save, rules/schedule save on blur, and the unsaved-changes guard', async ({ page }) => {
  await openSettings(page, OWNED);
  const permissionTrigger = page.getByRole('button', { name: 'Permission', exact: true });
  const inviteToggle = () => page.getByRole('button', { name: /Allow member invites/ });
  const rulesField = () => page.getByLabel('Rules');
  const saveButton = () => page.getByRole('button', { name: 'Save' });
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await permissionTrigger.click();

  await test.step('1. Save sits in the Permission section, disabled until a toggle changes; it saves just the toggles', async () => {
    await expect(saveButton()).toBeDisabled();
    await inviteToggle().click();
    await expect(inviteToggle()).toHaveAttribute('aria-pressed', 'true');
    await expect(saveButton()).toBeEnabled();

    const request = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith(`/api/groups/${mockOwnedGroup.id}/settings`));
    await saveButton().click();
    expect((await request).postDataJSON()).toEqual({ allowMemberInvites: true });
    await expect(saveButton()).toBeDisabled();
  });

  await test.step('2. rules save when the field loses focus: no Save button, a partial request, persisted', async () => {
    const request = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith(`/api/groups/${mockOwnedGroup.id}/generalData`));
    await rulesField().fill('No slide tackles.');
    await expect(saveButton()).toBeDisabled(); // Permission's Save, untouched by a rules edit
    await rulesField().press('Tab');
    expect((await request).postDataJSON()).toEqual({ rules: 'No slide tackles.' });

    await page.reload();
    await page.getByRole('group', { name: 'Group filter' }).getByRole('button', { name: new RegExp(OWNED) }).click();
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'General', exact: true }).click();
    await page.getByRole('button', { name: 'Permission', exact: true }).click();
    await expect(rulesField()).toHaveValue('No slide tackles.');
    await expect(inviteToggle()).toHaveAttribute('aria-pressed', 'true');
  });

  await test.step('3. typing and switching tab at once saves the field and raises no dialog', async () => {
    const request = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith(`/api/groups/${mockOwnedGroup.id}/generalData`));
    await rulesField().fill('No slide tackles. Bring shin guards.');
    await page.getByRole('tab', { name: 'Posts' }).click();

    expect((await request).postDataJSON()).toEqual({ rules: 'No slide tackles. Bring shin guards.' });
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Posts', selected: true })).toBeVisible();
  });

  await test.step('4. a rules save that fails shows under the field, and leaving then asks Discard/Save', async () => {
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'General', exact: true }).click();
    await page.route(new RegExp(`/api/groups/${mockOwnedGroup.id}/generalData$`), (route) =>
      route.request().method() === 'PUT' ? route.fulfill(failure(403, 'GROUP_ADMIN_REQUIRED')) : route.fallback(),
    );

    await rulesField().fill('Changed rules');
    await rulesField().press('Tab');
    await expect(page.getByRole('alert')).toContainText('Only the group owner or an admin can do this.');
    await expect(rulesField()).toHaveValue('Changed rules'); // the draft is kept

    await page.getByRole('tab', { name: 'Posts' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Discard changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Posts', selected: true })).toBeVisible();
    await page.unroute(new RegExp(`/api/groups/${mockOwnedGroup.id}/generalData$`));
  });

  await test.step('5. navigating away in-app with an unsaved Permission edit prompts the dialog; Save proceeds', async () => {
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Permission', exact: true }).click();
    await inviteToggle().click(); // false again, unsaved

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Home' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL('/groups'); // blocked: the navigation has not happened yet

    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL('/');
  });
});

test('Settings tab — a member sees no Save, no editable rules and no toggles', async ({ page }) => {
  await openSettings(page, MEMBER);
  await page.getByRole('button', { name: 'General', exact: true }).click();
  await page.getByRole('button', { name: 'Permission', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Save' })).toBeHidden();
  await expect(page.getByLabel('Rules')).toBeHidden();
  await expect(page.getByRole('button', { name: /Allow member invites/ })).toBeHidden();
  await expect(page.getByText('Only the owner can change these.')).toBeVisible();
});

test('Settings tab — Leave Group asks first: Stay leaves nothing, Leave leaves', async ({ page }) => {
  await openSettings(page, MEMBER);
  const leaveRequests: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'DELETE' && /\/api\/groups\/\d+\/leave$/.test(r.url())) leaveRequests.push(r.url());
  });

  await page.getByRole('button', { name: 'Leave Group' }).click();
  const dialog = page.getByRole('dialog', { name: 'Leave this group?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("You will no longer see this group's posts and sessions.")).toBeVisible();
  expect(leaveRequests).toHaveLength(0); // the click alone left nothing

  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Leave Group' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(leaveRequests).toHaveLength(0);

  await page.getByRole('button', { name: 'Leave Group' }).click();
  const request = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().endsWith(`/api/groups/${mockGroup.id}/leave`));
  await dialog.getByRole('button', { name: 'Leave', exact: true }).click();
  await request;
  await expect(dialog).toBeHidden();
});

/*
 * CLIENT-GROUP-SESSION-4: the Sessions section. The owner turns regular-session generation on and off (each with a confirmation), picks the recurrence
 * mode (a confirmation while configurations exist), and sees the configurations of the current mode grouped by day; Delete asks first. Add and Edit open
 * the recurrence form (CLIENT-GROUP-SESSION-5, covered by group-recurrence-form.spec.ts).
 */
test('Sessions section — the list: configurations by day, collapsed, with their location, times and what they lack', async ({ page }) => {
  await openSettings(page, OWNED);
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();

  await test.step('1. the switch, the mode and an Add button', async () => {
    await expect(page.getByRole('button', { name: 'Regular sessions: On' })).toBeVisible();
    await expect(page.getByLabel('Recurrence')).toHaveValue('WEEKLY');
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
  });

  await test.step('2. one collapsed section per day of the current mode, with its count; the monthly one is not listed', async () => {
    await expect(page.getByRole('button', { name: /Tuesday \(2\)/ })).toHaveAttribute('data-state', 'closed');
    await expect(page.getByRole('button', { name: /Friday \(1\)/ })).toHaveAttribute('data-state', 'closed');
    await expect(page.getByRole('button', { name: /15th/ })).toBeHidden();
  });

  await test.step('3. collapsed, each slot reads start to end and its location; a draft says what it lacks', async () => {
    await expect(page.getByText('18:00–19:30')).toBeVisible();
    await expect(page.getByText('20:00–21:00')).toBeVisible();
    await expect(page.getByText('Riverside Courts').first()).toBeVisible();
    await expect(page.getByText('Draft')).toBeVisible();
    await expect(page.getByText('No location')).toBeVisible();
    await expect(page.getByText('No duration')).toBeVisible();
  });

  await test.step('4. a day opened shows Edit and Delete on each slot', async () => {
    await page.getByRole('button', { name: /Tuesday \(2\)/ }).click();
    await expect(page.getByRole('button', { name: /Tuesday \(2\)/ })).toHaveAttribute('data-state', 'open');
    await expect(page.getByRole('button', { name: 'Edit Tuesday at 18:00' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Delete Tuesday at 18:00' })).toBeEnabled();
    await expect(page.getByText('12 River Rd').first()).toBeVisible();
  });
});

test('Sessions section — deleting a configuration asks first, then deletes only that one', async ({ page }) => {
  await openSettings(page, OWNED);
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  await page.getByRole('button', { name: /Tuesday \(2\)/ }).click();

  const deletes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'DELETE' && r.url().includes('/recurrences/')) deletes.push(r.url());
  });

  await page.getByRole('button', { name: 'Delete Tuesday at 20:00' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this configuration?' });
  await expect(dialog.getByText('The session on Tuesday at 20:00 will no longer be created. Sessions already created stay.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await expect(dialog).toBeHidden();
  expect(deletes).toHaveLength(0);

  await page.getByRole('button', { name: 'Delete Tuesday at 20:00' }).click();
  const request = page.waitForRequest((r) => r.method() === 'DELETE' && recurrenceUrl(mockOwnedGroup.id, 2).test(r.url()));
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await request;

  await expect(page.getByRole('button', { name: /Tuesday \(1\)/ })).toBeVisible();
  await expect(page.getByText('20:00–21:00')).toBeHidden();
  await expect(page.getByText('18:00–19:30')).toBeVisible();
});

test('Sessions section — switching the recurrence asks first; the list follows the mode', async ({ page }) => {
  await openSettings(page, OWNED);
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  // The confirm only appears while configurations of the mode exist: wait for the list, or the switch can happen before it has loaded and skip the question.
  await expect(page.getByRole('button', { name: /Tuesday \(2\)/ })).toBeVisible();

  await page.getByLabel('Recurrence').selectOption('MONTHLY');
  const dialog = page.getByRole('dialog', { name: 'Switch the recurrence?' });
  await expect(dialog.getByText('By switching the recurrence mode, your current configurations are not usable until you switch back.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByLabel('Recurrence')).toHaveValue('WEEKLY');

  await page.getByLabel('Recurrence').selectOption('MONTHLY');
  const request = page.waitForRequest((r) => r.method() === 'PUT' && settingsUrl(mockOwnedGroup.id).test(r.url()));
  await dialog.getByRole('button', { name: 'Got it' }).click();
  expect((await request).postDataJSON()).toEqual({ mode: 'MONTHLY' });

  await expect(page.getByLabel('Recurrence')).toHaveValue('MONTHLY');
  await expect(page.getByRole('button', { name: /15th \(1\)/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Tuesday/ })).toBeHidden();
});

test('Sessions section — turning generation off and on asks first, and off can cancel the remaining sessions', async ({ page }) => {
  await openSettings(page, OWNED);
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();
  const puts: unknown[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PUT' && settingsUrl(mockOwnedGroup.id).test(r.url())) puts.push(r.postDataJSON());
  });

  await test.step('1. OFF: three choices, "Hold on" changes nothing', async () => {
    await page.getByRole('button', { name: 'Regular sessions: On' }).click();
    const dialog = page.getByRole('dialog', { name: 'Turn off regular sessions?' });
    await expect(
      dialog.getByText('By switching this feature OFF, your regular sessions will stop being generated. The sessions already scheduled will stay here. Is that OK?'),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: "Hold on, don't turn off" })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'No, cancel the remaining sessions and turn off' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Yes, keep them and turn off' })).toBeVisible();

    await dialog.getByRole('button', { name: "Hold on, don't turn off" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Regular sessions: On' })).toBeVisible();
    expect(puts).toHaveLength(0);
  });

  await test.step('2. "No, cancel the remaining sessions and turn off" sends cancelScheduled: true; everything below the switch goes', async () => {
    await page.getByRole('button', { name: 'Regular sessions: On' }).click();
    const request = page.waitForRequest((r) => r.method() === 'PUT' && settingsUrl(mockOwnedGroup.id).test(r.url()));
    await page.getByRole('dialog').getByRole('button', { name: 'No, cancel the remaining sessions and turn off' }).click();
    expect((await request).postDataJSON()).toEqual({ enabled: false, cancelScheduled: true });

    await expect(page.getByRole('button', { name: 'Regular sessions: Off' })).toBeVisible();
    await expect(page.getByLabel('Recurrence')).toBeHidden();
    await expect(page.getByRole('button', { name: /Tuesday/ })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeHidden();
  });

  await test.step('3. ON: "Let me check again" changes nothing, "Got it, turn on" turns it on', async () => {
    await page.getByRole('button', { name: 'Regular sessions: Off' }).click();
    const dialog = page.getByRole('dialog', { name: 'Turn on regular sessions?' });
    await expect(
      dialog.getByText("By switching this feature ON, your regular sessions will be generated automatically from the group's recurrence configurations. Are you ready?"),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Let me check again' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Regular sessions: Off' })).toBeVisible();

    await page.getByRole('button', { name: 'Regular sessions: Off' }).click();
    const request = page.waitForRequest((r) => r.method() === 'PUT' && settingsUrl(mockOwnedGroup.id).test(r.url()));
    await dialog.getByRole('button', { name: 'Got it, turn on' }).click();
    expect((await request).postDataJSON()).toEqual({ enabled: true });

    await expect(page.getByRole('button', { name: 'Regular sessions: On' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Tuesday \(2\)/ })).toBeVisible();
  });

  await test.step('4. OFF keeping the scheduled sessions sends cancelScheduled: false', async () => {
    await page.getByRole('button', { name: 'Regular sessions: On' }).click();
    const request = page.waitForRequest((r) => r.method() === 'PUT' && settingsUrl(mockOwnedGroup.id).test(r.url()));
    await page.getByRole('dialog').getByRole('button', { name: 'Yes, keep them and turn off' }).click();
    expect((await request).postDataJSON()).toEqual({ enabled: false, cancelScheduled: false });
    await expect(page.getByRole('button', { name: 'Regular sessions: Off' })).toBeVisible();
  });
});

test('Sessions section — a member reads the state and changes nothing', async ({ page }) => {
  await openSettings(page, MEMBER);
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();

  await expect(page.getByText('Regular sessions')).toBeVisible();
  await expect(page.getByRole('button', { name: /Regular sessions:/ })).toBeHidden(); // plain text, nothing to press
  await expect(page.getByRole('combobox')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeHidden();
  await expect(page.getByText('Only the owner and admins can change this.').last()).toBeVisible();

  await page.getByRole('button', { name: /Tuesday \(1\)/ }).click();
  await expect(page.getByText('18:00–19:30').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Delete Tuesday/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Edit Tuesday/ })).toBeHidden();
});

test('Sessions section — failures show the coded message and change nothing', async ({ page }) => {
  await openSettings(page, OWNED);
  await page.getByRole('button', { name: 'Sessions', exact: true }).click();

  await test.step('1. a refused switch shows the specific message, the switch stays where it was', async () => {
    await page.route(settingsUrl(mockOwnedGroup.id), (route) =>
      route.request().method() === 'PUT' ? route.fulfill(failure(403, 'SESSION_GROUP_ADMIN_REQUIRED')) : route.fallback(),
    );
    await page.getByRole('button', { name: 'Regular sessions: On' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Yes, keep them and turn off' }).click();

    await expect(page.getByRole('alert')).toHaveText('Only the group owner or an admin can do that.');
    await expect(page.getByText('English server prose')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Regular sessions: On' })).toBeVisible();
    await page.unroute(settingsUrl(mockOwnedGroup.id));
  });

  await test.step('2. deleting a configuration that is already gone says so, and the list is unchanged', async () => {
    await page.route(recurrenceUrl(mockOwnedGroup.id, 1), (route) =>
      route.request().method() === 'DELETE' ? route.fulfill(failure(404, 'SESSION_RECURRENCE_NOT_FOUND')) : route.fallback(),
    );
    await page.getByRole('button', { name: /Tuesday \(2\)/ }).click();
    await page.getByRole('button', { name: 'Delete Tuesday at 18:00' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();

    // The refused switch's line is still under the switch: each failure has its own place.
    await expect(page.getByRole('alert').filter({ hasText: 'This configuration no longer exists.' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Tuesday \(2\)/ })).toBeVisible();
  });
});
