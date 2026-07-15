import type { Meta, StoryObj } from '@storybook/react-vite';
import type { GroupBroadcast } from '@/shared/types/rail';
import { GroupBroadcasts } from './GroupBroadcasts';

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

const broadcasts: GroupBroadcast[] = [
  {
    id: 'broadcast-1',
    groupId: 'group-1',
    groupName: 'Riverside Ballers',
    groupInitials: 'RB',
    colorRamp: 'coral',
    text: 'Court booking confirmed for Sunday 9am, see you there.',
    createdAt: hoursAgo(1),
  },
  {
    id: 'broadcast-2',
    groupId: 'group-2',
    groupName: 'FC Weekend Warriors',
    groupInitials: 'FW',
    colorRamp: 'teal',
    text: 'Tournament bracket is posted, check the schedule tab.',
    createdAt: hoursAgo(5),
  },
];

const meta = {
  title: 'Shared/GroupBroadcasts',
  component: GroupBroadcasts,
  args: { onBroadcastClick: () => {} },
  // Constrain to the right rail's width so stories match the page context
  decorators: [(Story) => <div style={{ maxWidth: 360 }}>{Story()}</div>],
} satisfies Meta<typeof GroupBroadcasts>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Mockup parity: two broadcasts with coral and teal group avatars. */
export const Default: Story = {
  args: { broadcasts },
};

/** Long message clamps to two lines instead of stretching the card. */
export const LongTextClamped: Story = {
  args: {
    broadcasts: [
      {
        id: 'broadcast-long',
        groupId: 'group-3',
        groupName: 'Greenwood Tennis Club',
        groupInitials: 'GT',
        colorRamp: 'purple',
        text: 'Annual general meeting this Thursday at the clubhouse — we will vote on the new court resurfacing proposal, review the summer ladder format, discuss the junior coaching program expansion, and finalize the tournament calendar for the rest of the season.',
        createdAt: hoursAgo(3),
      },
      ...broadcasts,
    ],
  },
};

export const Empty: Story = {
  args: { broadcasts: [] },
};
