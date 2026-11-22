import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Group, GroupInfo, GroupSettings } from '@/features/feed/types';
import { makeSessionsConfigData } from '../sessionConfig/fixtures';
import { GroupSettingsTab } from './GroupSettingsTab';

function group(overrides: Partial<Group> = {}): Group {
  return {
    id: 1,
    sportId: 5,
    groupName: 'Riverside Ballers',
    description: 'Weeknight pickup games.',
    avatarUrl: null,
    coverUrl: null,
    isPrivate: false,
    isActive: true,
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    memberCount: 42,
    currentUserRole: 'group_member',
    createdAt: '2026-07-15T00:00:00',
    updatedAt: '2026-07-15T00:00:00',
    pinnedPosts: null,
    ...overrides,
  };
}

function groupSettings(overrides: Partial<GroupSettings> = {}): GroupSettings {
  return {
    id: 1,
    groupId: 1,
    allowMemberPosts: true,
    requirePostApproval: false,
    allowMemberInvites: false,
    groupTypeName: 'DEFAULT',
    createdAt: '2026-07-15T00:00:00',
    updatedAt: '2026-07-15T00:00:00',
    ...overrides,
  };
}

function groupInfo(overrides: Partial<GroupInfo> = {}): GroupInfo {
  return {
    groupId: 1,
    groupName: 'Riverside Ballers',
    isPrivate: false,
    description: null,
    avatarUrl: null,
    coverUrl: null,
    rules: 'Be on time.',
    schedule: 'Tuesdays at 7pm.',
    updatedAt: '2026-07-15T00:00:00',
    ...overrides,
  };
}

const baseProps = {
  onUpdatePrivacy: vi.fn(),
  isUpdatingPrivacy: false,
  isUpdatePrivacyError: false,
  onLeave: vi.fn(),
  isLeaving: false,
  isLeaveError: false,
  onRequestDelete: vi.fn(),
  groupSettings: groupSettings(),
  isSettingsLoading: false,
  isSettingsError: false,
  onUpdateSetting: vi.fn(),
  groupInfo: groupInfo(),
  isGroupInfoLoading: false,
  isGroupInfoError: false,
  onUpdateGroupInfoField: vi.fn(),
  onCommitGroupInfoField: vi.fn(),
  groupInfoFieldError: null,
  hasUnsavedPermissionChanges: false,
  onSavePermission: vi.fn(),
  isSavingPermission: false,
  isSavePermissionError: false,
  sessionsConfig: makeSessionsConfigData(),
};

/** Every section starts collapsed (CLIENT-GROUP-SESSION-4): a test that reads one opens it first. */
async function expandAll(user: ReturnType<typeof userEvent.setup>) {
  for (const name of ['General', 'Permission', 'Sessions']) {
    await user.click(screen.getByRole('button', { name }));
  }
}

async function renderExpanded(props: Partial<Parameters<typeof GroupSettingsTab>[0]> & { role: string }) {
  const { role, ...rest } = props;
  const user = userEvent.setup();
  const view = render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole={role} {...rest} />);
  await expandAll(user);
  return { user, ...view };
}

