import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComingSoonPage } from './ComingSoonPage';

const meta = {
  title: 'Shared/ComingSoonPage',
  component: ComingSoonPage,
} satisfies Meta<typeof ComingSoonPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: 'Groups' },
};
