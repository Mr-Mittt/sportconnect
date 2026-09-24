import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SessionHistoryDate } from '../types';
import { HistorySection } from './HistorySection';

const dates: SessionHistoryDate[] = [
  { date: '2026-09-24', count: 1 },
  { date: '2026-09-14', count: 2 },
];

const baseProps = {
  dates,
  today: '2026-09-24',
  expandedDates: new Set<string>(),
  onToggleDate: () => {},
  isLoading: false,
  isError: false,
  hasMore: false,
  isFetchingMore: false,
  onLoadMore: () => {},
  renderDateSessions: (date: string) => <div data-testid={`sessions-${date}`}>sessions for {date}</div>,
};

describe('HistorySection', () => {
  it('renders its own labelled region with one collapsed row per date, formatted "<date> (<count>)"', () => {
    render(<HistorySection {...baseProps} />);
    const region = screen.getByRole('region', { name: 'History' });
    expect(within(region).getByRole('heading', { name: 'History' })).toBeInTheDocument();

    // "Today" special-case for the current calendar day, "MMM d, yyyy" for every other date.
    const today = within(region).getByRole('button', { name: 'Expand Today (1)' });
    expect(today).toHaveTextContent('Today (1)');
    expect(today).toHaveAttribute('aria-expanded', 'false');
    const earlier = within(region).getByRole('button', { name: 'Expand Sep 14, 2026 (2)' });
    expect(earlier).toHaveTextContent('Sep 14, 2026 (2)');
    expect(earlier).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders no date\'s sessions while collapsed (nothing is fetched until the first expand)', () => {
    const renderDateSessions = vi.fn(() => null);
    render(<HistorySection {...baseProps} renderDateSessions={renderDateSessions} />);
    expect(renderDateSessions).not.toHaveBeenCalled();
  });

  it('clicking a row calls onToggleDate with its date', async () => {
    const user = userEvent.setup();
    const onToggleDate = vi.fn();
    render(<HistorySection {...baseProps} onToggleDate={onToggleDate} />);
    await user.click(screen.getByRole('button', { name: 'Expand Sep 14, 2026 (2)' }));
    expect(onToggleDate).toHaveBeenCalledWith('2026-09-14');
  });

  it('an expanded row renders that date\'s sessions via renderDateSessions (with the row label), and only that row', () => {
    const renderDateSessions = vi.fn((date: string, label: string) => (
      <div data-testid={`sessions-${date}`}>{label}</div>
    ));
    render(<HistorySection {...baseProps} expandedDates={new Set(['2026-09-14'])} renderDateSessions={renderDateSessions} />);

    expect(screen.getByRole('button', { name: 'Collapse Sep 14, 2026 (2)' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('sessions-2026-09-14')).toHaveTextContent('Sep 14, 2026');
    expect(screen.queryByTestId('sessions-2026-09-24')).not.toBeInTheDocument();
    expect(renderDateSessions).toHaveBeenCalledTimes(1);
  });

  it('shows its own empty state when there is no history', () => {
    render(<HistorySection {...baseProps} dates={[]} />);
    expect(screen.getByText('No session history yet.')).toBeInTheDocument();
  });

  it('shows Loading… while loading, without the empty state', () => {
    render(<HistorySection {...baseProps} dates={[]} isLoading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('No session history yet.')).not.toBeInTheDocument();
  });

  it('shows an alert on error, without the empty state', () => {
    render(<HistorySection {...baseProps} dates={[]} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load your session history.");
    expect(screen.queryByText('No session history yet.')).not.toBeInTheDocument();
  });

  it('"Load more" after the last date row pages further back; hidden when there is nothing older', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    const { rerender } = render(<HistorySection {...baseProps} hasMore onLoadMore={onLoadMore} />);

    await user.click(screen.getByRole('button', { name: 'Load more history dates' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    rerender(<HistorySection {...baseProps} hasMore={false} onLoadMore={onLoadMore} />);
    expect(screen.queryByRole('button', { name: 'Load more history dates' })).not.toBeInTheDocument();
  });

  it('disables the date-paging button while the next dates are fetching', () => {
    render(<HistorySection {...baseProps} hasMore isFetchingMore />);
    expect(screen.getByRole('button', { name: 'Load more history dates' })).toBeDisabled();
  });
});
