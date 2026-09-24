import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SessionDateGroup } from '../groupSessionsByDate';
import { makeSession, sportsByKey } from './sessionListFixtures';
import { UpcomingSessionsSection } from './UpcomingSessionsSection';

const groups: SessionDateGroup[] = [
  {
    dateKey: '2026-08-05',
    dateLabel: 'Today',
    sessions: [makeSession({ id: 1, title: 'Sunday pickup run' }), makeSession({ id: 2, title: 'Evening scrimmage' })],
  },
  {
    dateKey: '2026-08-07',
    dateLabel: 'Aug 7, 2026',
    sessions: [makeSession({ id: 3, title: 'Friday 5-a-side', scheduledStart: '2026-08-07T19:00:00' })],
  },
];

const baseProps = {
  groups,
  isLoading: false,
  isError: false,
  hasMore: false,
  isFetchingMore: false,
  onLoadMore: () => {},
  collapsedDateKeys: new Set<string>(),
  onToggleDateGroupCollapsed: () => {},
  sportsByKey,
  currentUserId: 'user-2',
  onViewDetails: () => {},
  onParticipationAction: () => {},
  isParticipationActionPending: () => false,
};

describe('UpcomingSessionsSection', () => {
  it('renders its own labelled region, the day headers and every session card', () => {
    render(<UpcomingSessionsSection {...baseProps} />);
    const region = screen.getByRole('region', { name: 'Upcoming sessions' });
    expect(within(region).getByRole('heading', { name: 'Upcoming sessions' })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Collapse Today' })).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Collapse Aug 7, 2026' })).toBeInTheDocument();
    expect(within(region).getByText('Sunday pickup run')).toBeInTheDocument();
    expect(within(region).getByText('Evening scrimmage')).toBeInTheDocument();
    expect(within(region).getByText('Friday 5-a-side')).toBeInTheDocument();
  });

  it('shows Loading… while loading, and no empty state', () => {
    render(<UpcomingSessionsSection {...baseProps} groups={[]} isLoading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('You have no upcoming sessions.')).not.toBeInTheDocument();
  });

  it('shows its own empty state when there are no upcoming sessions', () => {
    render(<UpcomingSessionsSection {...baseProps} groups={[]} />);
    expect(screen.getByText('You have no upcoming sessions.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('shows an alert on error, without the empty state', () => {
    render(<UpcomingSessionsSection {...baseProps} groups={[]} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your upcoming sessions.");
    expect(screen.queryByText('You have no upcoming sessions.')).not.toBeInTheDocument();
  });

  it('keeps already-loaded sessions visible next to the alert when a later page fails', () => {
    render(<UpcomingSessionsSection {...baseProps} isError />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Sunday pickup run')).toBeInTheDocument();
  });

  it('collapsing a day group calls onToggleDateGroupCollapsed with its dateKey, and hides that day only', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const { rerender } = render(<UpcomingSessionsSection {...baseProps} onToggleDateGroupCollapsed={onToggle} />);

    await user.click(screen.getByRole('button', { name: 'Collapse Today' }));
    expect(onToggle).toHaveBeenCalledWith('2026-08-05');

    rerender(
      <UpcomingSessionsSection
        {...baseProps}
        onToggleDateGroupCollapsed={onToggle}
        collapsedDateKeys={new Set(['2026-08-05'])}
      />,
    );
    expect(screen.queryByText('Sunday pickup run')).not.toBeInTheDocument();
    expect(screen.getByText('Friday 5-a-side')).toBeInTheDocument();
  });

  it('shows "Load more" only when there is another page, and calls onLoadMore', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const { rerender } = render(<UpcomingSessionsSection {...baseProps} hasMore onLoadMore={onLoadMore} />);

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<UpcomingSessionsSection {...baseProps} hasMore={false} onLoadMore={onLoadMore} />);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('disables the button and says Loading… while the next page is fetching', () => {
    render(<UpcomingSessionsSection {...baseProps} hasMore isFetchingMore />);
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
  });

  it('passes card actions through (View details opens the session)', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    render(<UpcomingSessionsSection {...baseProps} onViewDetails={onViewDetails} />);
    await user.click(screen.getByRole('button', { name: 'Friday 5-a-side — View details' }));
    expect(onViewDetails).toHaveBeenCalledWith(3);
  });
});
