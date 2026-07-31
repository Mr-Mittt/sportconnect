import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { CreateSessionModal, type ManageableGroup } from './CreateSessionModal';

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', icon: 'ball-football', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', icon: 'ball-basketball', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', icon: 'ball-tennis', colorRamp: 'purple' },
};

const manageableGroups: ManageableGroup[] = [
  { id: 5, groupName: 'Riverside Ballers', sportId: 6 },
  { id: 8, groupName: 'Downtown Aces', sportId: 2 },
];

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
  manageableGroups: [] as ManageableGroup[],
  sportsByKey,
  selectedLocation: null as Location | null,
  onOpenLocationPicker: () => {},
  locationPicker,
  onSubmit: () => {},
  isSubmitting: false,
  isError: false,
};

describe('CreateSessionModal', () => {
  it('hides the mode toggle when there are no manageable groups (standalone-only)', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.queryByRole('group', { name: 'Session type' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Sport')).toBeInTheDocument();
  });

  it('shows the mode toggle and switches between sport/group pickers', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} manageableGroups={manageableGroups} />);

    expect(screen.getByLabelText('Sport')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'For a group' }));
    expect(screen.getByLabelText('Group')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sport')).not.toBeInTheDocument();
  });

  it('calls onOpenLocationPicker with the selected sport id once a sport is chosen', async () => {
    const user = userEvent.setup();
    const onOpenLocationPicker = vi.fn();
    render(<CreateSessionModal {...baseProps} onOpenLocationPicker={onOpenLocationPicker} />);

    expect(screen.getByRole('button', { name: 'Choose location' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Sport'), 'basketball');
    expect(screen.getByRole('button', { name: 'Choose location' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Choose location' }));
    expect(onOpenLocationPicker).toHaveBeenCalledWith(6);
  });

  it('calls onOpenLocationPicker with the selected group\'s sport id in group mode', async () => {
    const user = userEvent.setup();
    const onOpenLocationPicker = vi.fn();
    render(
      <CreateSessionModal
        {...baseProps}
        manageableGroups={manageableGroups}
        onOpenLocationPicker={onOpenLocationPicker}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'For a group' }));
    await user.selectOptions(screen.getByLabelText('Group'), '8');
    await user.click(screen.getByRole('button', { name: 'Choose location' }));
    expect(onOpenLocationPicker).toHaveBeenCalledWith(2);
  });

  it('shows the chosen location name and "Change location"', () => {
    render(<CreateSessionModal {...baseProps} selectedLocation={location} />);
    expect(screen.getByText('Riverside Courts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change location' })).toBeInTheDocument();
  });

  it('disables Create session until sport, location, and start time are all set', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<CreateSessionModal {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Create session' })).toBeDisabled();

    rerender(<CreateSessionModal {...baseProps} selectedLocation={location} />);
    await user.selectOptions(screen.getByLabelText('Sport'), 'basketball');
    expect(screen.getByRole('button', { name: 'Create session' })).toBeDisabled();

    await user.type(screen.getByLabelText('Starts at'), '2026-08-01T19:00');
    expect(screen.getByRole('button', { name: 'Create session' })).toBeEnabled();
  });

  it('submits the expected payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CreateSessionModal {...baseProps} selectedLocation={location} onSubmit={onSubmit} />);

    await user.selectOptions(screen.getByLabelText('Sport'), 'basketball');
    await user.type(screen.getByLabelText('Title (optional)'), 'Sunday run');
    await user.type(screen.getByLabelText('Starts at'), '2026-08-01T19:00');
    await user.type(screen.getByLabelText('Duration in minutes (optional)'), '90');
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(onSubmit).toHaveBeenCalledWith({
      groupId: undefined,
      sportId: 6,
      title: 'Sunday run',
      description: undefined,
      locationId: 1,
      locationNote: undefined,
      scheduledStart: '2026-08-01T19:00:00',
      durationMinutes: 90,
    });
  });

  it('shows "Creating…" while submitting, and the error state', () => {
    const { rerender } = render(<CreateSessionModal {...baseProps} selectedLocation={location} isSubmitting />);
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeInTheDocument();

    rerender(<CreateSessionModal {...baseProps} selectedLocation={location} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't create the session");
  });
});
