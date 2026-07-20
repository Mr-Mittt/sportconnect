import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateGroupModal } from './CreateGroupModal';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

const baseProps = {
  isOpen: true,
  onClose: () => {},
  sportsByKey,
  lockedSport: null,
  onSubmit: () => {},
  isSubmitting: false,
  isError: false,
};

describe('CreateGroupModal', () => {
  it('shows a sport picker when no sport is locked', () => {
    render(<CreateGroupModal {...baseProps} />);
    expect(screen.getByLabelText('Sport')).toBeInTheDocument();
  });

  it('hides the sport picker when a sport is locked', () => {
    render(<CreateGroupModal {...baseProps} lockedSport="football" />);
    expect(screen.queryByLabelText('Sport')).not.toBeInTheDocument();
  });

  it('disables submit until the name is long enough and a sport is chosen', async () => {
    const user = userEvent.setup();
    render(<CreateGroupModal {...baseProps} lockedSport="football" />);

    const submit = screen.getByRole('button', { name: 'Create group' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Group name'), 'Ri');
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Group name'), 'verside');
    expect(submit).toBeEnabled();
  });

  it('disables submit when no sport is chosen even with a valid name (unlocked)', async () => {
    const user = userEvent.setup();
    render(<CreateGroupModal {...baseProps} />);

    await user.type(screen.getByLabelText('Group name'), 'Riverside Ballers');
    expect(screen.getByRole('button', { name: 'Create group' })).toBeDisabled();
  });

  it('submits sportId mapped from the locked sport, trimmed name, and isPrivate defaulting false', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateGroupModal {...baseProps} lockedSport="basketball" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Group name'), '  Riverside Ballers  ');
    await user.click(screen.getByRole('button', { name: 'Create group' }));

    expect(onSubmit).toHaveBeenCalledWith({
      sportId: 6,
      groupName: 'Riverside Ballers',
      description: undefined,
      isPrivate: false,
    });
  });

  it('submits the picked sport, description, and isPrivate when checked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateGroupModal {...baseProps} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Group name'), 'Riverside Ballers');
    await user.selectOptions(screen.getByLabelText('Sport'), 'tennis');
    await user.type(screen.getByLabelText('Description (optional)'), 'Weekly matches');
    await user.click(screen.getByLabelText('Private group'));
    await user.click(screen.getByRole('button', { name: 'Create group' }));

    expect(onSubmit).toHaveBeenCalledWith({
      sportId: 2,
      groupName: 'Riverside Ballers',
      description: 'Weekly matches',
      isPrivate: true,
    });
  });

  it('shows a "Creating…" label and disables submit while submitting', () => {
    render(<CreateGroupModal {...baseProps} lockedSport="football" isSubmitting />);
    const button = screen.getByRole('button', { name: 'Creating…' });
    expect(button).toBeDisabled();
  });

  it('shows an error message when isError is true', () => {
    render(<CreateGroupModal {...baseProps} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't create the group");
  });

  it('pre-fills the name field from initialGroupName (GRP-1)', () => {
    render(<CreateGroupModal {...baseProps} lockedSport="football" initialGroupName="Riverside Ballers" />);
    expect(screen.getByLabelText('Group name')).toHaveValue('Riverside Ballers');
    expect(screen.getByRole('button', { name: 'Create group' })).toBeEnabled();
  });
});
