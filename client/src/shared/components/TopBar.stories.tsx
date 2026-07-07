import type { Meta, StoryObj } from '@storybook/react-vite';
import { TopBar } from './TopBar';

const meta = {
  title: 'Shared/TopBar',
  component: TopBar,
} satisfies Meta<typeof TopBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { userInitials: 'BN' },
};
