import type { Meta, StoryObj } from '@storybook/react-vite';
import { GroupChatTab } from './GroupChatTab';

const meta = {
  title: 'Groups/GroupChatTab',
  component: GroupChatTab,
  args: {
    currentUserFirstName: 'Ben',
  },
} satisfies Meta<typeof GroupChatTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty state with the "not built yet" disclaimer — sending a message is interactive. */
export const Empty: Story = {};
