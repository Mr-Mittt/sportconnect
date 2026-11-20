import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionStatusFilter } from './SessionStatusFilter';

const meta = {
  title: 'Groups/SessionStatusFilter',
  component: SessionStatusFilter,
  args: {
    sectionLabel: "Today's sessions",
    options: ['ONGOING', 'SCHEDULED', 'PREPARING', 'COMPLETED', 'CANCELLED'],
    selected: ['ONGOING', 'SCHEDULED', 'PREPARING'],
    onChange: () => {},
  },
  decorators: [(Story) => <div className="flex min-h-64 justify-end p-4"><Story /></div>],
} satisfies Meta<typeof SessionStatusFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {};
export const NothingSelected: Story = { args: { selected: [] } };
export const HistoryOptions: Story = {
  args: { sectionLabel: 'History', options: ['COMPLETED', 'CANCELLED'], selected: ['COMPLETED'] },
};
