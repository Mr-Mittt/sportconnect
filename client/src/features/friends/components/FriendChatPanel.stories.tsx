import type { Meta, StoryObj } from '@storybook/react-vite';
import { FriendChatPanel } from './FriendChatPanel';

const meta = {
  title: 'Friends/FriendChatPanel',
  component: FriendChatPanel,
  args: {
    otherPersonFirstName: 'Priya',
  },
} satisfies Meta<typeof FriendChatPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty state with the "not built yet" disclaimer — sending a message is interactive. */
export const Empty: Story = {};
