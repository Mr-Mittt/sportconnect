import type { Meta, StoryObj } from '@storybook/react-vite';
import { DiscoverDatePicker } from './DiscoverDatePicker';

const quickDates = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];
const dateOptionLabel = (date: string) =>
  date === '2026-08-01'
    ? 'Today'
    : date === '2026-08-02'
      ? 'Tomorrow (02/08)'
      : date.slice(8, 10) + '/' + date.slice(5, 7);
const dateLabel = (date: string) =>
  date === '2026-08-01' ? 'Today' : date === '2026-08-02' ? 'Tomorrow' : date.slice(8, 10) + '/' + date.slice(5, 7);

const meta = {
  title: 'Session/DiscoverDatePicker',
  component: DiscoverDatePicker,
  args: {
    quickDates,
    dateOptionLabel,
    dateLabel,
    onToggleDate: () => {},
    isAtMax: false,
    onReset: () => {},
  },
} satisfies Meta<typeof DiscoverDatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { selectedDates: ['2026-08-01'], isActive: false },
};

// 2026-09-23 revision — active once explicitly touched (not just "today" selected), showing the
// bg-filter-active background + reset "x".
export const SingleSelected: Story = {
  args: { selectedDates: ['2026-08-05'], isActive: true },
};

export const MultipleSelected: Story = {
  args: { selectedDates: ['2026-08-01', '2026-08-02', '2026-08-05'], isActive: true },
};

export const AtMax: Story = {
  args: {
    selectedDates: ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08'],
    isAtMax: true,
    isActive: true,
  },
};
