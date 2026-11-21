import type { Meta, StoryObj } from '@storybook/react-vite';
import { screen, userEvent, within } from 'storybook/test';
import { makeLocation, makeRecurrence, makeRecurrenceFormData } from '../fixtures';
import { RecurrenceConfigModal } from './RecurrenceConfigModal';

const meta = {
  title: 'Groups/RecurrenceConfigModal',
  component: RecurrenceConfigModal,
  args: {
    form: makeRecurrenceFormData({ isOpen: true }),
    mode: 'WEEKLY',
    groupName: 'Riverside Smashers',
    isGenerationOn: true,
  },
} satisfies Meta<typeof RecurrenceConfigModal>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Add: Monday 18:00, free, for everyone, no location and no duration yet (the amber chips). */
export const Empty: Story = {};

/** A monthly group picks a day of the month. */
export const Monthly: Story = { args: { mode: 'MONTHLY' } };

/** Edit: a complete configuration for specific members, filled in. */
export const Filled: Story = {
  args: {
    form: makeRecurrenceFormData({
      isOpen: true,
      editing: makeRecurrence({ dayKey: 4, startTime: '19:30:00', durationMinutes: 90, locationNote: 'Court 3', gameMood: 7 }),
      selectedLocation: makeLocation(),
    }),
  },
};

/** Save without a location or a duration: the warning with Keep editing and Save as draft. */
export const MissingInformationWarning: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole('button', { name: 'Save' }));
    await screen.findByRole('dialog', { name: 'Your recurrence session is missing information' });
  },
};

/** A save that the server refused (the day already holds five). */
export const SaveFailed: Story = {
  args: { form: makeRecurrenceFormData({ isOpen: true, isSaveError: true, saveErrorText: 'A day can have up to 5 configurations.' }) },
};

/** Saved while generation is ON. */
export const SavedGenerationOn: Story = {
  args: { form: makeRecurrenceFormData({ isOpen: true, isSaved: true }), isGenerationOn: true },
};

/** Saved while generation is OFF: nothing is generated until it is turned on. */
export const SavedGenerationOff: Story = {
  args: { form: makeRecurrenceFormData({ isOpen: true, isSaved: true }), isGenerationOn: false },
};
