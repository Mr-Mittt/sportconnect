import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateSessionModal } from './CreateSessionModal';

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
    expect(onSubmit).not.toHaveBeenCalled();
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
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('groupId');
  });

  it('shows "Creating…" while submitting, and the error state', () => {
    const { rerender } = render(<CreateSessionModal {...baseProps} selectedLocation={location} isSubmitting />);
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeInTheDocument();

    rerender(<CreateSessionModal {...baseProps} selectedLocation={location} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't create the session");
  });
});
