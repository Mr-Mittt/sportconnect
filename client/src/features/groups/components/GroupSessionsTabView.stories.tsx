import type { Meta, StoryObj } from '@storybook/react-vite';
import { makeSession } from '@/features/session/components/sessionListFixtures';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupSessionsTabView } from './GroupSessionsTabView';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

const evening = makeSession({ id: 1, groupId: 5, status: 'ONGOING', title: 'Tuesday evening play', participantCount: 9 });
const doubles = makeSession({ id: 2, groupId: 5, status: 'SCHEDULED', title: 'Late doubles', participantCount: 4 });
const draft = makeSession({ id: 3, groupId: 5, status: 'PREPARING', title: 'Weekend tournament', participantCount: 1, location: null });
const done = makeSession({ id: 4, groupId: 5, status: 'COMPLETED', title: 'Monday play', participantCount: 8 });

const idle = { isLoading: false, isError: false, onRetry: () => {} };
/** The History month filter's props: November 2026, a month back allowed, none forward. */
const historyMonth = { month: '2026-11', canGoPrevious: true, canGoNext: false, onPreviousMonth: () => {}, onNextMonth: () => {} };

const meta = {
  title: 'Groups/GroupSessionsTabView',
  component: GroupSessionsTabView,
  args: {
    statuses: { today: ['ONGOING', 'SCHEDULED', 'PREPARING'], others: ['PREPARING', 'SCHEDULED'], history: ['COMPLETED'] },
    onStatusesChange: () => {},
    today: { ...idle, sessions: [evening, doubles, draft] },
    others: { ...idle, sessions: [doubles], hasMore: true, isFetchingMore: false, onLoadMore: () => {} },
    history: {
      ...idle,
      dates: [{ date: '2026-11-19', count: 2 }, { date: '2026-11-14', count: 1 }],
      ...historyMonth,
      expandedDates: new Set(['2026-11-19']),
      onToggleDate: () => {},
    },
    todayKey: '2026-11-20',
    onCreate: () => {},
    renderDateSessions: () => <p className="text-2sm text-text-muted">{'(the date\'s sessions load here)'}</p>,
    sportsByKey,
    currentUserId: 'user-9',
    onViewDetails: () => {},
    onParticipationAction: () => {},
    isParticipationActionPending: () => false,
  },
} satisfies Meta<typeof GroupSessionsTabView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = {
  args: {
    today: { ...idle, sessions: [] },
    others: { ...idle, sessions: [], hasMore: false, isFetchingMore: false, onLoadMore: () => {} },
    history: { ...idle, dates: [], ...historyMonth, expandedDates: new Set(), onToggleDate: () => {} },
  },
};
export const Loading: Story = {
  args: {
    today: { isLoading: true, isError: false, onRetry: () => {}, sessions: [] },
    history: { isLoading: true, isError: false, onRetry: () => {}, dates: [], ...historyMonth, expandedDates: new Set(), onToggleDate: () => {} },
  },
};
export const LoadFailed: Story = {
  args: { today: { isLoading: false, isError: true, onRetry: () => {}, sessions: [] } },
};
export const NoStatusSelected: Story = {
  args: { statuses: { today: [], others: ['SCHEDULED'], history: [] } },
};
export const WithFinishedSessions: Story = {
  args: { today: { ...idle, sessions: [evening, done] }, statuses: { today: ['ONGOING', 'SCHEDULED', 'PREPARING', 'COMPLETED', 'CANCELLED'], others: ['PREPARING', 'SCHEDULED'], history: ['COMPLETED'] } },
};
/** A month with no finished session: one hint instead of a row per day; both arrows enabled (a month in the middle of the range). */
export const EmptyMonth: Story = {
  args: {
    history: { ...idle, dates: [{ date: '2026-10-31', count: 0 }, { date: '2026-10-30', count: 0 }], ...historyMonth, month: '2026-10', canGoNext: true, expandedDates: new Set(), onToggleDate: () => {} },
  },
};
