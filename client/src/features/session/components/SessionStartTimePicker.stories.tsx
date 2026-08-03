import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { SessionStartTimePicker } from './SessionStartTimePicker';

const now = new Date('2026-08-03T10:00:00');

const meta = {
  title: 'Session/SessionStartTimePicker',
  component: SessionStartTimePicker,
  args: {
    value: '',
    now,
    onChange: () => {},
  },
} satisfies Meta<typeof SessionStartTimePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unset: Story = {};

export const ValueSetToday: Story = {
  args: { value: '2026-08-03T19:00' },
};

export const ValueSetFurtherOut: Story = {
  args: { value: '2026-08-20T09:00' },
};

/** The Date select's "Pick a date…" option reveals the inline calendar — driven the same way an
 * end user would, so the calendar's visual state is reviewable in Storybook. */
export const CalendarOpen: Story = {
  args: { value: '2026-08-04T19:30' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText('Date'), 'Pick a date…');
  },
};
