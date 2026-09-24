import type { Meta, StoryObj } from '@storybook/react-vite';
import type { SessionHistoryDate } from '../types';
import { HistorySection } from './HistorySection';
import { makeSession, sportsByKey } from './sessionListFixtures';
import { SessionCard } from '@/shared/components/SessionCard';

const dates: SessionHistoryDate[] = [
  { date: '2026-09-24', count: 1 },
  { date: '2026-09-14', count: 2 },
  { date: '2026-09-10', count: 1 },
];

// Stands in for the connected `HistoryDateSessions` (which fetches) so this section's own states
// stay a pure function of props here.
const renderDateSessions = (date: string) => (
  <div className="flex flex-col gap-3">
    <SessionCard
      session={makeSession({ id: 1, title: `Morning run on ${date}`, status: 'COMPLETED' })}
      sportsByKey={sportsByKey}
      currentUserId="user-2"
      onViewDetails={() => {}}
      onParticipationAction={() => {}}
      isParticipationActionPending={() => false}
    />
  </div>
);

const meta = {
  title: 'Session/HistorySection',
  component: HistorySection,
  args: {
    dates,
    today: '2026-09-24',
    expandedDates: new Set<string>(),
    onToggleDate: () => {},
    isLoading: false,
    isError: false,
    hasMore: false,
    isFetchingMore: false,
    onLoadMore: () => {},
    renderDateSessions,
  },
  decorators: [(Story) => <div style={{ maxWidth: 420 }}>{Story()}</div>],
} satisfies Meta<typeof HistorySection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every row collapsed — the default: "Today (1)", "Sep 14, 2026 (2)", … */
export const AllCollapsed: Story = {};

export const OneExpanded: Story = { args: { expandedDates: new Set(['2026-09-14']) } };

export const WithLoadMoreDates: Story = { args: { hasMore: true } };

export const FetchingMoreDates: Story = { args: { hasMore: true, isFetchingMore: true } };

export const Loading: Story = { args: { dates: [], isLoading: true } };

export const Empty: Story = { args: { dates: [] } };

export const ErrorState: Story = { args: { dates: [], isError: true } };
