import type { Meta, StoryObj } from '@storybook/react-vite';
import { NavTabs } from './NavTabs';

const meta = {
  title: 'Shared/NavTabs',
  component: NavTabs,
} satisfies Meta<typeof NavTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HomeActive: Story = {
  args: { active: 'home', onChange: () => {} },
};

export const ProfileActive: Story = {
  args: { active: 'profile', onChange: () => {} },
};
