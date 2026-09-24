import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { getViewerZoneId } from '@/shared/lib/viewerZone';
import { sessionKeys } from '../queryKeys';
import { HistoryDateSessions } from './HistoryDateSessions';
import { makePage, makeSession, sportsByKey } from './sessionListFixtures';

const SPORT_ID = 6;
const DATE = '2026-09-14';

/**
 * `HistoryDateSessions` is the one connected component in the History section (see its doc
 * comment), so its stories seed TanStack Query's cache for the exact key it reads instead of
 * hitting a network — `staleTime: Infinity` keeps it from ever refetching. Loading/error states
 * (which need a live request) are covered by its Vitest file rather than faked here.
 */
function seededClient(pages: ReturnType<typeof makePage>[]) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(sessionKeys.historyDate(SPORT_ID, DATE, getViewerZoneId()), {
    pages,
    pageParams: pages.map((_, index) => index),
  });
  return client;
}

const meta = {
  title: 'Session/HistoryDateSessions',
  component: HistoryDateSessions,
  args: {
    date: DATE,
    dateLabel: 'Sep 14, 2026',
    sportId: SPORT_ID,
    sportsByKey,
    currentUserId: 'user-2',
    onViewDetails: () => {},
    onParticipationAction: () => {},
    isParticipationActionPending: (): boolean => false,
  },
} satisfies Meta<typeof HistoryDateSessions>;

export default meta;
type Story = StoryObj<typeof meta>;

const twoSessions = [
  makeSession({ id: 1, title: 'Morning run', status: 'COMPLETED' }),
  makeSession({ id: 2, title: 'Cancelled game', status: 'CANCELLED', scheduledStart: '2026-09-14T18:00:00' }),
];

export const Default: Story = {
  decorators: [
    (Story) => (
      <QueryClientProvider client={seededClient([makePage(twoSessions)])}>
        <div style={{ maxWidth: 420 }}>{Story()}</div>
      </QueryClientProvider>
    ),
  ],
};

/** A date with more than 20 sessions — the nested "Load more" is named for its date. */
export const WithLoadMore: Story = {
  decorators: [
    (Story) => (
      <QueryClientProvider client={seededClient([makePage(twoSessions, { last: false })])}>
        <div style={{ maxWidth: 420 }}>{Story()}</div>
      </QueryClientProvider>
    ),
  ],
};
