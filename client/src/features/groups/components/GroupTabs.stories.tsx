import type { Meta, StoryObj } from '@storybook/react-vite';
import { GroupTabs } from './GroupTabs';

const meta = {
  title: 'Groups/GroupTabs',
  component: GroupTabs,
  args: {
    activeTab: 'posts',
    onChange: () => {},
  },
} satisfies Meta<typeof GroupTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Posts: Story = {};
export const Chat: Story = { args: { activeTab: 'chat' } };
export const Settings: Story = { args: { activeTab: 'settings' } };
