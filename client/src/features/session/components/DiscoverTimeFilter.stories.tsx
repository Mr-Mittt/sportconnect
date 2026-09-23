import type { Meta, StoryObj } from '@storybook/react-vite';
import { DiscoverTimeFilter } from './DiscoverTimeFilter';

const meta = {
  title: 'Session/DiscoverTimeFilter',
  component: DiscoverTimeFilter,
  args: {
    onStartTimeFilterChange: () => {},
    onStartTimeChange: () => {},
    onClear: () => {},
  },
} satisfies Meta<typeof DiscoverTimeFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unset: Story = {
  args: { startTimeFilter: undefined, startTime: undefined },
};

export const After: Story = {
  args: { startTimeFilter: 'AFTER_OR_EQUAL', startTime: '09:00' },
};

export const Before: Story = {
  args: { startTimeFilter: 'BEFORE_OR_EQUAL', startTime: '18:30' },
};
