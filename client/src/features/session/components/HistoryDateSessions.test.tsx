import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/app/apiClient';
import { makePage, makeSession, sportsByKey } from './sessionListFixtures';
import { HistoryDateSessions } from './HistoryDateSessions';

function renderConnected(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const baseProps = {
  date: '2026-09-14',
  dateLabel: 'Sep 14, 2026',
  sportId: 6,
  sportsByKey,
  currentUserId: 'user-2',
  onViewDetails: () => {},
  onParticipationAction: () => {},
  isParticipationActionPending: () => false,
};

function apiResponse<T>(data: T) {
  return { data: { success: true, message: '', data, timestamp: '' } };
}

afterEach(() => vi.restoreAllMocks());

describe('HistoryDateSessions', () => {
  it("fetches that date's sessions for the sport in the viewer's zone, and renders a card each", async () => {
    const spy = vi.spyOn(apiClient, 'get').mockResolvedValue(
      apiResponse(
        makePage([
          makeSession({ id: 1, title: 'Morning run', status: 'COMPLETED' }),
          makeSession({ id: 2, title: 'Cancelled game', status: 'CANCELLED' }),
        ]),
      ),
    );
    renderConnected(<HistoryDateSessions {...baseProps} />);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText('Morning run')).toBeInTheDocument();
    expect(screen.getByText('Cancelled game')).toBeInTheDocument();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('/sessions/history', {
      params: {
        date: '2026-09-14',
        sportId: 6,
        viewerZoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
        page: 0,
        size: 20,
      },
    });
  });

  it('a date with more than 20 sessions gets a nested "Load more" named for its date, which fetches the next page', async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(apiClient, 'get').mockImplementation(async (_url, config) =>
      config?.params?.page === 1
        ? apiResponse(makePage([makeSession({ id: 21, title: 'Session 21' })], { number: 1, last: true }))
        : apiResponse(makePage([makeSession({ id: 1, title: 'Session 1' })], { number: 0, last: false })),
    );
    renderConnected(<HistoryDateSessions {...baseProps} />);

    await screen.findByText('Session 1');
    await user.click(screen.getByRole('button', { name: 'Load more sessions for Sep 14, 2026' }));

    expect(await screen.findByText('Session 21')).toBeInTheDocument();
    expect(screen.getByText('Session 1')).toBeInTheDocument(); // still there — pages merge
    expect(spy).toHaveBeenLastCalledWith('/sessions/history', {
      params: expect.objectContaining({ date: '2026-09-14', page: 1 }),
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Load more sessions for Sep 14, 2026' })).not.toBeInTheDocument(),
    );
  });

  it('shows no "Load more" for a single-page date', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(apiResponse(makePage([makeSession({ id: 1, title: 'Only one' })])));
    renderConnected(<HistoryDateSessions {...baseProps} />);
    await screen.findByText('Only one');
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  it('shows an alert if the fetch fails', async () => {
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('boom'));
    renderConnected(<HistoryDateSessions {...baseProps} />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load these sessions.");
  });

  it('does not re-request a date whose data is already cached when it is re-mounted (collapse → re-expand)', async () => {
    const spy = vi.spyOn(apiClient, 'get').mockResolvedValue(apiResponse(makePage([makeSession({ id: 1, title: 'Cached one' })])));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    const tree = (
      <QueryClientProvider client={queryClient}>
        <HistoryDateSessions {...baseProps} />
      </QueryClientProvider>
    );
    const { unmount } = render(tree);
    await screen.findByText('Cached one');
    unmount();

    render(tree);
    expect(await screen.findByText('Cached one')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
