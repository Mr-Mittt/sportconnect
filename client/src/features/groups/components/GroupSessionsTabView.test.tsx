import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import { makeSession } from '@/features/session/components/sessionListFixtures';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupSessionsTabView } from './GroupSessionsTabView';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

type Props = ComponentProps<typeof GroupSessionsTabView>;

const idle = { isLoading: false, isError: false, onRetry: vi.fn() };

/** The month filter's props (CLIENT-GROUP-UI-1): November 2026, a month back allowed, none forward. */
const month = (overrides: Partial<{ month: string; canGoPrevious: boolean; canGoNext: boolean; onPreviousMonth: () => void; onNextMonth: () => void }> = {}) => ({
  month: '2026-11',
  canGoPrevious: true,
  canGoNext: false,
  onPreviousMonth: vi.fn(),
  onNextMonth: vi.fn(),
  ...overrides,
});

function props(overrides: Partial<Props> = {}): Props {
  return {
    statuses: { today: ['ONGOING', 'SCHEDULED', 'PREPARING'], others: ['PREPARING', 'SCHEDULED'], history: ['COMPLETED'] },
    onStatusesChange: vi.fn(),
    today: { ...idle, sessions: [] },
    others: { ...idle, sessions: [], hasMore: false, isFetchingMore: false, onLoadMore: vi.fn() },
    history: { ...idle, dates: [], ...month(), expandedDates: new Set(), onToggleDate: vi.fn() },
    todayKey: '2026-11-20',
    onCreate: vi.fn(),
    renderDateSessions: (date) => <p>sessions of {date}</p>,
    sportsByKey,
    currentUserId: 'user-9',
    onViewDetails: vi.fn(),
    onParticipationAction: vi.fn(),
    isParticipationActionPending: () => false,
    ...overrides,
  };
}

function renderView(overrides: Partial<Props> = {}) {
  const p = props(overrides);
  render(<GroupSessionsTabView {...p} />);
  return p;
}

const section = (name: string) => screen.getByRole('region', { name });

