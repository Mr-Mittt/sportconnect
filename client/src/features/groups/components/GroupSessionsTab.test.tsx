import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format, subDays } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { useGroupSessionsTabStore } from '@/app/groupSessionsTabStore';
import { makeSession } from '@/features/session/components/sessionListFixtures';
import { GROUP_SESSION_STATUS_DEFAULTS } from '@/features/session/groupSessionStatuses';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupSessionsTab } from './GroupSessionsTab';

/** The connected tab, end to end over a fake API: the data hook, the filters, the history dates and a date's own list. */

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
const older = format(subDays(new Date(), 6), 'yyyy-MM-dd');

function page(content: unknown[]) {
  return { content, number: 0, last: true, totalPages: 1, totalElements: content.length, size: 20, first: true, numberOfElements: content.length, empty: content.length === 0 };
}

function serve() {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, config?: { params?: Record<string, string> }) => {
    const params = config?.params ?? {};
    let data: unknown = page([]);
    if (url.endsWith('/today')) data = page([makeSession({ id: 1, groupId: 5, status: 'ONGOING', title: 'Evening play' })]);
    else if (url.endsWith('/later')) data = page([makeSession({ id: 2, groupId: 5, status: 'SCHEDULED', title: 'Next week doubles' })]);
    else if (url.endsWith('/history/dates')) {
      data = { dates: [{ date: yesterday, count: 1 }, { date: older, count: 2 }], hasMore: false, nextBefore: format(subDays(new Date(), 30), 'yyyy-MM-dd') };
    } else if (url.endsWith('/history')) {
      data = page([makeSession({ id: params.date === yesterday ? 3 : 4, groupId: 5, status: 'COMPLETED', title: params.date === yesterday ? 'Finished yesterday' : 'Finished last week' })]);
    }
    return { data: { success: true, message: '', data, timestamp: '' } };
  });
}

function renderTab() {
  const onCreate = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GroupSessionsTab
        groupId={5}
        onCreate={onCreate}
        sportsByKey={sportsByKey}
        currentUserId="user-9"
        onViewDetails={vi.fn()}
        onParticipationAction={vi.fn()}
        isParticipationActionPending={() => false}
      />
    </QueryClientProvider>,
  );
  return { onCreate };
}

beforeEach(() => {
  useGroupSessionsTabStore.setState({
    statuses: {
      today: [...GROUP_SESSION_STATUS_DEFAULTS.today],
      others: [...GROUP_SESSION_STATUS_DEFAULTS.others],
      history: [...GROUP_SESSION_STATUS_DEFAULTS.history],
    },
  });
});

afterEach(() => vi.restoreAllMocks());

describe('GroupSessionsTab (CLIENT-GROUP-SESSION-2)', () => {
  it("lists today's sessions, collapses Others, and opens yesterday's history date by itself", async () => {
    const get = serve();
    renderTab();

    expect(await screen.findByText('Evening play')).toBeInTheDocument();
    expect(screen.queryByText('Next week doubles')).not.toBeInTheDocument();
    // History: both dates as rows with their counts; yesterday's sessions are loaded and shown, the older date's are not.
    expect(await screen.findByText('Finished yesterday')).toBeInTheDocument();
    expect(screen.queryByText('Finished last week')).not.toBeInTheDocument();
    // Every one of the 30 days before today has a row; only yesterday's (1) is open, and no request is made for a day with no session.
    expect(screen.getAllByRole('button', { name: /^(Expand|Collapse) / })).toHaveLength(30);
    expect(screen.getAllByRole('button', { name: /^Expand .*\(0\)/ })).toHaveLength(28);
    expect(get.mock.calls.filter(([url]) => String(url).endsWith('/history'))).toHaveLength(1);
  });

  it('opening an older date loads its sessions then, not before', async () => {
    const get = serve();
    renderTab();
    await screen.findByText('Finished yesterday');

    await userEvent.setup().click(screen.getByRole('button', { name: /^Expand .*\(2\)/ }));
    expect(await screen.findByText('Finished last week')).toBeInTheDocument();
    expect(get.mock.calls.filter(([url]) => String(url).endsWith('/history'))).toHaveLength(2);
  });

  it('opens Others on demand and lists what the server returned for it', async () => {
    serve();
    renderTab();
    await screen.findByText('Evening play');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Other sessions' }));
    expect(await screen.findByText('Next week doubles')).toBeInTheDocument();
  });

  it("changing Today's filter asks again with the new statuses, and the choice is kept in the store", async () => {
    const get = serve();
    const user = userEvent.setup();
    renderTab();
    await screen.findByText('Evening play');

    await user.click(within(screen.getByRole('region', { name: "Today's sessions" })).getByRole('button', { name: /Filter/ }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Cancelled' }));

    await waitFor(() => {
      const todayCalls = get.mock.calls.filter(([url]) => String(url).endsWith('/today'));
      expect(todayCalls).toHaveLength(2);
      expect((todayCalls[1][1] as { params: { status: string } }).params.status).toBe('ONGOING,SCHEDULED,PREPARING,CANCELLED');
    });
    expect(useGroupSessionsTabStore.getState().statuses.today).toEqual(['ONGOING', 'SCHEDULED', 'PREPARING', 'CANCELLED']);
  });

  it('unticking every status of a section asks for nothing and says to select one', async () => {
    const get = serve();
    const user = userEvent.setup();
    useGroupSessionsTabStore.getState().setStatuses('history', ['COMPLETED']);
    renderTab();
    await screen.findByText('Finished yesterday');
    const historyCallsBefore = get.mock.calls.filter(([url]) => String(url).includes('/history')).length;

    await user.click(within(screen.getByRole('region', { name: 'History' })).getByRole('button', { name: /Filter/ }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Completed' }));

    expect(await screen.findByText('Select at least one status.')).toBeInTheDocument();
    expect(get.mock.calls.filter(([url]) => String(url).includes('/history'))).toHaveLength(historyCallsBefore);
  });

  it('the Create session button hands over to the page', async () => {
    serve();
    const { onCreate } = renderTab();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Create session' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
