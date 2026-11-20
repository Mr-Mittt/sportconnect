import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { makeSession } from '@/features/session/components/sessionListFixtures';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupHistoryDateSessions } from './GroupHistoryDateSessions';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

function page(content: unknown[], number: number, last: boolean) {
  return { content, number, last, totalPages: 2, totalElements: 2, size: 20, first: number === 0, numberOfElements: content.length, empty: content.length === 0 };
}

function renderDate() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <GroupHistoryDateSessions
        groupId={5}
        date="2026-11-19"
        dateLabel="Nov 19, 2026"
        statuses={['COMPLETED', 'CANCELLED']}
        sportsByKey={sportsByKey}
        currentUserId="user-9"
        onViewDetails={vi.fn()}
        onParticipationAction={vi.fn()}
        isParticipationActionPending={() => false}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('GroupHistoryDateSessions (CLIENT-GROUP-SESSION-2)', () => {
  it("fetches the date's sessions with its statuses and the viewer zone, 20 at a time, and lists them", async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: { success: true, message: '', data: page([makeSession({ id: 1, groupId: 5, status: 'COMPLETED', title: 'Done early' })], 0, true), timestamp: '' },
    });
    renderDate();
    expect(await screen.findByText('Done early')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/sessions/group/5/history', {
      params: { date: '2026-11-19', status: 'COMPLETED,CANCELLED', viewerZoneId: getViewerZoneId(), page: 0, size: 20 },
    });
    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
  });

  it('has its own Load more, named for the date, for a date with more than a page', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (_url: string, config?: { params?: { page?: number } }) => ({
      data: {
        success: true,
        message: '',
        data: config?.params?.page === 1
          ? page([makeSession({ id: 2, groupId: 5, status: 'CANCELLED', title: 'Second page' })], 1, true)
          : page([makeSession({ id: 1, groupId: 5, status: 'COMPLETED', title: 'First page' })], 0, false),
        timestamp: '',
      },
    }));
    renderDate();
    await screen.findByText('First page');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Load more sessions for Nov 19, 2026' }));
    expect(await screen.findByText('Second page')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('shows loading, then an error line when the date cannot be loaded', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('boom'));
    renderDate();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load these sessions."));
  });
});
