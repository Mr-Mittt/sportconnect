import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionStartTimeCalendar } from './SessionStartTimeCalendar';

const now = new Date('2026-08-03T10:00:00');

const meta = {
  title: 'Session/SessionStartTimeCalendar',
  component: SessionStartTimeCalendar,
  args: {
    value: null,
    minDate: now,
    now,
    onSelect: () => {},
  },
} satisfies Meta<typeof SessionStartTimeCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoSelection: Story = {};

export const DaySelected: Story = {
  args: { value: new Date('2026-08-14T00:00:00') },
};