describe('GroupSettingsTab', () => {
  it('renders General, Permission and Sessions as separate collapsible sections, all collapsed by default', () => {
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_owner" />);

    for (const name of ['General', 'Permission', 'Sessions']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('data-state', 'closed');
    }
    // Nothing of a section's content shows until it is opened.
    expect(screen.queryByText('Privacy')).not.toBeInTheDocument();
    expect(screen.queryByText('Allow member posts')).not.toBeInTheDocument();
    expect(screen.queryByText('Regular sessions')).not.toBeInTheDocument();
  });

  it('opening a section shows its content and leaves the others closed; opening it again collapses it', async () => {
    const user = userEvent.setup();
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_owner" />);

    await user.click(screen.getByRole('button', { name: 'General' }));
    expect(screen.getByRole('button', { name: 'General' })).toHaveAttribute('data-state', 'open');
    expect(screen.getByText('Privacy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Permission' })).toHaveAttribute('data-state', 'closed');
    expect(screen.queryByText('Allow member posts')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'General' }));
    expect(screen.queryByText('Privacy')).not.toBeInTheDocument();
  });

  // CLIENT-GROUP-UI-1 (owner, 2026-11-22): a section's title is told from its content by a line under the title and by the
  // content sitting to the right of it.
  it('draws a line under each section title and sets each section content in from the left, closer together', async () => {
    const user = userEvent.setup();
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_owner" />);

    for (const name of ['General', 'Permission', 'Sessions']) {
      const title = screen.getByRole('button', { name });
      expect(title).toHaveClass('border-hairline-b');
      await user.click(title);
      const content = document.getElementById(title.getAttribute('aria-controls')!);
      expect(content).toHaveClass('pl-6');
      expect(content).toHaveClass('gap-2');
    }
  });

  // CLIENT-GROUP-UI-1 (owner, 2026-11-22): a short hint beside each title says what the section holds; it describes the button
  // without changing its name.
  it('shows a short hint beside each section title, as the description of its button', () => {
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_owner" />);
    const hints: Record<string, string> = {
      General: 'Name, privacy, rules and schedule',
      Permission: 'What members can post and invite',
      Sessions: 'Regular sessions made for the group',
    };
    for (const [name, hint] of Object.entries(hints)) {
      expect(screen.getByText(hint)).toBeInTheDocument();
      expect(screen.getByRole('button', { name })).toHaveAccessibleDescription(hint);
    }
  });

  it('member: privacy is read-only, no Delete button, Leave is enabled', async () => {
    await renderExpanded({ role: 'group_member' });

    expect(screen.queryByRole('button', { name: 'Public' })).not.toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getAllByText('Only the owner and admins can change this.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Delete Group' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave Group' })).toBeEnabled();
  });

  it('admin: can edit privacy, no Delete button', async () => {
    const onUpdatePrivacy = vi.fn();
    const { user } = await renderExpanded({ role: 'group_admin', onUpdatePrivacy });

    await user.click(screen.getByRole('button', { name: 'Private' }));
    expect(onUpdatePrivacy).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Delete Group' })).not.toBeInTheDocument();
  });

  it('owner: can edit privacy, Delete button visible and opens the confirm flow, Leave is disabled', async () => {
    const onRequestDelete = vi.fn();
    const { user } = await renderExpanded({ role: 'group_owner', onRequestDelete });

    expect(screen.getByRole('button', { name: 'Public' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave Group' })).toBeDisabled();
    expect(screen.getByText('Transfer ownership to another member before you can leave.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));
    expect(onRequestDelete).toHaveBeenCalled();
  });

  it('surfaces a privacy update error', async () => {
    await renderExpanded({ role: 'group_owner', isUpdatePrivacyError: true });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't update privacy. Try again.");
  });

  it('displays the read-only group type for every role, no cap number', async () => {
    await renderExpanded({ role: 'group_member', groupSettings: groupSettings({ groupTypeName: 'PREMIUM' }) });
    expect(screen.getByText('PREMIUM')).toBeInTheDocument();
    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
  });

  it('member: rules/schedule render as read-only text', async () => {
    await renderExpanded({ role: 'group_member', groupInfo: groupInfo({ rules: 'No slide tackles.', schedule: 'Fridays at 6pm.' }) });
    expect(screen.getByText('No slide tackles.')).toBeInTheDocument();
    expect(screen.getByText('Fridays at 6pm.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rules')).not.toBeInTheDocument(); // no editable textarea
  });

  it('member: shows empty-state copy when rules/schedule are unset', async () => {
    await renderExpanded({ role: 'group_member', groupInfo: groupInfo({ rules: null, schedule: null }) });
    expect(screen.getByText('No rules set yet.')).toBeInTheDocument();
    expect(screen.getByText('No schedule set yet.')).toBeInTheDocument();
  });

  it('admin: can edit rules/schedule, calling onUpdateGroupInfoField', async () => {
    const onUpdateGroupInfoField = vi.fn();
    const { user } = await renderExpanded({ role: 'group_admin', onUpdateGroupInfoField });

    await user.type(screen.getByLabelText('Rules'), '!');
    expect(onUpdateGroupInfoField).toHaveBeenCalledWith('rules', 'Be on time.!');
  });

  // CLIENT-GROUP-SESSION-4: leaving a rules/schedule field saves it, there is no Save button for them.
  it('leaving the Rules field asks the page to save Rules; leaving Schedule asks for Schedule', async () => {
    const onCommitGroupInfoField = vi.fn();
    const { user } = await renderExpanded({ role: 'group_admin', onCommitGroupInfoField });

    await user.click(screen.getByLabelText('Rules'));
    await user.tab();
    expect(onCommitGroupInfoField).toHaveBeenCalledWith('rules');

    await user.click(screen.getByLabelText('Schedule'));
    await user.tab();
    expect(onCommitGroupInfoField).toHaveBeenCalledWith('schedule');
  });

  it('a failed rules/schedule save shows under that field only, with the coded text when there is one', async () => {
    const { rerender } = await renderExpanded({
      role: 'group_admin',
      groupInfoFieldError: { key: 'schedule', text: 'Only the group owner or an admin can do this.' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Only the group owner or an admin can do this.');
    expect(within(screen.getByLabelText('Schedule').parentElement!).getByRole('alert')).toBeInTheDocument();
    expect(within(screen.getByLabelText('Rules').parentElement!).queryByRole('alert')).not.toBeInTheDocument();

    rerender(
      <GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_admin" groupInfoFieldError={{ key: 'rules' }} />,
    );
    expect(within(screen.getByLabelText('Rules').parentElement!).getByRole('alert')).toHaveTextContent("Couldn't save changes. Try again.");
  });

  it('shows a loading/error state for rules/schedule independent of the toggles', async () => {
    const { rerender } = await renderExpanded({ role: 'group_owner', isGroupInfoLoading: true, groupInfo: undefined });
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);

    rerender(
      <GroupSettingsTab
        {...baseProps}
        isGroupInfoError
        groupInfo={undefined}
        group={group()}
        currentUserRole="group_owner"
      />,
    );
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('member: the three GroupSettings toggles are read-only text, no Save button', async () => {
    await renderExpanded({ role: 'group_member' });

    expect(screen.queryByRole('button', { name: 'Allow member posts: On' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByText('Only the owner can change these.')).toBeInTheDocument();
  });

  // CLIENT-GROUP-SESSION-4: the Save button is Permission's, and only the owner edits the toggles.
  it('admin: the toggles stay read-only and there is no Save button (rules/schedule save on blur)', async () => {
    await renderExpanded({ role: 'group_admin' });

    expect(screen.queryByRole('button', { name: /Allow member posts:/ })).not.toBeInTheDocument();
    expect(screen.getByText('Only the owner can change these.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('owner: Save sits inside the Permission section, not at the bottom of the tab', async () => {
    await renderExpanded({ role: 'group_owner' });

    const permission = screen.getByRole('button', { name: 'Permission' }).parentElement!;
    expect(within(permission).getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1);
  });

  it('collapsing Permission hides its Save with it', async () => {
    const { user } = await renderExpanded({ role: 'group_owner' });
    await user.click(screen.getByRole('button', { name: 'Permission' }));
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('owner: can toggle a GroupSettings field, calling onUpdateSetting', async () => {
    const onUpdateSetting = vi.fn();
    const { user } = await renderExpanded({ role: 'group_owner', onUpdateSetting });

    // allowMemberPosts starts true — button's accessible name distinguishes
    // it from the other two toggles' identical "On"/"Off" visible text.
    await user.click(screen.getByRole('button', { name: 'Allow member posts: On' }));
    expect(onUpdateSetting).toHaveBeenCalledWith('allowMemberPosts', false);
  });

  it('owner: Save is disabled with no pending changes, enabled once there are some', async () => {
    const { rerender } = await renderExpanded({ role: 'group_owner' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    rerender(<GroupSettingsTab {...baseProps} hasUnsavedPermissionChanges group={group()} currentUserRole="group_owner" />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('owner: clicking Save calls onSavePermission', async () => {
    const onSavePermission = vi.fn();
    const { user } = await renderExpanded({ role: 'group_owner', onSavePermission, hasUnsavedPermissionChanges: true });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSavePermission).toHaveBeenCalled();
  });

  it('surfaces a Permission save error, with the coded text when there is one', async () => {
    const { rerender } = await renderExpanded({ role: 'group_owner', isSavePermissionError: true, hasUnsavedPermissionChanges: true });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save changes. Try again.");

    rerender(
      <GroupSettingsTab
        {...baseProps}
        isSavePermissionError
        savePermissionErrorText="Only the group owner can do this."
        hasUnsavedPermissionChanges
        group={group()}
        currentUserRole="group_owner"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Only the group owner can do this.');
  });

  it('shows the specific error text for privacy and leave failures (CLIENT-ERR-5)', async () => {
    await renderExpanded({
      role: 'group_admin',
      isUpdatePrivacyError: true,
      privacyErrorText: 'Only the group owner or an admin can do this.',
      isLeaveError: true,
      leaveErrorText: "The owner can't leave the group. Transfer ownership first.",
    });
    const alerts = screen.getAllByRole('alert').map((alert) => alert.textContent);
    expect(alerts).toEqual(
      expect.arrayContaining([
        'Only the group owner or an admin can do this.',
        "The owner can't leave the group. Transfer ownership first.",
      ]),
    );
    expect(screen.queryByText("Couldn't update privacy. Try again.")).not.toBeInTheDocument();
  });

  it('shows a loading state while settings are fetching', async () => {
    await renderExpanded({ role: 'group_owner', isSettingsLoading: true, groupSettings: undefined });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error state and hides the toggles and their Save when settings fail to load', async () => {
    await renderExpanded({ role: 'group_owner', isSettingsError: true, groupSettings: undefined });
    expect(screen.getByText("Couldn't load permission settings.")).toBeInTheDocument();
    expect(screen.queryByText('Allow member posts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  // CLIENT-GROUP-SESSION-4: Leave group asks first.
  describe('Leave group', () => {
    it('opens a confirmation instead of leaving at once', async () => {
      const onLeave = vi.fn();
      const { user } = await renderExpanded({ role: 'group_member', onLeave });

      await user.click(screen.getByRole('button', { name: 'Leave Group' }));
      expect(onLeave).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Leave this group?' })).toBeInTheDocument();
    });

    it('"Stay" closes the dialog and leaves nothing done', async () => {
      const onLeave = vi.fn();
      const { user } = await renderExpanded({ role: 'group_member', onLeave });

      await user.click(screen.getByRole('button', { name: 'Leave Group' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stay' }));
      expect(onLeave).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'Leave this group?' })).not.toBeInTheDocument();
    });

    it('"Leave" leaves, once, and closes the dialog', async () => {
      const onLeave = vi.fn();
      const { user } = await renderExpanded({ role: 'group_member', onLeave });

      await user.click(screen.getByRole('button', { name: 'Leave Group' }));
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave' }));
      expect(onLeave).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog', { name: 'Leave this group?' })).not.toBeInTheDocument();
    });

    it('Escape is the safe way out: nothing is left', async () => {
      const onLeave = vi.fn();
      const { user } = await renderExpanded({ role: 'group_member', onLeave });

      await user.click(screen.getByRole('button', { name: 'Leave Group' }));
      await user.keyboard('{Escape}');
      expect(onLeave).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'Leave this group?' })).not.toBeInTheDocument();
    });
  });

  it('the Sessions section shows the data it is given once opened', async () => {
    await renderExpanded({ role: 'group_owner' });
    expect(screen.getByText('Regular sessions')).toBeInTheDocument();
  });
});
