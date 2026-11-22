import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeLocation, makeRecurrence, makeRecurrenceFormData, makeSessionsConfigData, makeSettings } from '../fixtures';
import type { GroupSessionsConfigData } from '../useGroupSessionsConfigData';
import { GroupSessionsConfigSection } from './GroupSessionsConfigSection';

function setup(data: Partial<GroupSessionsConfigData> = {}, canEdit = true) {
  const user = userEvent.setup();
  // The count lookup answers 0 at once unless a test says otherwise (CLIENT-GROUP-SESSION-6): the change then goes ahead without a second question.
  const onCountScheduled = vi.fn((_scope: string, _recurrenceId: number | undefined, onCount: (count: number) => void) => onCount(0));
  const fns = { onSetEnabled: vi.fn(), onSetMode: vi.fn(), onDelete: vi.fn(), onCountScheduled, onResetCount: vi.fn() };
  render(<GroupSessionsConfigSection groupName="Riverside Smashers" canEdit={canEdit} data={makeSessionsConfigData({ ...fns, ...data })} />);
  return { user, ...fns };
}

const dialog = () => screen.getByRole('dialog');

describe('GroupSessionsConfigSection', () => {
  describe('states', () => {
    it('says it is loading, and says when the settings failed to load', () => {
      const { unmount } = render(<GroupSessionsConfigSection groupName="Riverside Smashers" canEdit data={makeSessionsConfigData({ settings: undefined, isSettingsLoading: true })} />);
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      unmount();

      render(<GroupSessionsConfigSection groupName="Riverside Smashers" canEdit data={makeSessionsConfigData({ settings: undefined, isSettingsError: true })} />);
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the session settings.");
    });

    it('generation OFF: only the switch is shown, no recurrence, no Add, no list', () => {
      setup({ settings: makeSettings({ enabled: false }), recurrences: [makeRecurrence()] });

      expect(screen.getByRole('button', { name: 'Regular sessions: Off' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Recurrence')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Tuesday/ })).not.toBeInTheDocument();
    });

    it('generation ON: the switch, the recurrence, an Add button and the list', () => {
      setup({ recurrences: [makeRecurrence()] });

      expect(screen.getByRole('button', { name: 'Regular sessions: On' })).toBeInTheDocument();
      expect(screen.getByLabelText('Recurrence')).toHaveValue('WEEKLY');
      expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
      expect(screen.getByRole('button', { name: /Tuesday \(1\)/ })).toBeInTheDocument();
    });

    it('with nothing configured it says so', () => {
      setup({ recurrences: [] });
      expect(screen.getByText('No configurations yet.')).toBeInTheDocument();
    });

    it('while the list loads or fails to load it says so, without hiding the switch', () => {
      const { unmount } = render(<GroupSessionsConfigSection groupName="Riverside Smashers" canEdit data={makeSessionsConfigData({ recurrences: undefined, isRecurrencesLoading: true })} />);
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Regular sessions: On' })).toBeInTheDocument();
      unmount();

      render(<GroupSessionsConfigSection groupName="Riverside Smashers" canEdit data={makeSessionsConfigData({ recurrences: undefined, isRecurrencesError: true })} />);
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the configurations.");
    });

    it('shows a failed switch or mode change, with the coded text when there is one, and a failed delete the same way', () => {
      const { unmount } = render(<GroupSessionsConfigSection groupName="Riverside Smashers" canEdit data={makeSessionsConfigData({ isUpdateError: true })} />);
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't update the session settings. Please try again.");
      unmount();

      const second = render(
        <GroupSessionsConfigSection groupName="Riverside Smashers" canEdit data={makeSessionsConfigData({ isUpdateError: true, updateErrorText: 'Only the group owner or an admin can do that.' })} />,
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Only the group owner or an admin can do that.');
      second.unmount();

      const third = render(<GroupSessionsConfigSection groupName="Riverside Smashers" canEdit data={makeSessionsConfigData({ isDeleteError: true })} />);
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't delete this configuration. Please try again.");
      third.unmount();

      render(<GroupSessionsConfigSection groupName="Riverside Smashers" canEdit data={makeSessionsConfigData({ isDeleteError: true, deleteErrorText: 'This configuration no longer exists.' })} />);
      expect(screen.getByRole('alert')).toHaveTextContent('This configuration no longer exists.');
    });
  });

  describe('the list, by day', () => {
    it('shows only the configurations of the active mode, one collapsed section per day in day order, titled with its count', () => {
      setup({
        recurrences: [
          makeRecurrence({ id: 1, dayKey: 5 }),
          makeRecurrence({ id: 2, dayKey: 2 }),
          makeRecurrence({ id: 3, dayKey: 2, startTime: '20:00:00' }),
          makeRecurrence({ id: 4, mode: 'MONTHLY', dayKey: 15 }),
        ],
      });

      const titles = screen.getAllByRole('button', { name: /\(\d+\)/ }).map((button) => button.textContent);
      expect(titles).toEqual(['Tuesday (2)', 'Friday (1)']);
      expect(screen.queryByText(/15th/)).not.toBeInTheDocument();
      for (const name of [/Tuesday/, /Friday/]) {
        expect(screen.getByRole('button', { name })).toHaveAttribute('data-state', 'closed');
      }
    });

    it('a monthly group lists its configurations by day of the month', () => {
      setup({ settings: makeSettings({ mode: 'MONTHLY' }), recurrences: [makeRecurrence({ mode: 'MONTHLY', dayKey: 15 }), makeRecurrence({ id: 2, mode: 'WEEKLY' })] });
      expect(screen.getByRole('button', { name: /15th \(1\)/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Tuesday/ })).not.toBeInTheDocument();
    });

    it('collapsed, each slot reads start to end and its location, ordered by start time', () => {
      setup({
        recurrences: [
          makeRecurrence({ id: 1, startTime: '20:00:00', durationMinutes: 60 }),
          makeRecurrence({ id: 2, startTime: '07:30:00', location: makeLocation({ name: 'Hall 2' }) }),
        ],
      });

      const items = screen.getAllByRole('listitem').map((item) => item.textContent);
      expect(items[0]).toContain('07:30–09:00');
      expect(items[0]).toContain('Hall 2');
      expect(items[1]).toContain('20:00–21:00');
      expect(items[1]).toContain('Riverside Courts');
    });

    it('a configuration missing its location or duration is flagged in amber with a Draft label', () => {
      setup({
        recurrences: [
          makeRecurrence({ id: 1, draft: true, missing: ['locationId'], locationId: null, location: null }),
          makeRecurrence({ id: 2, startTime: '19:00:00', draft: true, missing: ['durationMinutes', 'feeAmountVnd'], durationMinutes: null }),
        ],
      });

      const [first, second] = screen.getAllByRole('listitem');
      expect(within(first).getByText('No location')).toBeInTheDocument();
      expect(within(first).getByText('Draft')).toBeInTheDocument();
      expect(within(second).getByText('No duration')).toBeInTheDocument();
      expect(within(second).getByText('No fee amount')).toBeInTheDocument();
      expect(second.textContent).toContain('19:00');
      expect(second.textContent).not.toContain('–'); // no duration, so no end time
    });

    it('a complete configuration has no Draft label and no warning', () => {
      setup({ recurrences: [makeRecurrence()] });
      expect(screen.queryByText('Draft')).not.toBeInTheDocument();
      expect(screen.queryByText(/^No /)).not.toBeInTheDocument();
    });

    it('a location that is gone (id kept, nothing resolved) reads as unavailable, not as missing', () => {
      setup({ recurrences: [makeRecurrence({ location: null })] });
      expect(screen.getByText(/Location unavailable/)).toBeInTheDocument();
      expect(screen.queryByText('No location')).not.toBeInTheDocument();
    });

    it('opening a day shows each slot with its address and, for the owner or an admin, Delete and Edit', async () => {
      const { user } = setup({ recurrences: [makeRecurrence()] });

      await user.click(screen.getByRole('button', { name: /Tuesday \(1\)/ }));
      expect(screen.getByRole('button', { name: /Tuesday \(1\)/ })).toHaveAttribute('data-state', 'open');
      expect(screen.getByText('12 Riverside Road')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit Tuesday at 18:00' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Delete Tuesday at 18:00' })).toBeEnabled();
    });

    it('Add opens the recurrence form for a new configuration', async () => {
      const openAdd = vi.fn();
      const { user } = setup({ recurrences: [makeRecurrence()], recurrenceForm: makeRecurrenceFormData({ openAdd }) });

      await user.click(screen.getByRole('button', { name: 'Add' }));
      expect(openAdd).toHaveBeenCalledTimes(1);
    });

    it('Edit opens the form for that very configuration', async () => {
      const openEdit = vi.fn();
      const tuesday = makeRecurrence({ id: 4 });
      const friday = makeRecurrence({ id: 5, dayKey: 5, startTime: '19:00:00' });
      const { user } = setup({ recurrences: [tuesday, friday], recurrenceForm: makeRecurrenceFormData({ openEdit }) });

      await user.click(screen.getByRole('button', { name: /Friday \(1\)/ }));
      await user.click(screen.getByRole('button', { name: 'Edit Friday at 19:00' }));
      expect(openEdit).toHaveBeenCalledTimes(1);
      expect(openEdit).toHaveBeenCalledWith(friday);
    });

    it('each day opens and closes on its own', async () => {
      const { user } = setup({ recurrences: [makeRecurrence({ id: 1, dayKey: 2 }), makeRecurrence({ id: 2, dayKey: 4 })] });

      await user.click(screen.getByRole('button', { name: /Tuesday \(1\)/ }));
      expect(screen.getByRole('button', { name: /Tuesday \(1\)/ })).toHaveAttribute('data-state', 'open');
      expect(screen.getByRole('button', { name: /Thursday \(1\)/ })).toHaveAttribute('data-state', 'closed');
      await user.click(screen.getByRole('button', { name: /Tuesday \(1\)/ }));
      expect(screen.getByRole('button', { name: /Tuesday \(1\)/ })).toHaveAttribute('data-state', 'closed');
    });
  });

  describe('a member', () => {
    it('reads the state: no switch to press, no mode to pick, no Add, no Edit or Delete, and the owner-or-admin hint', async () => {
      const { user } = setup({ recurrences: [makeRecurrence()] }, false);

      expect(screen.queryByRole('button', { name: /Regular sessions:/ })).not.toBeInTheDocument();
      expect(screen.getByText('On')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.getByText('Weekly')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
      expect(screen.getByText('Only the owner and admins can change this.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Tuesday \(1\)/ }));
      expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
      expect(screen.getByText(/Riverside Courts/)).toBeInTheDocument();
    });
  });

  describe('turning generation ON', () => {
    it('asks first: nothing is turned on until "Got it, turn on"', async () => {
      const { user, onSetEnabled } = setup({ settings: makeSettings({ enabled: false }) });

      await user.click(screen.getByRole('button', { name: 'Regular sessions: Off' }));
      expect(onSetEnabled).not.toHaveBeenCalled();
      expect(within(dialog()).getByText('Turn on regular sessions?')).toBeInTheDocument();
      expect(dialog()).toHaveTextContent("By switching this feature ON, your regular sessions will be generated automatically from the group's recurrence configurations. Are you ready?");

      await user.click(within(dialog()).getByRole('button', { name: 'Got it, turn on' }));
      expect(onSetEnabled).toHaveBeenCalledTimes(1);
      expect(onSetEnabled).toHaveBeenCalledWith(true);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('"Let me check again" and Escape change nothing', async () => {
      const { user, onSetEnabled } = setup({ settings: makeSettings({ enabled: false }) });

      await user.click(screen.getByRole('button', { name: 'Regular sessions: Off' }));
      await user.click(within(dialog()).getByRole('button', { name: 'Let me check again' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Regular sessions: Off' }));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onSetEnabled).not.toHaveBeenCalled();
    });
  });

  describe('turning generation OFF', () => {
    async function openOff() {
      const view = setup();
      await view.user.click(screen.getByRole('button', { name: 'Regular sessions: On' }));
      return view;
    }

    it('asks first, with three choices in the order the owner gave', async () => {
      const { onSetEnabled } = await openOff();

      expect(onSetEnabled).not.toHaveBeenCalled();
      expect(within(dialog()).getByText('Turn off regular sessions?')).toBeInTheDocument();
      expect(dialog()).toHaveTextContent('By switching this feature OFF, your regular sessions will stop being generated. The sessions already scheduled will stay here. Is that OK?');
      const labels = within(dialog()).getAllByRole('button').map((button) => button.textContent);
      const wanted = ["Hold on, don't turn off", 'No, cancel the remaining sessions and turn off', 'Yes, keep them and turn off'];
      expect(labels.filter((label) => wanted.includes(label ?? ''))).toEqual(wanted);
    });

    it('"Hold on, don\'t turn off" changes nothing', async () => {
      const { user, onSetEnabled } = await openOff();
      await user.click(within(dialog()).getByRole('button', { name: "Hold on, don't turn off" }));
      expect(onSetEnabled).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('"Yes, keep them and turn off" turns it off without cancelling the scheduled sessions', async () => {
      const { user, onSetEnabled } = await openOff();
      await user.click(within(dialog()).getByRole('button', { name: 'Yes, keep them and turn off' }));
      expect(onSetEnabled).toHaveBeenCalledTimes(1);
      expect(onSetEnabled).toHaveBeenCalledWith(false, false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('"No, cancel the remaining sessions and turn off" turns it off and cancels them', async () => {
      const { user, onSetEnabled } = await openOff();
      await user.click(within(dialog()).getByRole('button', { name: 'No, cancel the remaining sessions and turn off' }));
      expect(onSetEnabled).toHaveBeenCalledTimes(1);
      expect(onSetEnabled).toHaveBeenCalledWith(false, true);
    });

    it('Escape is the safe way out', async () => {
      const { user, onSetEnabled } = await openOff();
      await user.keyboard('{Escape}');
      expect(onSetEnabled).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('the recurrence mode', () => {
    it('offers Weekly and Monthly, the group current one selected', () => {
      setup({ settings: makeSettings({ mode: 'MONTHLY' }) });
      const select = screen.getByLabelText('Recurrence');
      expect(select).toHaveValue('MONTHLY');
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['Weekly', 'Monthly']);
    });

    it('with configurations of the current mode it asks first: they stop being usable until the user switches back', async () => {
      const { user, onSetMode } = setup({ recurrences: [makeRecurrence()] });

      await user.selectOptions(screen.getByLabelText('Recurrence'), 'MONTHLY');
      expect(onSetMode).not.toHaveBeenCalled();
      expect(within(dialog()).getByText('Switch the recurrence?')).toBeInTheDocument();
      expect(dialog()).toHaveTextContent('By switching the recurrence mode, your current configurations are not usable until you switch back.');

      await user.click(within(dialog()).getByRole('button', { name: 'Got it' }));
      expect(onSetMode).toHaveBeenCalledTimes(1);
      expect(onSetMode).toHaveBeenCalledWith('MONTHLY', false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('"Stay" and Escape keep the mode', async () => {
      const { user, onSetMode } = setup({ recurrences: [makeRecurrence()] });

      await user.selectOptions(screen.getByLabelText('Recurrence'), 'MONTHLY');
      await user.click(within(dialog()).getByRole('button', { name: 'Stay' }));
      await user.selectOptions(screen.getByLabelText('Recurrence'), 'MONTHLY');
      await user.keyboard('{Escape}');

      expect(onSetMode).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('with no configuration of the current mode there is nothing to warn about: it switches at once (none scheduled)', async () => {
      // The only configuration belongs to the other mode, so the switch does not make anything unusable.
      const { user, onSetMode } = setup({ recurrences: [makeRecurrence({ mode: 'MONTHLY', dayKey: 3 })] });

      await user.selectOptions(screen.getByLabelText('Recurrence'), 'MONTHLY');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onSetMode).toHaveBeenCalledWith('MONTHLY', false);
    });

    it('picking the mode it already has does nothing', async () => {
      const { user, onSetMode } = setup({ recurrences: [makeRecurrence()] });
      await user.selectOptions(screen.getByLabelText('Recurrence'), 'WEEKLY');
      expect(onSetMode).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('deleting a configuration', () => {
    async function openDelete() {
      const view = setup({ recurrences: [makeRecurrence({ id: 41 }), makeRecurrence({ id: 42, startTime: '20:00:00' })] });
      await view.user.click(screen.getByRole('button', { name: /Tuesday \(2\)/ }));
      await view.user.click(screen.getByRole('button', { name: 'Delete Tuesday at 20:00' }));
      return view;
    }

    it('asks first, naming the slot, and deletes only that configuration on confirm', async () => {
      const { user, onDelete } = await openDelete();

      expect(onDelete).not.toHaveBeenCalled();
      expect(within(dialog()).getByText('Delete this configuration?')).toBeInTheDocument();
      expect(dialog()).toHaveTextContent('The session on Tuesday at 20:00 will no longer be created. Sessions already created stay.');

      await user.click(within(dialog()).getByRole('button', { name: 'Delete' }));
      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledWith(42, false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('"Keep it" and Escape delete nothing', async () => {
      const { user, onDelete } = await openDelete();
      await user.click(within(dialog()).getByRole('button', { name: 'Keep it' }));
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Delete Tuesday at 18:00' }));
      await user.keyboard('{Escape}');
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('Delete is disabled while another change is being saved', async () => {
      const user = userEvent.setup();
      render(<GroupSessionsConfigSection groupName="Riverside Smashers" canEdit data={makeSessionsConfigData({ recurrences: [makeRecurrence()], isBusy: true })} />);
      await user.click(screen.getByRole('button', { name: /Tuesday \(1\)/ }));
      expect(screen.getByRole('button', { name: 'Delete Tuesday at 18:00' })).toBeDisabled();
      expect(screen.getByLabelText('Recurrence')).toBeDisabled();
    });
  });

  /** CLIENT-GROUP-SESSION-6: the question about the scheduled regular sessions a delete or a mode switch would leave behind. */
  describe('cancelling the scheduled sessions', () => {
    const twoSlots = () => [makeRecurrence({ id: 41 }), makeRecurrence({ id: 42, startTime: '20:00:00' })];

    /** A count lookup that answers `count` at once; the section waits for it before it deletes or switches. */
    function withCount(count: number, data: Partial<GroupSessionsConfigData> = {}) {
      const onCountScheduled = vi.fn((_scope: string, _recurrenceId: number | undefined, onCount: (count: number) => void) => onCount(count));
      return { ...setup({ onCountScheduled, recurrences: twoSlots(), ...data }), onCountScheduled };
    }

    /** A lookup that never answers (it is slow, or it failed and `isCountError` says so). */
    function withSilentCount(data: Partial<GroupSessionsConfigData> = {}) {
      const onCountScheduled = vi.fn();
      return { ...setup({ onCountScheduled, recurrences: twoSlots(), ...data }), onCountScheduled };
    }

    async function confirmDelete(user: ReturnType<typeof userEvent.setup>, slot = '20:00') {
      await user.click(screen.getByRole('button', { name: /Tuesday \(2\)/ }));
      await user.click(screen.getByRole('button', { name: `Delete Tuesday at ${slot}` }));
      await user.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    }

    async function confirmMode(user: ReturnType<typeof userEvent.setup>) {
      await user.selectOptions(screen.getByLabelText('Recurrence'), 'MONTHLY');
      await user.click(within(dialog()).getByRole('button', { name: 'Got it' }));
    }

    it('a delete asks for that configuration only (scope RECURRENCE and its id)', async () => {
      const { user, onCountScheduled } = withCount(0);
      await confirmDelete(user);
      expect(onCountScheduled).toHaveBeenCalledTimes(1);
      expect(onCountScheduled.mock.calls[0].slice(0, 2)).toEqual(['RECURRENCE', 42]);
    });

    it('a mode switch asks for the whole group (scope ALL), after its own confirm', async () => {
      const { user, onCountScheduled } = withCount(0, { recurrences: [makeRecurrence()] });
      await user.selectOptions(screen.getByLabelText('Recurrence'), 'MONTHLY');
      expect(onCountScheduled).not.toHaveBeenCalled();
      await user.click(within(dialog()).getByRole('button', { name: 'Got it' }));
      expect(onCountScheduled.mock.calls[0].slice(0, 2)).toEqual(['ALL', undefined]);
    });

    it('with none scheduled there is no second question: the delete and the switch go ahead without cancelling', async () => {
      const del = withCount(0);
      await confirmDelete(del.user);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(del.onDelete).toHaveBeenCalledWith(42, false);
    });

    it('with sessions scheduled a delete asks "{x} sessions are available. Do you want to cancel them?" and does nothing until answered', async () => {
      const { user, onDelete } = withCount(3);
      await confirmDelete(user);
      expect(within(dialog()).getByText('Cancel the scheduled sessions?')).toBeInTheDocument();
      expect(dialog()).toHaveTextContent('3 sessions are available. Do you want to cancel them?');
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('one session reads in the singular', async () => {
      const { user } = withCount(1);
      await confirmDelete(user);
      expect(dialog()).toHaveTextContent('1 session is available. Do you want to cancel it?');
    });

    it('"Leave it there" deletes without cancelling', async () => {
      const { user, onDelete } = withCount(2);
      await confirmDelete(user);
      await user.click(within(dialog()).getByRole('button', { name: 'Leave it there' }));
      expect(onDelete).toHaveBeenCalledWith(42, false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('"Cancel" deletes and cancels the scheduled sessions', async () => {
      const { user, onDelete } = withCount(2);
      await confirmDelete(user);
      await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
      expect(onDelete).toHaveBeenCalledWith(42, true);
    });

    it('a mode switch with sessions scheduled asks, then sends the mode with the answer', async () => {
      const { user, onSetMode } = withCount(4, { recurrences: [makeRecurrence()] });
      await confirmMode(user);
      expect(dialog()).toHaveTextContent('4 sessions are available. Do you want to cancel them?');
      expect(onSetMode).not.toHaveBeenCalled();
      await user.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
      expect(onSetMode).toHaveBeenCalledWith('MONTHLY', true);
    });

    it('a mode switch answered "Leave it there" sends cancelScheduled false', async () => {
      const { user, onSetMode } = withCount(4, { recurrences: [makeRecurrence()] });
      await confirmMode(user);
      await user.click(within(dialog()).getByRole('button', { name: 'Leave it there' }));
      expect(onSetMode).toHaveBeenCalledWith('MONTHLY', false);
    });

    it('with no configuration of the current mode the switch still asks for the count: sessions can outlive their configuration', async () => {
      const { user, onCountScheduled, onSetMode } = withCount(2, { recurrences: [makeRecurrence({ mode: 'MONTHLY', dayKey: 3 })] });
      await user.selectOptions(screen.getByLabelText('Recurrence'), 'MONTHLY');
      expect(onCountScheduled).toHaveBeenCalledTimes(1);
      expect(dialog()).toHaveTextContent('2 sessions are available');
      expect(onSetMode).not.toHaveBeenCalled();
    });

    it('Escape on the question changes nothing', async () => {
      const { user, onDelete } = withCount(2);
      await confirmDelete(user);
      await user.keyboard('{Escape}');
      expect(onDelete).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('a failed count blocks the change: an error dialog, nothing deleted', async () => {
      const { user, onDelete } = withSilentCount({ isCountError: true });
      await confirmDelete(user);

      expect(within(dialog()).getByText("Couldn't check the scheduled sessions")).toBeInTheDocument();
      expect(dialog()).toHaveTextContent("We couldn't find out whether sessions are scheduled, so nothing was changed. Please try again.");
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('a failed count on a mode switch blocks it the same way', async () => {
      const { user, onSetMode } = withSilentCount({ isCountError: true, recurrences: [makeRecurrence()] });
      await confirmMode(user);
      expect(within(dialog()).getByText("Couldn't check the scheduled sessions")).toBeInTheDocument();
      expect(onSetMode).not.toHaveBeenCalled();
    });

    it('Try again repeats the same lookup', async () => {
      const { user, onCountScheduled, onResetCount } = withSilentCount({ isCountError: true });
      await confirmDelete(user);
      await user.click(within(dialog()).getByRole('button', { name: 'Try again' }));
      expect(onCountScheduled).toHaveBeenCalledTimes(2);
      expect(onCountScheduled.mock.calls[1].slice(0, 2)).toEqual(['RECURRENCE', 42]);
      expect(onResetCount).toHaveBeenCalled();
    });

    it('Close on the error changes nothing', async () => {
      const { user, onDelete } = withSilentCount({ isCountError: true });
      await confirmDelete(user);
      await user.click(within(dialog()).getByText('Close', { selector: 'button' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onDelete).not.toHaveBeenCalled();
    });
  });
});
