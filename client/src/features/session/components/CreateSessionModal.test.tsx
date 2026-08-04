import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FriendUser } from '@/features/friends/types';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateSessionModal } from './CreateSessionModal';

const friends: FriendUser[] = [
  { id: 'friend-1', fullName: 'Priya Shah', avatarUrl: null, coverUrl: null, bio: null },
  { id: 'friend-2', fullName: 'Priyanka Rao', avatarUrl: null, coverUrl: null, bio: null },
];

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

const location: Location = {
  id: 1,
  sportId: 6,
  sportName: 'Basketball',
  name: 'Riverside Courts',
  address: null,
  latitude: null,
  longitude: null,
  sourceMapsUrl: null,
  claimedByVendorId: null,
  createdBy: 'user-1',
  createdAt: '2026-06-01T10:00:00',
  updatedAt: '2026-06-01T10:00:00',
};

const locationPicker: LocationPickerProps = {
  isOpen: false,
  onClose: () => {},
  mode: 'search',
  onSwitchToCreate: () => {},
  onSwitchToSearch: () => {},
  inputValue: '',
  onInputChange: () => {},
  onSearch: () => {},
  results: [],
  isSearching: false,
  isSearchError: false,
  onSelectResult: () => {},
  onOpenGoogleMaps: () => {},
  mapsUrlInput: '',
  onMapsUrlChange: () => {},
  onResolveUrl: () => {},
  isResolving: false,
  isResolveError: false,
  resolvedNoCoordinates: false,
  coordinates: null,
  mapSeed: 0,
  onMovePin: () => {},
  name: '',
  onNameChange: () => {},
  address: '',
  onAddressChange: () => {},
  canSave: false,
  onSave: () => {},
  isSaving: false,
  isSaveError: false,
};

const baseProps = {
  isOpen: true,
  onClose: () => {},
  sportsByKey,
  selectedLocation: null as Location | null,
  onOpenLocationPicker: () => {},
  locationPicker,
  friends,
  isFriendsLoading: false,
  onSubmit: () => {},
  isSubmitting: false,
  isError: false,
};

/** Picks Today + 19:00 across the three independent Date/Hour/Minute selects — enough to make
 * `scheduledStart` non-empty. Today's real date isn't known at test time, so payload assertions
 * match the date half by shape, not value (see the submit test below). */
async function pickAnyStartTime(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Date'), 'Today');
  await user.selectOptions(screen.getByLabelText('Hour'), '19');
  await user.selectOptions(screen.getByLabelText('Minute'), '00');
}

