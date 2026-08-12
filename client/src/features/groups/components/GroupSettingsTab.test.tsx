import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Group, GroupInfo, GroupSettings } from '@/features/feed/types';
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
  hasUnsavedSettingsChanges: false,
  onSaveSettings: vi.fn(),
  isSavingSettings: false,
  isSaveSettingsError: false,
};

describe('GroupSettingsTab', () => {
  it('renders General and Permission as separate, default-expanded collapsible sections', () => {
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_owner" />);

    expect(screen.getByRole('button', { name: 'General' })).toHaveAttribute('data-state', 'open');
    expect(screen.getByRole('button', { name: 'Permission' })).toHaveAttribute('data-state', 'open');
    // Content from both sections is visible at once.
    expect(screen.getByText('Privacy')).toBeInTheDocument();
    expect(screen.getByText('Allow member posts')).toBeInTheDocument();
  });

  it('collapsing General hides its content but leaves Permission open', async () => {
    const user = userEvent.setup();
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_owner" />);

    await user.click(screen.getByRole('button', { name: 'General' }));
    expect(screen.getByRole('button', { name: 'General' })).toHaveAttribute('data-state', 'closed');
    expect(screen.queryByText('Privacy')).not.toBeInTheDocument();
    expect(screen.getByText('Allow member posts')).toBeInTheDocument();
  });

  it('member: privacy is read-only, no Delete button, Leave is enabled', () => {
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_member" />);

    expect(screen.queryByRole('button', { name: 'Public' })).not.toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Only the owner and admins can change this.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Group' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave Group' })).toBeEnabled();
  });

  it('admin: can edit privacy, no Delete button', async () => {
    const user = userEvent.setup();
    const onUpdatePrivacy = vi.fn();
    render(
      <GroupSettingsTab
        {...baseProps}
        onUpdatePrivacy={onUpdatePrivacy}
        group={group()}
        currentUserRole="group_admin"
      />,
    );

    const privateButton = screen.getByRole('button', { name: 'Private' });
    await user.click(privateButton);
    expect(onUpdatePrivacy).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('button', { name: 'Delete Group' })).not.toBeInTheDocument();
  });

  it('owner: can edit privacy, Delete button visible and opens the confirm flow, Leave is disabled', async () => {
    const user = userEvent.setup();
    const onRequestDelete = vi.fn();
    render(
      <GroupSettingsTab
        {...baseProps}
        onRequestDelete={onRequestDelete}
        group={group()}
        currentUserRole="group_owner"
      />,
    );

    expect(screen.getByRole('button', { name: 'Public' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave Group' })).toBeDisabled();
    expect(
      screen.getByText('Transfer ownership to another member before you can leave.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Group' }));
    expect(onRequestDelete).toHaveBeenCalled();
  });

  it('surfaces a privacy update error', () => {
    render(
      <GroupSettingsTab
        {...baseProps}
        isUpdatePrivacyError
        group={group()}
        currentUserRole="group_owner"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't update privacy. Try again.");
  });

  it('displays the read-only group type for every role, no cap number', () => {
    render(
      <GroupSettingsTab
        {...baseProps}
        group={group()}
        currentUserRole="group_member"
        groupSettings={groupSettings({ groupTypeName: 'PREMIUM' })}
      />,
    );
    expect(screen.getByText('PREMIUM')).toBeInTheDocument();
    expect(screen.queryByText(/500/)).not.toBeInTheDocument();
  });

  it('member: rules/schedule render as read-only text', () => {
    render(
      <GroupSettingsTab
        {...baseProps}
        group={group()}
        currentUserRole="group_member"
        groupInfo={groupInfo({ rules: 'No slide tackles.', schedule: 'Fridays at 6pm.' })}
      />,
    );
    expect(screen.getByText('No slide tackles.')).toBeInTheDocument();
    expect(screen.getByText('Fridays at 6pm.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rules')).not.toBeInTheDocument(); // no editable textarea
  });

  it('member: shows empty-state copy when rules/schedule are unset', () => {
    render(
      <GroupSettingsTab
        {...baseProps}
        group={group()}
        currentUserRole="group_member"
        groupInfo={groupInfo({ rules: null, schedule: null })}
      />,
    );
    expect(screen.getByText('No rules set yet.')).toBeInTheDocument();
    expect(screen.getByText('No schedule set yet.')).toBeInTheDocument();
  });

  it('admin: can edit rules/schedule, calling onUpdateGroupInfoField', async () => {
    const user = userEvent.setup();
    const onUpdateGroupInfoField = vi.fn();
    render(
      <GroupSettingsTab
        {...baseProps}
        onUpdateGroupInfoField={onUpdateGroupInfoField}
        group={group()}
        currentUserRole="group_admin"
      />,
    );

    const rulesField = screen.getByLabelText('Rules');
    await user.type(rulesField, '!');
    expect(onUpdateGroupInfoField).toHaveBeenCalledWith('rules', 'Be on time.!');
  });

  it('shows a loading/error state for rules/schedule independent of the toggles', () => {
    const { rerender } = render(
      <GroupSettingsTab
        {...baseProps}
        isGroupInfoLoading
        groupInfo={undefined}
        group={group()}
        currentUserRole="group_owner"
      />,
    );
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

  it('member: the three GroupSettings toggles are read-only text, no Save button', () => {
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_member" />);

    expect(screen.queryByRole('button', { name: 'On' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Off' })).not.toBeInTheDocument();
    expect(screen.getAllByText('On')).toHaveLength(1); // allowMemberPosts, plain text
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.getByText('Only the owner can change these.')).toBeInTheDocument();
  });

  it('admin: the three GroupSettings toggles stay read-only, but Save is present (rules/schedule are still theirs to edit)', () => {
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_admin" />);

    expect(screen.queryByRole('button', { name: /Allow member posts:/ })).not.toBeInTheDocument();
    expect(screen.getByText('Only the owner can change these.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('owner: can toggle a GroupSettings field, calling onUpdateSetting', async () => {
    const user = userEvent.setup();
    const onUpdateSetting = vi.fn();
    render(
      <GroupSettingsTab
        {...baseProps}
        onUpdateSetting={onUpdateSetting}
        group={group()}
        currentUserRole="group_owner"
      />,
    );

    // allowMemberPosts starts true — button's accessible name distinguishes
    // it from the other two toggles' identical "On"/"Off" visible text.
    await user.click(screen.getByRole('button', { name: 'Allow member posts: On' }));
    expect(onUpdateSetting).toHaveBeenCalledWith('allowMemberPosts', false);
  });

  it('owner: Save is disabled with no pending changes, enabled once there are some', () => {
    const { rerender } = render(
      <GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_owner" />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    rerender(
      <GroupSettingsTab
        {...baseProps}
        hasUnsavedSettingsChanges
        group={group()}
        currentUserRole="group_owner"
      />,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('owner: clicking Save calls onSaveSettings', async () => {
    const user = userEvent.setup();
    const onSaveSettings = vi.fn();
    render(
      <GroupSettingsTab
        {...baseProps}
        onSaveSettings={onSaveSettings}
        hasUnsavedSettingsChanges
        group={group()}
        currentUserRole="group_owner"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSaveSettings).toHaveBeenCalled();
  });

  it('surfaces a save error', () => {
    render(
      <GroupSettingsTab
        {...baseProps}
        isSaveSettingsError
        hasUnsavedSettingsChanges
        group={group()}
        currentUserRole="group_owner"
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save changes. Try again.");
  });

  it('member: no Save button at all (nothing editable)', () => {
    render(<GroupSettingsTab {...baseProps} group={group()} currentUserRole="group_member" />);
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('shows a loading state while settings are fetching', () => {
    render(
      <GroupSettingsTab
        {...baseProps}
        isSettingsLoading
        groupSettings={undefined}
        group={group()}
        currentUserRole="group_owner"
      />,
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows an error state and hides the toggles when settings fail to load, but Save stays available for rules/schedule', () => {
    render(
      <GroupSettingsTab
        {...baseProps}
        isSettingsError
        groupSettings={undefined}
        group={group()}
        currentUserRole="group_owner"
      />,
    );
    expect(screen.getByText("Couldn't load permission settings.")).toBeInTheDocument();
    expect(screen.queryByText('Allow member posts')).not.toBeInTheDocument();
    // Save is scoped to canEdit (owner/admin), not gated on the toggles
    // loading successfully — rules/schedule can still be edited and saved.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
