import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { Session } from '@/shared/types/session';
import { SessionPreparingCompletion } from './SessionPreparingCompletion';

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

const inertLocationPicker: LocationPickerProps = {
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
  favoriteLocationIds: new Set(),
  onToggleFavorite: () => {},
  isTogglingFavorite: false,
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

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 1,
    groupId: null,
    sessionType: 'STANDALONE',
    createdBy: 'user-1',
    createdByFullName: 'Jordan Lee',
    sportId: 6,
    sportName: 'Basketball',
    title: 'Sunday pickup run',
    description: null,
    location: null,
    locationNote: null,
    scheduledStart: '2026-08-01T19:00:00',
    scheduledEndAt: null,
    status: 'PREPARING',
    cancelReason: null,
    cancelledBy: null,
    cancelledByFullName: null,
    cancelledAt: null,
    participantCount: 1,
    capacity: 9999,
    feeType: null,
    feeAmountVnd: null,
    initialSlot: 0,
    autoApprove: false,
    likeCount: 0,
    isLikedByCurrentUser: false,
    callerParticipation: null,
    createdAt: '2026-07-01T10:00:00',
    updatedAt: '2026-07-01T10:00:00',
    ...overrides,
  };
}

const baseProps = {
  selectedLocation: null as Location | null,
  onOpenLocationPicker: () => {},
  locationPicker: inertLocationPicker,
  favorites: { locations: [] as Location[], isLoading: false, onSelect: () => {} },
  onSubmit: () => {},
  isSubmitting: false,
  isError: false,
};

describe('SessionPreparingCompletion', () => {
  it('renders only the location control when only location is missing', () => {
    render(
      <SessionPreparingCompletion {...baseProps} session={makeSession({ feeType: 'FREE' })} />,
    );
    expect(screen.getByRole('button', { name: 'Choose location' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Free' })).not.toBeInTheDocument();
    expect(screen.getByText('Location', { selector: 'strong' })).toBeInTheDocument();
  });

  it('renders only the fee control when only fee is missing', () => {
    render(
      <SessionPreparingCompletion {...baseProps} session={makeSession({ location })} />,
    );
    expect(screen.queryByRole('button', { name: 'Choose location' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Free' })).toBeInTheDocument();
    expect(screen.getByText('Fee', { selector: 'strong' })).toBeInTheDocument();
  });

  it('renders both controls, and names both fields, when both are missing', () => {
    render(<SessionPreparingCompletion {...baseProps} session={makeSession()} />);
    expect(screen.getByRole('button', { name: 'Choose location' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Free' })).toBeInTheDocument();
    expect(screen.getByText('Location and Fee', { selector: 'strong' })).toBeInTheDocument();
  });

  it('Save starts disabled, and enables once any missing field gets a value — partial completion is allowed (SESSION-24 keeps the session PREPARING until both are set)', async () => {
    const user = userEvent.setup();
    render(<SessionPreparingCompletion {...baseProps} session={makeSession()} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Free' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('Save submits only the completed field(s), never a field the session already has', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SessionPreparingCompletion
        {...baseProps}
        session={makeSession({ feeType: 'FREE' })}
        selectedLocation={location}
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ locationId: location.id });
  });

  it('submits feeAmountVnd only when Fixed is chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <SessionPreparingCompletion
        {...baseProps}
        session={makeSession({ location })}
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText('Fixed amount'), '50000');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({ feeType: 'FIXED', feeAmountVnd: 50000 });
  });

  it('re-clicking a checked fee checkbox un-checks it, and Save disables again if it was the only field being completed', async () => {
    const user = userEvent.setup();
    render(
      <SessionPreparingCompletion {...baseProps} session={makeSession({ location })} />,
    );
    const free = screen.getByRole('checkbox', { name: 'Free' });
    await user.click(free);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    await user.click(free);
    expect(free).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the error message when isError', () => {
    render(<SessionPreparingCompletion {...baseProps} session={makeSession()} isError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't complete the session setup");
  });

  it('shows "Saving…" while isSubmitting', () => {
    render(
      <SessionPreparingCompletion
        {...baseProps}
        session={makeSession({ feeType: 'FREE' })}
        selectedLocation={location}
        isSubmitting
      />,
    );
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  // CLIENT-SESSION-23 — the location control is CreateSessionModal's favorites dropdown, not a bare
  // button that always opened the full picker.
  describe('location favorites dropdown', () => {
    it('lists favorite locations, and picking one calls favorites.onSelect', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      const favorite = { ...location, id: 2, name: 'Lakeside Courts' };
      render(
        <SessionPreparingCompletion
          {...baseProps}
          session={makeSession({ feeType: 'FREE' })}
          favorites={{ locations: [favorite], isLoading: false, onSelect }}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Choose location' }));
      await user.click(screen.getByRole('menuitem', { name: 'Lakeside Courts' }));
      expect(onSelect).toHaveBeenCalledWith(favorite);
    });

    it('"Choose a location…" opens the full picker via onOpenLocationPicker', async () => {
      const user = userEvent.setup();
      const onOpenLocationPicker = vi.fn();
      render(
        <SessionPreparingCompletion
          {...baseProps}
          session={makeSession({ feeType: 'FREE' })}
          onOpenLocationPicker={onOpenLocationPicker}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Choose location' }));
      await user.click(screen.getByRole('menuitem', { name: 'Choose a location…' }));
      expect(onOpenLocationPicker).toHaveBeenCalledTimes(1);
    });

    it('shows the empty and loading states', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <SessionPreparingCompletion {...baseProps} session={makeSession({ feeType: 'FREE' })} />,
      );
      await user.click(screen.getByRole('button', { name: 'Choose location' }));
      expect(screen.getByText('No favorites yet.')).toBeInTheDocument();
      await user.keyboard('{Escape}');

      rerender(
        <SessionPreparingCompletion
          {...baseProps}
          session={makeSession({ feeType: 'FREE' })}
          favorites={{ locations: [], isLoading: true, onSelect: () => {} }}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Choose location' }));
      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });

    it('does not render the dropdown at all when only the fee is missing', () => {
      render(<SessionPreparingCompletion {...baseProps} session={makeSession({ location })} />);
      expect(screen.queryByRole('button', { name: /choose location|change location/i })).not.toBeInTheDocument();
    });
  });
});
