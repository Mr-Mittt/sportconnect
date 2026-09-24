import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SessionDateGroup } from '../groupSessionsByDate';
import { makeSession, sportsByKey } from './sessionListFixtures';
import { UpcomingSessionsSection } from './UpcomingSessionsSection';

const groups: SessionDateGroup[] = [
  {
    dateKey: '2026-08-05',
    dateLabel: 'Today',
    sessions: [
      makeSession({ id: 1, title: 'Sunday pickup run', status: 'ONGOING' }),
      makeSession({ id: 2, title: 'Evening scrimmage', scheduledStart: '2026-08-05T21:00:00' }),
    ],
  },
  {
    dateKey: '2026-08-07',
    dateLabel: 'Aug 7, 2026',
    sessions: [
      // PREPARING now shows up here — it used to be dropped by the rail's client-side status filter.
      makeSession({ id: 3, title: 'Friday 5-a-side', status: 'PREPARING', location: null, feeType: null, scheduledStart: '2026-08-07T19:00:00' }),
    ],
  },
];

const meta = {
  title: 'Session/UpcomingSessionsSection',
  component: UpcomingSessionsSection,
  args: {
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
    isParticipationActionPending: (): boolean => false,
  },
  decorators: [(Story) => <div style={{ maxWidth: 420 }}>{Story()}</div>],
} satisfies Meta<typeof UpcomingSessionsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLoadMore: Story = { args: { hasMore: true } };

export const FetchingMore: Story = { args: { hasMore: true, isFetchingMore: true } };

export const OneDayCollapsed: Story = { args: { collapsedDateKeys: new Set(['2026-08-05']) } };

export const Loading: Story = { args: { groups: [], isLoading: true } };

export const Empty: Story = { args: { groups: [] } };

export const ErrorState: Story = { args: { groups: [], isError: true } };

/** A later page failed — what was already loaded stays visible under the alert. */
export const ErrorAfterPartialLoad: Story = { args: { isError: true } };
