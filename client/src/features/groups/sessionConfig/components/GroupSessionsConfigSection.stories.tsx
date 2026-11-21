import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { makeLocation, makeRecurrence, makeSessionsConfigData, makeSettings } from '../fixtures';
import { GroupSessionsConfigSection } from './GroupSessionsConfigSection';

const weekly = [
  makeRecurrence({ id: 1, dayKey: 2, startTime: '18:00:00' }),
  makeRecurrence({ id: 2, dayKey: 2, startTime: '20:00:00', durationMinutes: 60, location: makeLocation({ id: 10, name: 'Hall 2' }), locationId: 10 }),
  makeRecurrence({ id: 3, dayKey: 5, startTime: '19:00:00', draft: true, missing: ['locationId', 'durationMinutes'], locationId: null, location: null, durationMinutes: null }),
  makeRecurrence({ id: 4, dayKey: 7, startTime: '07:30:00' }),
];

const meta = {
  title: 'Groups/GroupSessionsConfigSection',
  component: GroupSessionsConfigSection,
  args: { canEdit: true, groupName: 'Riverside Smashers', data: makeSessionsConfigData({ recurrences: weekly }) },
  decorators: [
    (Story) => (
      <div className="max-w-[520px] p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GroupSessionsConfigSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** ON, the days collapsed: each slot's time range, location and what it lacks. */
export const On: Story = {};

/** A day opened: each slot with its address, Edit and Delete. */
export const DayOpened: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Tuesday \(2\)/ }));
  },
};

/** OFF: only the switch is shown. */
export const Off: Story = {
  args: { data: makeSessionsConfigData({ settings: makeSettings({ enabled: false }), recurrences: weekly }) },
};

export const NoConfigurations: Story = {
  args: { data: makeSessionsConfigData({ recurrences: [] }) },
};

/** Monthly mode: the days of the month, the weekly configurations are not listed. */
export const Monthly: Story = {
  args: {
    data: makeSessionsConfigData({
      settings: makeSettings({ mode: 'MONTHLY' }),
      recurrences: [makeRecurrence({ id: 11, mode: 'MONTHLY', dayKey: 1 }), makeRecurrence({ id: 12, mode: 'MONTHLY', dayKey: 15 }), ...weekly],
    }),
  },
};

/** A configuration whose location was removed since it was saved. */
export const LocationUnavailable: Story = {
  args: { data: makeSessionsConfigData({ recurrences: [makeRecurrence({ location: null })] }) },
};

/** A member reads the state, nothing is editable. */
export const AsMember: Story = {
  args: { canEdit: false },
};

export const Loading: Story = {
  args: { data: makeSessionsConfigData({ settings: undefined, isSettingsLoading: true }) },
};

export const LoadError: Story = {
  args: { data: makeSessionsConfigData({ settings: undefined, isSettingsError: true }) },
};

export const ListLoadError: Story = {
  args: { data: makeSessionsConfigData({ recurrences: undefined, isRecurrencesError: true }) },
};

export const UpdateError: Story = {
  args: { data: makeSessionsConfigData({ recurrences: weekly, isUpdateError: true, updateErrorText: 'Only the group owner or an admin can do that.' }) },
};

export const DeleteError: Story = {
  args: { data: makeSessionsConfigData({ recurrences: weekly, isDeleteError: true }) },
};

/** The ON confirmation. */
export const TurnOnConfirmation: Story = {
  args: { data: makeSessionsConfigData({ settings: makeSettings({ enabled: false }) }) },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Regular sessions: Off' }));
  },
};

/** The OFF confirmation: three choices. */
export const TurnOffConfirmation: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Regular sessions: On' }));
  },
};

/** Switching the recurrence while configurations of the current mode exist. */
export const SwitchModeConfirmation: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.selectOptions(within(canvasElement).getByLabelText('Recurrence'), 'MONTHLY');
  },
};

export const DeleteConfirmation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Tuesday \(2\)/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Tuesday at 18:00' }));
  },
};

/** CLIENT-GROUP-SESSION-6: after the delete confirm, 3 scheduled sessions are left behind: leave them there or cancel them. */
export const CancelScheduledOnDelete: Story = {
  args: { data: makeSessionsConfigData({ recurrences: weekly, onCountScheduled: (_scope, _recurrenceId, onCount) => onCount(3) }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Tuesday \(2\)/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Tuesday at 18:00' }));
    await userEvent.click(within(document.body).getByRole('button', { name: 'Delete' }));
  },
};

/** After the mode confirm, one scheduled session (the singular form). */
export const CancelScheduledOnModeSwitch: Story = {
  args: { data: makeSessionsConfigData({ recurrences: weekly, onCountScheduled: (_scope, _recurrenceId, onCount) => onCount(1) }) },
  play: async ({ canvasElement }) => {
    await userEvent.selectOptions(within(canvasElement).getByLabelText('Recurrence'), 'MONTHLY');
    await userEvent.click(within(document.body).getByRole('button', { name: 'Got it' }));
  },
};

/** The count could not be read, so nothing was changed: Try again or Close. */
export const CountLookupFailed: Story = {
  args: { data: makeSessionsConfigData({ recurrences: weekly, onCountScheduled: () => {}, isCountError: true }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /Tuesday \(2\)/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Delete Tuesday at 18:00' }));
    await userEvent.click(within(document.body).getByRole('button', { name: 'Delete' }));
  },
};
