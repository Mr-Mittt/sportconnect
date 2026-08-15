import type { Meta, StoryObj } from '@storybook/react-vite';
import { SportIcon } from './SportIcon';

const meta = {
  title: 'Shared/SportIcon',
  component: SportIcon,
  args: {
    className: 'size-8',
  },
} satisfies Meta<typeof SportIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RealIcon: Story = {
  args: { iconUrl: '/images/sports/badminton.png' },
};

export const NoIconFallback: Story = {
  args: { iconUrl: null },
};
