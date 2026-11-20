import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { makeSession } from '@/features/session/components/sessionListFixtures';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupSessionShortcut } from './GroupSessionShortcut';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

const ongoing = makeSession({ id: 1, groupId: 5, status: 'ONGOING', title: 'Evening play', participantCount: 9 });
const scheduled = makeSession({ id: 2, groupId: 5, status: 'SCHEDULED', title: 'Late doubles', participantCount: 4 });

type Props = ComponentProps<typeof GroupSessionShortcut>;

function renderShortcut(overrides: Partial<Props> = {}) {
  const props: Props = {
    sessions: [ongoing, scheduled],
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    onCreate: vi.fn(),
    sportsByKey,
    currentUserId: 'user-9',
    onViewDetails: vi.fn(),
    onParticipationAction: vi.fn(),
    isParticipationActionPending: () => false,
    ...overrides,
  };
  render(<GroupSessionShortcut {...props} />);
  return props;
}

describe('GroupSessionShortcut (CLIENT-GROUP-SESSION-1)', () => {
  it("is expanded by default: today's cards in order, then the plus card last", () => {
    renderShortcut();
    const list = screen.getByRole('region', { name: "Today's group sessions" });
    const titles = within(list)
      .getAllByText(/Evening play|Late doubles/)
      .map((node) => node.textContent);
    expect(titles).toEqual(['Evening play', 'Late doubles']);
    const buttons = within(list).getAllByRole('button');
    expect(buttons[buttons.length - 1]).toHaveAccessibleName('Create a session for this group');
  });

  it('shows the joined count only for a group session, never a capacity or open slots', () => {
    renderShortcut();
    expect(screen.getByText('9 joined')).toBeInTheDocument();
    expect(screen.getByText('4 joined')).toBeInTheDocument();
    expect(screen.queryByText(/participant/i)).not.toBeInTheDocument();
  });

  it('collapses and expands from its title, reporting the state', async () => {
    renderShortcut();
    const toggle = screen.getByRole('button', { name: "Today's session" });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: "Today's group sessions" })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(screen.getByRole('region', { name: "Today's group sessions" })).toBeInTheDocument();
  });

  it('opens the create form from the plus card', async () => {
    const props = renderShortcut();
    await userEvent.click(screen.getByRole('button', { name: 'Create a session for this group' }));
    expect(props.onCreate).toHaveBeenCalledTimes(1);
  });

  it('opens a session from its card', async () => {
    const props = renderShortcut();
    await userEvent.click(screen.getByRole('button', { name: 'Evening play — View details' }));
    expect(props.onViewDetails).toHaveBeenCalledWith(1);
  });

  it('shows only the plus row when nothing is on today', () => {
    renderShortcut({ sessions: [] });
    expect(screen.getByRole('button', { name: 'Create a session for this group' })).toHaveTextContent(
      'No session today. Create one',
    );
    expect(screen.queryByText('9 joined')).not.toBeInTheDocument();
  });

  it('shows placeholders while loading, without the old cards, and keeps the plus usable', () => {
    renderShortcut({ isLoading: true, sessions: [] });
    expect(screen.getByRole('region', { name: "Today's group sessions" })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: "Loading today's sessions" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a session for this group' })).toBeInTheDocument();
  });

  it('shows a retry line on a failed load and keeps the plus usable', async () => {
    const props = renderShortcut({ isError: true, sessions: [] });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load today's sessions.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Create a session for this group' }));
    expect(props.onCreate).toHaveBeenCalledTimes(1);
  });
});
