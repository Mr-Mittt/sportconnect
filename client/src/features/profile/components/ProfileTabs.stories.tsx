import type { Meta, StoryObj } from '@storybook/react-vite';
import { ProfileTabs } from './ProfileTabs';

const meta = {
  title: 'Profile/ProfileTabs',
  component: ProfileTabs,
  args: {
    activeTab: 'posts',
    onChange: () => {},
  },
} satisfies Meta<typeof ProfileTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Posts: Story = {};
export const Memories: Story = { args: { activeTab: 'memories' } };
export const Settings: Story = { args: { activeTab: 'settings' } };
