import type { Meta, StoryObj } from '@storybook/react-vite';
import { DiscoverOpenSlotsFilter } from './DiscoverOpenSlotsFilter';

const meta = {
  title: 'Session/DiscoverOpenSlotsFilter',
  component: DiscoverOpenSlotsFilter,
  args: {
    onChange: () => {},
    onClear: () => {},
  },
} satisfies Meta<typeof DiscoverOpenSlotsFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unset: Story = {
  args: { value: '' },
};

export const Set: Story = {
  args: { value: '2' },
};