describe('GroupSessionsTabView (CLIENT-GROUP-SESSION-2): the sections', () => {
  it("has a Create session button and three sections: Today's and History open, Others collapsed", async () => {
    const p = renderView();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create session' }));
    expect(p.onCreate).toHaveBeenCalledTimes(1);

    expect(within(section("Today's sessions")).getByRole('button', { name: "Today's sessions" })).toHaveAttribute('aria-expanded', 'true');
    expect(within(section('Other sessions')).getByRole('button', { name: 'Other sessions' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(section('History')).getByRole('button', { name: 'History' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('every section has its own status filter, showing how many statuses it has selected', () => {
    renderView();
    expect(within(section("Today's sessions")).getByRole("button", { name: "Filter Today's sessions by status" })).toHaveTextContent('Status (3)');
    expect(within(section('Other sessions')).getByRole('button', { name: 'Filter Other sessions by status' })).toHaveTextContent('Status (2)');
    expect(within(section('History')).getByRole('button', { name: 'Filter History by status' })).toHaveTextContent('Status (1)');
  });

  it('reports a filter change with its section and the new selection', async () => {
    const user = userEvent.setup();
    const p = renderView();
    await user.click(within(section('History')).getByRole('button', { name: /Filter/ }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Cancelled' }));
    expect(p.onStatusesChange).toHaveBeenCalledWith('history', ['COMPLETED', 'CANCELLED']);

    await user.keyboard('{Escape}');
    await user.click(within(section("Today's sessions")).getByRole('button', { name: /Filter/ }));
    expect(screen.getAllByRole('menuitemcheckbox').map((row) => row.textContent)).toEqual([
      'Ongoing', 'Scheduled', 'Preparing', 'Completed', 'Cancelled',
    ]);
  });

  it("offers each section only the statuses it can show: Others and History are narrower than Today's", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(within(section('Other sessions')).getByRole('button', { name: /Filter/ }));
    expect(screen.getAllByRole('menuitemcheckbox').map((row) => row.textContent)).toEqual(['Preparing', 'Scheduled', 'Cancelled']);
    await user.keyboard('{Escape}');
    await user.click(within(section('History')).getByRole('button', { name: /Filter/ }));
    expect(screen.getAllByRole('menuitemcheckbox').map((row) => row.textContent)).toEqual(['Completed', 'Cancelled']);
  });
});

describe("GroupSessionsTabView: Today's and Others", () => {
  const evening = makeSession({ id: 1, groupId: 5, status: 'ONGOING', title: 'Evening play' });
  const doubles = makeSession({ id: 2, groupId: 5, status: 'SCHEDULED', title: 'Late doubles' });

  it("lists today's sessions in the order given", () => {
    renderView({ today: { ...idle, sessions: [evening, doubles] } });
    const titles = within(section("Today's sessions")).getAllByText(/Evening play|Late doubles/).map((node) => node.textContent);
    expect(titles).toEqual(['Evening play', 'Late doubles']);
  });

  it('shows a centered hint for an empty section', () => {
    renderView();
    expect(within(section("Today's sessions")).getByText('No session today.')).toBeInTheDocument();
  });

  it('shows loading, and an error with a retry that calls onRetry', async () => {
    const onRetry = vi.fn();
    renderView({ today: { sessions: [], isLoading: true, isError: false, onRetry } });
    expect(within(section("Today's sessions")).getByText('Loading sessions…')).toBeInTheDocument();

    document.body.innerHTML = '';
    renderView({ today: { sessions: [], isLoading: false, isError: true, onRetry } });
    const today = section("Today's sessions");
    expect(within(today).getByRole('alert')).toHaveTextContent("Couldn't load these sessions.");
    await userEvent.setup().click(within(today).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('asks to select a status, instead of "nothing here", when a section has none selected', () => {
    renderView({ statuses: { today: [], others: ['SCHEDULED'], history: ['COMPLETED'] } });
    expect(within(section("Today's sessions")).getByText('Select at least one status.')).toBeInTheDocument();
    expect(within(section("Today's sessions")).queryByText('No session today.')).not.toBeInTheDocument();
  });

  it('Others starts collapsed, lists its sessions once opened, and has a Load more only while there is more', async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    renderView({ others: { ...idle, sessions: [doubles], hasMore: true, isFetchingMore: false, onLoadMore } });
    expect(screen.queryByText('Late doubles')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Other sessions' }));
    expect(within(section('Other sessions')).getByText('Late doubles')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more sessions' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('hides Others\' Load more when there is no more', async () => {
    const user = userEvent.setup();
    renderView({ others: { ...idle, sessions: [doubles], hasMore: false, isFetchingMore: false, onLoadMore: vi.fn() } });
    await user.click(screen.getByRole('button', { name: 'Other sessions' }));
    expect(screen.queryByRole('button', { name: 'Load more sessions' })).not.toBeInTheDocument();
  });
});

describe('GroupSessionsTabView: History', () => {
  const dates = [
    { date: '2026-11-19', count: 2 },
    { date: '2026-11-14', count: 1 },
  ];

  it('shows one row per end date as "<date> (<count>)", only the expanded one with its sessions', () => {
    renderView({
      history: { ...idle, dates, ...month(), expandedDates: new Set(['2026-11-19']), onToggleDate: vi.fn() },
    });
    const history = section('History');
    const rows = within(history).getAllByRole('button', { name: /^(Expand|Collapse) / });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('aria-expanded', 'true');
    expect(rows[0]).toHaveAccessibleName(/Collapse .*\(2\)/);
    expect(rows[1]).toHaveAttribute('aria-expanded', 'false');
    expect(rows[1]).toHaveAccessibleName(/Expand .*\(1\)/);
    expect(within(history).getByText('sessions of 2026-11-19')).toBeInTheDocument();
    expect(within(history).queryByText('sessions of 2026-11-14')).not.toBeInTheDocument();
  });

  it('toggles a date by its row', async () => {
    const onToggleDate = vi.fn();
    renderView({
      history: { ...idle, dates, ...month(), expandedDates: new Set(), onToggleDate },
    });
    await userEvent.setup().click(within(section('History')).getAllByRole('button', { name: /^Expand / })[1]);
    expect(onToggleDate).toHaveBeenCalledWith('2026-11-14');
  });

  it('labels today\'s date "Today" (a finished session of today never lists, but the label rule is the Matches one)', () => {
    renderView({
      todayKey: '2026-11-19',
      history: { ...idle, dates, ...month(), expandedDates: new Set(), onToggleDate: vi.fn() },
    });
    expect(within(section('History')).getByRole('button', { name: 'Expand Today (2)' })).toBeInTheDocument();
  });

  // CLIENT-GROUP-SESSION-2 (owner, 2026-11-20): History lists every day of the window, whether or not it has a finished session.
  it('shows a day with no finished session as a row reading "(0)", and opening it says so without asking for sessions', async () => {
    const renderDateSessions = vi.fn((date: string) => <p>sessions of {date}</p>);
    renderView({
      renderDateSessions,
      history: {
        ...idle,
        dates: [{ date: '2026-11-19', count: 0 }, { date: '2026-11-18', count: 2 }],
        ...month(),
        expandedDates: new Set(['2026-11-19']),
        onToggleDate: vi.fn(),
      },
    });
    const history = section('History');
    const rows = within(history).getAllByRole('button', { name: /^(Expand|Collapse) / });
    expect(rows[0]).toHaveAccessibleName(/Collapse .*\(0\)/);
    expect(rows[1]).toHaveAccessibleName(/Expand .*\(2\)/);
    expect(within(history).getByText('No session on this day.')).toBeInTheDocument();
    expect(renderDateSessions).not.toHaveBeenCalled();
  });

  it('shows one hint instead of a row per day for a month with no finished session', () => {
    renderView({
      history: {
        ...idle,
        dates: [{ date: '2026-11-19', count: 0 }, { date: '2026-11-18', count: 0 }],
        ...month(),
        expandedDates: new Set(),
        onToggleDate: vi.fn(),
      },
    });
    const history = section('History');
    expect(within(history).getByText('No finished session in November 2026.')).toBeInTheDocument();
    expect(within(history).queryByRole('button', { name: /^Expand / })).not.toBeInTheDocument();
  });

  it('has no Load more for the history: the month filter replaced it', () => {
    renderView({ history: { ...idle, dates, ...month(), expandedDates: new Set(), onToggleDate: vi.fn() } });
    expect(screen.queryByRole('button', { name: 'Load the previous 30 days' })).not.toBeInTheDocument();
  });

  it('shows the month in the History header with arrows that call back, each disabled at its limit', async () => {
    const onPreviousMonth = vi.fn();
    const onNextMonth = vi.fn();
    renderView({
      history: { ...idle, dates, ...month({ canGoNext: true, onPreviousMonth, onNextMonth }), expandedDates: new Set(), onToggleDate: vi.fn() },
    });
    const history = section('History');
    expect(within(history).getByText('November 2026')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(history).getByRole('button', { name: 'Previous month' }));
    await user.click(within(history).getByRole('button', { name: 'Next month' }));
    expect(onPreviousMonth).toHaveBeenCalledTimes(1);
    expect(onNextMonth).toHaveBeenCalledTimes(1);
  });

  it('disables the previous arrow at the first month and the next arrow at the latest month', () => {
    renderView({ history: { ...idle, dates, ...month({ canGoPrevious: false, canGoNext: false }), expandedDates: new Set(), onToggleDate: vi.fn() } });
    const history = section('History');
    expect(within(history).getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(within(history).getByRole('button', { name: 'Next month' })).toBeDisabled();
  });

  it('shows an error with retry for the date list, and the select-a-status hint when none is chosen', () => {
    renderView({ history: { dates: [], isLoading: false, isError: true, onRetry: vi.fn(), ...month(), expandedDates: new Set(), onToggleDate: vi.fn() } });
    expect(within(section('History')).getByRole('alert')).toBeInTheDocument();
  });

  it('asks to select a status when History has none selected', () => {
    renderView({ statuses: { today: ['ONGOING'], others: ['SCHEDULED'], history: [] } });
    expect(within(section('History')).getByText('Select at least one status.')).toBeInTheDocument();
  });
});

describe('GroupSessionsTabView: language', () => {
  it('renders Vietnamese copy when the locale is vi', async () => {
    await i18n.changeLanguage('vi');
    renderView();
    expect(screen.getByRole('button', { name: 'Tạo buổi chơi' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Buổi chơi hôm nay' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Các buổi chơi khác' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Lịch sử' })).toBeInTheDocument();
    expect(screen.getByText('Hôm nay chưa có buổi chơi nào.')).toBeInTheDocument();
    await i18n.changeLanguage('en');
  });
});
