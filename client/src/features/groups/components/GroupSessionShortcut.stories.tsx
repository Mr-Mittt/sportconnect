import type { Meta, StoryObj } from '@storybook/react-vite';
import { makeSession } from '@/features/session/components/sessionListFixtures';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { GroupSessionShortcut } from './GroupSessionShortcut';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
};

const today = new Date();
today.setHours(18, 0, 0, 0);

const ongoing = makeSession({
  id: 1,
  groupId: 5,
  status: 'ONGOING',
  title: 'Tuesday evening play',
  participantCount: 9,
  scheduledStart: today.toISOString(),
});
const scheduled = makeSession({
  id: 2,
  groupId: 5,
  status: 'SCHEDULED',
  title: 'Late doubles',
  participantCount: 4,
  scheduledStart: today.toISOString(),
});
const noLocation = makeSession({
  id: 3,
  groupId: 5,
  status: 'SCHEDULED',
  title: 'Beginners welcome',
  participantCount: 1,
  scheduledStart: today.toISOString(),
  location: null,
});

const meta = {
  title: 'Groups/GroupSessionShortcut',
  component: GroupSessionShortcut,
  args: {
    sessions: [ongoing, scheduled, noLocation],
    isLoading: false,
    isError: false,
    onRetry: () => {},
    onCreate: () => {},
    onSeeAll: () => {},
    sportsByKey,
    currentUserId: 'user-9',
    onViewDetails: () => {},
    onParticipationAction: () => {},
    isParticipationActionPending: () => false,
  },
} satisfies Meta<typeof GroupSessionShortcut>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Expanded (the default): today's ongoing session first, then the scheduled ones, then the "+" card. */
export const Expanded: Story = {};

/** One card and the "+" card. */
export const OneSession: Story = { args: { sessions: [ongoing] } };

/** Nothing on today: only the wide "+" row. */
export const OnlyThePlus: Story = { args: { sessions: [] } };

export const Loading: Story = { args: { isLoading: true, sessions: [] } };

/** A failed load: the retry line, and the "+" still usable. */
export const LoadFailed: Story = { args: { isError: true, sessions: [] } };
