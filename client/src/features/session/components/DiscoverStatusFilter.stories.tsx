import type { Meta, StoryObj } from '@storybook/react-vite';
import { DiscoverStatusFilter } from './DiscoverStatusFilter';

const meta = {
  title: 'Session/DiscoverStatusFilter',
  component: DiscoverStatusFilter,
  args: {
    onToggleStatus: () => {},
  },
} satisfies Meta<typeof DiscoverStatusFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoneSelected: Story = {
  args: { selectedStatuses: [] },
};

// Single-select (2026-09-23 revision) — 'PREPARING' and 'SCHEDULED' both selected is no longer a
// reachable state; 0 or 1 is all `selectedStatuses` ever holds.
export const PreparingSelected: Story = {
  args: { selectedStatuses: ['PREPARING'] },
};

export const ScheduledSelected: Story = {
  args: { selectedStatuses: ['SCHEDULED'] },
};
