import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeLocation, makeRecurrence, makeRecurrenceFormData } from '../fixtures';
import type { RecurrenceFormData } from '../useRecurrenceFormData';
import type { RecurrenceMode } from '../types';
import { RecurrenceConfigModal } from './RecurrenceConfigModal';

const GROUP = 'Riverside Smashers';

function setup(form: Partial<RecurrenceFormData> = {}, options: { mode?: RecurrenceMode; isGenerationOn?: boolean } = {}) {
  const user = userEvent.setup();
  const fns = { save: vi.fn(), close: vi.fn(), onCreateMore: vi.fn() };
  const view = render(
    <RecurrenceConfigModal
      form={makeRecurrenceFormData({ isOpen: true, ...fns, ...form })}
      mode={options.mode ?? 'WEEKLY'}
      groupName={GROUP}
      isGenerationOn={options.isGenerationOn ?? true}
    />,
  );
  return { user, ...fns, ...view };
}

const complete = { selectedLocation: makeLocation() };
const durationInput = () => screen.getByLabelText(/Duration/);

describe('RecurrenceConfigModal', () => {
  describe('what is on screen', () => {
    it('renders nothing while closed', () => {
      setup({ isOpen: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('Add: the titled form with its intro and the When, Where, Who and Cost sections, and no Overview or sport field', () => {
      setup();

      expect(screen.getByRole('dialog', { name: 'Add a regular session' })).toBeInTheDocument();
      expect(screen.getByText(`A regular session of ${GROUP}, created automatically on this day and time.`)).toBeInTheDocument();
      for (const name of ['When', 'Where', 'Who', 'Cost']) {
        expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
      }
      expect(screen.queryByText('Overview')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Sport/)).not.toBeInTheDocument();
      // No date picker: only the day, hour and minute selects.
      expect(screen.queryByLabelText(/: date/)).not.toBeInTheDocument();
    });

    it('opens on Monday at 18:00, free, for everyone, with mood 5 and no duration or end', () => {
      setup();

      expect(screen.getByLabelText(/Day of the week/)).toHaveValue('1');
      expect(screen.getByLabelText('Starts at: hour')).toHaveValue('18');
      expect(screen.getByLabelText('Starts at: minute')).toHaveValue('00');
      expect(durationInput()).toHaveValue(null);
      expect(screen.getByLabelText('Ends at: hour')).toHaveValue('');
      expect(screen.getByRole('checkbox', { name: 'Free' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'All members' })).toBeChecked();
      expect(screen.getByRole('slider')).toHaveValue('5');
    });

    it('a weekly group picks a weekday, a monthly one a day of the month', () => {
      const weekly = setup();
      const weekdays = within(screen.getByLabelText(/Day of the week/)).getAllByRole('option');
      expect(weekdays.map((option) => option.textContent)).toEqual([
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
      ]);
      weekly.unmount();

      setup({}, { mode: 'MONTHLY' });
      const days = within(screen.getByLabelText(/Day of the month/)).getAllByRole('option');
      expect(days).toHaveLength(31);
      expect(days[0]).toHaveTextContent(/^1/);
      expect(days[30]).toHaveTextContent(/^31/);
    });

    it('Edit: the form of that configuration, filled', () => {
      const recurrence = makeRecurrence({
        dayKey: 4,
        startTime: '07:30:00',
        durationMinutes: 75,
        locationNote: 'Court 3',
        audience: 'SPECIFIC',
        audienceMembers: [{ id: 'u1', name: 'Linh Tran', avatarUrl: null }],
        feeType: 'SPLIT',
        gameMood: 8,
      });
      setup({ editing: recurrence, selectedLocation: recurrence.location });

      expect(screen.getByRole('dialog', { name: 'Edit regular session' })).toBeInTheDocument();
      expect(screen.getByLabelText(/Day of the week/)).toHaveValue('4');
      expect(screen.getByLabelText('Starts at: hour')).toHaveValue('07');
      expect(screen.getByLabelText('Starts at: minute')).toHaveValue('30');
      expect(durationInput()).toHaveValue(75);
      expect(screen.getByLabelText('Ends at: hour')).toHaveValue('08');
      expect(screen.getByLabelText('Ends at: minute')).toHaveValue('45');
      expect(screen.getByText('Riverside Courts')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Court 3')).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Specific members' })).toBeChecked();
      expect(screen.getByText('Linh Tran')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: 'Split cost' })).toBeChecked();
      expect(screen.getByRole('slider')).toHaveValue('8');
    });

    it('shows the amber missing chips for the location and the duration of a new configuration', () => {
      setup();
      expect(screen.getAllByText(/Missing/).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('the time fields', () => {
    it('the duration derives the end, and over midnight the end is the next day\'s clock', async () => {
      const { user } = setup();
      await user.selectOptions(screen.getByLabelText('Starts at: hour'), '23');
      await user.type(durationInput(), '90');

      expect(screen.getByLabelText('Ends at: hour')).toHaveValue('00');
      expect(screen.getByLabelText('Ends at: minute')).toHaveValue('30');
    });

    it('the end derives the duration', async () => {
      const { user } = setup();
      await user.selectOptions(screen.getByLabelText('Ends at: hour'), '20');
      await user.selectOptions(screen.getByLabelText('Ends at: minute'), '30');

      expect(durationInput()).toHaveValue(150);
    });

    it('an end equal to the start is refused, with its message, and nothing is saved', async () => {
      const { user, save } = setup(complete);
      await user.selectOptions(screen.getByLabelText('Ends at: hour'), '18');
      await user.selectOptions(screen.getByLabelText('Ends at: minute'), '00');

      expect(screen.getByText(/The end must differ from the start/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('the time fields, more', () => {
    it('a duration of a day or more is refused with the message and nothing is saved, even with a location', async () => {
      const { user, save } = setup(complete);
      await user.type(durationInput(), '1500');

      expect(screen.getByText(/shorter than a day/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(save).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: /missing information/ })).not.toBeInTheDocument();
    });

    it('clearing the duration clears the selects of the end too', async () => {
      const { user } = setup();
      await user.type(durationInput(), '90');
      expect(screen.getByLabelText('Ends at: hour')).toHaveValue('19');

      await user.clear(durationInput());
      expect(screen.getByLabelText('Ends at: hour')).toHaveValue('');
      expect(screen.getByLabelText('Ends at: minute')).toHaveValue('');
    });
  });

  describe('saving', () => {
    it('a complete configuration saves at once, with what was entered', async () => {
      const { user, save } = setup(complete);
      await user.selectOptions(screen.getByLabelText(/Day of the week/), '3');
      await user.selectOptions(screen.getByLabelText('Starts at: hour'), '19');
      await user.type(durationInput(), '120');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(screen.queryByRole('dialog', { name: /missing information/ })).not.toBeInTheDocument();
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith({
        dayKey: 3,
        start: '19:00',
        duration: '120',
        locationNote: '',
        audience: 'ALL_MEMBERS',
        audienceMembers: [],
        feeType: 'FREE',
        feeAmountVnd: '',
        feeNote: '',
        gameMood: 5,
      });
    });

    it('a new configuration without a location or a duration asks first, naming what is missing', async () => {
      const { user, save } = setup();
      await user.click(screen.getByRole('button', { name: 'Save' }));

      const warning = screen.getByRole('dialog', { name: 'Your recurrence session is missing information' });
      expect(within(warning).getByText(/will be saved as a DRAFT and cannot be used to generate your group sessions/)).toBeInTheDocument();
      expect(within(warning).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Location', 'Duration']);
      expect(save).not.toHaveBeenCalled();
    });

    it('Keep editing goes back to the form without saving', async () => {
      const { user, save } = setup();
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await user.click(screen.getByRole('button', { name: 'Keep editing' }));

      expect(screen.queryByRole('dialog', { name: /missing information/ })).not.toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Add a regular session' })).toBeInTheDocument();
      expect(save).not.toHaveBeenCalled();
    });

    it('Save as draft saves what is there', async () => {
      const { user, save } = setup();
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await user.click(screen.getByRole('button', { name: 'Save as draft' }));

      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0]).toMatchObject({ dayKey: 1, start: '18:00', duration: '' });
    });

    it('only what is missing is named: a location but no duration', async () => {
      const { user } = setup(complete);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      const warning = screen.getByRole('dialog', { name: /missing information/ });
      expect(within(warning).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Duration']);
    });

    it('a specific audience with nobody picked is refused with its message, and no warning opens', async () => {
      const { user, save } = setup(complete);
      await user.type(durationInput(), '60');
      await user.click(screen.getByRole('radio', { name: 'Specific members' }));
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(save).not.toHaveBeenCalled();
      expect(screen.getByText(/Pick at least one member/i)).toBeInTheDocument();
    });

    it('a specific audience with a member saves its members', async () => {
      const { user, save } = setup({
        ...complete,
        audienceSearch: {
          query: 'li',
          onQueryChange: () => {},
          results: [{ id: 'u1', name: 'Linh Tran', avatarUrl: null }],
          isSearching: false,
          isSearchError: false,
        },
      });
      await user.type(durationInput(), '60');
      await user.click(screen.getByRole('radio', { name: 'Specific members' }));
      await user.click(screen.getByRole('button', { name: /Linh Tran/ }));
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][0]).toMatchObject({
        audience: 'SPECIFIC',
        audienceMembers: [{ id: 'u1', name: 'Linh Tran', avatarUrl: null }],
      });
    });

    it('Save is disabled while saving, and the failure shows in the form', () => {
      const { unmount } = setup({ isSaving: true });
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
      unmount();

      setup({ isSaveError: true, saveErrorText: 'A day can have up to 5 configurations.' });
      expect(screen.getByRole('alert')).toHaveTextContent('A day can have up to 5 configurations.');
    });

    it('a failure without a specific text shows the generic one', () => {
      setup({ isSaveError: true });
      expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save this configuration. Try again.");
    });
  });

  describe('closing', () => {
    it('with nothing changed it closes at once', async () => {
      const { user, close } = setup();
      await user.click(screen.getByRole('button', { name: 'Close' }));
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('with entries not saved it asks first: Keep editing stays, Discard closes', async () => {
      const { user, close } = setup();
      await user.selectOptions(screen.getByLabelText(/Day of the week/), '5');
      await user.click(screen.getByRole('button', { name: 'Close' }));

      expect(close).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Discard this configuration?' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Keep editing' }));
      expect(close).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Close' }));
      await user.click(screen.getByRole('button', { name: 'Discard' }));
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('a changed location counts as unsaved too', async () => {
      const first = makeRecurrence();
      const { user, close, rerender } = setup({ editing: first, selectedLocation: first.location });
      // The picker chose another venue while the form was open.
      rerender(
        <RecurrenceConfigModal
          form={makeRecurrenceFormData({ isOpen: true, close, editing: first, selectedLocation: makeLocation({ id: 12, name: 'Lakeside Courts' }) })}
          mode="WEEKLY"
          groupName={GROUP}
          isGenerationOn
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Close' }));

      expect(close).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Discard this configuration?' })).toBeInTheDocument();
    });
  });

  describe('after a save', () => {
    it('generation ON: the saved dialog says the next session will be created soon', () => {
      setup({ isSaved: true }, { isGenerationOn: true });

      const saved = screen.getByRole('dialog', { name: 'Regular session saved' });
      expect(within(saved).getByText(/Its next regular session will be created soon\./)).toBeInTheDocument();
      expect(within(saved).getByText(/Do you want to schedule another regular session\?/)).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Add a regular session' })).not.toBeInTheDocument();
    });

    it('a draft says it cannot be used to generate sessions until completed, whatever the switch', () => {
      const on = setup({ isSaved: true, isSavedDraft: true }, { isGenerationOn: true });
      const saved = screen.getByRole('dialog', { name: 'Regular session saved' });
      expect(within(saved).getByText(/saved as a DRAFT\. It cannot be used to generate your group sessions until you complete it\./)).toBeInTheDocument();
      expect(within(saved).getByText(/Do you want to schedule another regular session\?/)).toBeInTheDocument();
      expect(within(saved).queryByText(/created soon/)).not.toBeInTheDocument();
      on.unmount();

      setup({ isSaved: true, isSavedDraft: true }, { isGenerationOn: false });
      const off = screen.getByRole('dialog', { name: 'Regular session saved' });
      expect(within(off).getByText(/saved as a DRAFT/)).toBeInTheDocument();
      expect(within(off).queryByText(/generation is OFF/)).not.toBeInTheDocument();
    });

    it('generation OFF: it says nothing is generated until it is turned on', () => {
      setup({ isSaved: true }, { isGenerationOn: false });

      const saved = screen.getByRole('dialog', { name: 'Regular session saved' });
      expect(within(saved).getByText(/Regular session generation is OFF/)).toBeInTheDocument();
      expect(within(saved).queryByText(/created soon/)).not.toBeInTheDocument();
    });

    it('No closes everything, Create more starts the form over, and the close X also closes', async () => {
      const first = setup({ isSaved: true });
      await first.user.click(screen.getByRole('button', { name: 'No' }));
      expect(first.close).toHaveBeenCalledTimes(1);
      expect(first.onCreateMore).not.toHaveBeenCalled();
      first.unmount();

      const second = setup({ isSaved: true });
      await second.user.click(screen.getByRole('button', { name: 'Create more' }));
      expect(second.onCreateMore).toHaveBeenCalledTimes(1);
      expect(second.close).not.toHaveBeenCalled();
      second.unmount();

      const third = setup({ isSaved: true });
      await third.user.click(screen.getByRole('button', { name: 'Close' }));
      expect(third.close).toHaveBeenCalledTimes(1);
    });
  });
});