describe('CreateSessionModal', () => {
  it('has no mode toggle — the form is always the standalone sport picker', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.queryByRole('group', { name: 'Session type' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Sport/)).toBeInTheDocument();
  });

  it('leaves Sport blank with no activeSport and more than one sport profile', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.getByLabelText(/^Sport/)).toHaveValue('');
  });

  it('pre-selects Sport from a real activeSport pill', () => {
    render(<CreateSessionModal {...baseProps} activeSport="basketball" />);
    expect(screen.getByLabelText(/^Sport/)).toHaveValue('basketball');
  });

  it('pre-selects Sport from the caller\'s sole profile even when activeSport is "all"', () => {
    render(
      <CreateSessionModal
        {...baseProps}
        sportsByKey={{ football: sportsByKey.football } as Record<SportKey, SportProfile>}
        activeSport="all"
      />,
    );
    expect(screen.getByLabelText(/^Sport/)).toHaveValue('football');
  });

  it('"Session basic information" is open by default, "Session detail" is collapsed', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.getByLabelText(/^Sport/)).toBeVisible();
    expect(screen.queryByText('Coming soon.')).not.toBeInTheDocument();
  });

  it('expanding "Session detail" shows its placeholder', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'Session detail' }));
    expect(screen.getByText('Coming soon.')).toBeInTheDocument();
  });

  it('calls onOpenLocationPicker with the selected sport id once a sport is chosen', async () => {
    const user = userEvent.setup();
    const onOpenLocationPicker = vi.fn();
    render(<CreateSessionModal {...baseProps} onOpenLocationPicker={onOpenLocationPicker} />);

    expect(screen.getByRole('button', { name: 'Choose location' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/^Sport/), 'basketball');
    expect(screen.getByRole('button', { name: 'Choose location' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Choose location' }));
    expect(onOpenLocationPicker).toHaveBeenCalledWith(6);
  });

  it('shows the chosen location name and "Change location"', () => {
    render(<CreateSessionModal {...baseProps} selectedLocation={location} />);
    expect(screen.getByText('Riverside Courts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change location' })).toBeInTheDocument();
  });

  it('"Create session" is clickable even with required fields missing', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Create session' })).toBeEnabled();
  });

  it('clicking submit while invalid shows per-field errors for whichever required fields are still empty, and does not call onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateSessionModal {...baseProps} activeSport="basketball" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(screen.getByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByText('Location is required.')).toBeInTheDocument();
    expect(screen.getByText('Duration is required.')).toBeInTheDocument();
    expect(screen.getByText('Open slot is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Fee defaults to "Free" checked, and it never blocks submit on its own', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.getByRole('checkbox', { name: 'Free' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Split cost' })).not.toBeChecked();
    expect(screen.getByLabelText('Fixed amount')).toHaveValue('');
  });

  it('typing into "Fixed amount" selects it and requires the amount on submit', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} activeSport="basketball" />);

    await user.type(screen.getByLabelText('Fixed amount'), '50000');
    expect(screen.getByRole('checkbox', { name: 'Free' })).not.toBeChecked();

    await user.clear(screen.getByLabelText('Fixed amount'));
    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(screen.getByText('Amount is required.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Fixed amount'), '50000');
    expect(screen.queryByText('Amount is required.')).not.toBeInTheDocument();
  });

  it('checking "Free" or "Split cost" clears a previously-typed amount', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);

    await user.type(screen.getByLabelText('Fixed amount'), '50000');
    await user.click(screen.getByRole('checkbox', { name: 'Split cost' }));

    expect(screen.getByRole('checkbox', { name: 'Split cost' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Free' })).not.toBeChecked();
    expect(screen.getByLabelText('Fixed amount')).toHaveValue('');
  });

  it('a field error clears on its own once that field is filled in, without needing to resubmit', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} activeSport="basketball" />);

    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(screen.getByText('Title is required.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
    expect(screen.queryByText('Title is required.')).not.toBeInTheDocument();
  });

  it('submits once every required field is filled in, after an initial invalid attempt', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateSessionModal
        {...baseProps}
        selectedLocation={location}
        activeSport="basketball"
        onSubmit={onSubmit}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
    await pickAnyStartTime(user);
    await user.type(screen.getByLabelText(/^Duration in minutes/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '10');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits the expected payload, with no groupId field at all', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateSessionModal
        {...baseProps}
        selectedLocation={location}
        activeSport="basketball"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
    await pickAnyStartTime(user);
    await user.type(screen.getByLabelText(/^Duration in minutes/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '10');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    // scheduledStart's date half is "today" per the real clock (the Date select's "Today"
    // option) — asserted by shape, not value, so this test isn't coupled to which day it runs.
    expect(onSubmit).toHaveBeenCalledWith({
      sportId: 6,
      title: 'Sunday run',
      description: undefined,
      locationId: 1,
      locationNote: undefined,
      scheduledStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T19:00:00$/),
      durationMinutes: 90,
      // Taken slot left blank -> defaults to 1 (the creator, who auto-joins) -> capacity = 1 + 10,
      // initialSlot = 1 - 1 = 0 (the creator's own auto-joined row already accounts for it).
      capacity: 11,
      feeType: 'FREE',
      feeAmountVnd: undefined,
      initialSlot: 0,
      autoApprove: false,
      inviteeIds: undefined,
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('groupId');
  });

  it('shows a live "taken/capacity" summary — Taken slot defaults to 1 (the creator) when blank', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);

    expect(screen.getByText('1/1 slots')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Open slot/), '5');
    expect(screen.getByText('1/6 slots')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Taken slot'), '3');
    await user.clear(screen.getByLabelText(/^Open slot/));
    await user.type(screen.getByLabelText(/^Open slot/), '4');
    expect(screen.getByText('3/7 slots')).toBeInTheDocument();
  });

  it('submits capacity as taken (explicit) + open, not defaulted, once Taken slot is filled in', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateSessionModal
        {...baseProps}
        selectedLocation={location}
        activeSport="basketball"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
    await pickAnyStartTime(user);
    await user.type(screen.getByLabelText(/^Duration in minutes/), '90');
    await user.type(screen.getByLabelText('Taken slot'), '3');
    await user.type(screen.getByLabelText(/^Open slot/), '4');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    // initialSlot = Taken slot(3) - 1 (the creator's own auto-joined row already accounts for 1).
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ capacity: 7, initialSlot: 2 }));
  });

  it('submits feeAmountVnd when Fixed amount is chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateSessionModal
        {...baseProps}
        selectedLocation={location}
        activeSport="basketball"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
    await pickAnyStartTime(user);
    await user.type(screen.getByLabelText(/^Duration in minutes/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '10');
    await user.type(screen.getByLabelText('Fixed amount'), '50000');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ feeType: 'FIXED', feeAmountVnd: 50000 }),
    );
  });

  it('every numeric field rejects non-digit keystrokes (Duration/Taken slot/Open slot/Fixed amount)', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);

    const duration = screen.getByLabelText(/^Duration in minutes/);
    await user.type(duration, 'a1b2c3');
    expect(duration).toHaveValue(123);

    const takenSlot = screen.getByLabelText('Taken slot');
    await user.type(takenSlot, '-1.5');
    expect(takenSlot).toHaveValue(15);

    const openSlot = screen.getByLabelText(/^Open slot/);
    await user.type(openSlot, '1e10');
    expect(openSlot).toHaveValue(110);

    const fixedAmount = screen.getByLabelText('Fixed amount');
    await user.type(fixedAmount, '50,000');
    expect(fixedAmount).toHaveValue('50 000');
  });

  it('"Fixed amount" displays a space every 3 digits, and normalizes a pasted comma-formatted value', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);
    const fixedAmount = screen.getByLabelText('Fixed amount');

    await user.type(fixedAmount, '1500000');
    expect(fixedAmount).toHaveValue('1 500 000');

    await user.clear(fixedAmount);
    await user.click(fixedAmount);
    await user.paste('50,000');
    expect(fixedAmount).toHaveValue('50 000');

    await user.clear(fixedAmount);
    await user.paste('90 mins');
    expect(fixedAmount).toHaveValue('');
  });

  it('every numeric field rejects a pasted non-numeric value but accepts a pasted numeric one', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);

    const duration = screen.getByLabelText(/^Duration in minutes/);
    await user.click(duration);
    await user.paste('90 mins');
    expect(duration).toHaveValue(null);
    await user.paste('90');
    expect(duration).toHaveValue(90);
  });

  it('shows "Creating…" while submitting, and the error state', () => {
    const { rerender } = render(<CreateSessionModal {...baseProps} selectedLocation={location} isSubmitting />);
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeInTheDocument();

    rerender(<CreateSessionModal {...baseProps} selectedLocation={location} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't create the session");
  });

  it('"Invite your friend" shows nothing below 3 characters, then filters the friends list', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);

    const search = screen.getByLabelText('Search friends to invite');
    await user.type(search, 'Pr');
    expect(screen.queryByRole('button', { name: /Priya Shah/ })).not.toBeInTheDocument();
    expect(screen.getByText('Type at least 3 characters to search.')).toBeInTheDocument();

    await user.type(search, 'iya S');
    expect(screen.getByRole('button', { name: /Priya Shah/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Priyanka Rao/ })).not.toBeInTheDocument();
  });

  it('selecting a friend badges them, removes them from results, and × removes the badge', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);

    const search = screen.getByLabelText('Search friends to invite');
    await user.type(search, 'Priya Shah');
    await user.click(screen.getByRole('button', { name: /Priya Shah/ }));

    expect(search).toHaveValue('');
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    // Exact name (not the /Priya Shah/ regex used above) so this doesn't also match the
    // "Remove Priya Shah" badge button, which is the one still on screen at this point.
    expect(screen.queryByRole('button', { name: 'Priya Shah' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove Priya Shah' }));
    expect(screen.queryByText('Priya Shah')).not.toBeInTheDocument();
  });

  it('submits selected invitee ids, omitted entirely when none are selected', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateSessionModal
        {...baseProps}
        selectedLocation={location}
        activeSport="basketball"
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
    await pickAnyStartTime(user);
    await user.type(screen.getByLabelText(/^Duration in minutes/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '10');
    await user.type(screen.getByLabelText('Search friends to invite'), 'Priya Shah');
    await user.click(screen.getByRole('button', { name: /Priya Shah/ }));
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ inviteeIds: ['friend-1'] }));
  });

  it('"Auto approve join request" defaults unchecked, and reveals a warning once checked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <CreateSessionModal
        {...baseProps}
        selectedLocation={location}
        activeSport="basketball"
        onSubmit={onSubmit}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Auto approve join request' });
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByText('Everyone can join without your review.')).not.toBeInTheDocument();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.getByText('Everyone can join without your review.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
    await pickAnyStartTime(user);
    await user.type(screen.getByLabelText(/^Duration in minutes/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '10');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ autoApprove: true }));
  });
});
