import type { Meta, StoryObj } from '@storybook/react-vite';
import { HistoryMonthFilter } from './HistoryMonthFilter';

const meta = {
  title: 'Groups/HistoryMonthFilter',
  component: HistoryMonthFilter,
  args: { month: '2026-11', canGoPrevious: true, canGoNext: false, onPrevious: () => {}, onNext: () => {} },
} satisfies Meta<typeof HistoryMonthFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The latest month (yesterday's): the next arrow is off. */
export const LatestMonth: Story = {};
/** A month in the middle of the range: both arrows on. */
export const MiddleMonth: Story = { args: { month: '2026-09', canGoNext: true } };
/** The group's first month: the previous arrow is off. */
export const FirstMonth: Story = { args: { month: '2026-03', canGoPrevious: false, canGoNext: true } };
