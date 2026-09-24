import type { Meta, StoryObj } from '@storybook/react-vite';
import { Popover } from '@/shared/ui/popover';
import { DiscoverFilterTrigger } from './DiscoverFilterTrigger';

const meta = {
  title: 'Session/DiscoverFilterTrigger',
  component: DiscoverFilterTrigger,
  args: {
    label: 'Status',
    onClear: () => {},
    clearLabel: 'Clear status filter',
  },
  decorators: [
    (Story) => (
      <Popover>
        <Story />
      </Popover>
    ),
  ],
} satisfies Meta<typeof DiscoverFilterTrigger>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inactive: Story = {
  args: { isActive: false },
};

export const Active: Story = {
  args: { isActive: true, label: 'Preparing' },
};
