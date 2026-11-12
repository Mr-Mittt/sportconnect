import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FriendUser } from '@/features/friends/types';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type {
  ResolvedSportAttributeSchema,
  SportKey,
  SportProfile,
} from '@/shared/types/sport';
import { CreateSessionModal } from './CreateSessionModal';

const friends: FriendUser[] = [
  { id: 'friend-1', fullName: 'Priya Shah', avatarUrl: null, coverUrl: null, bio: null },
  { id: 'friend-2', fullName: 'Priyanka Rao', avatarUrl: null, coverUrl: null, bio: null },
];

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
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
  favoriteLocationIds: new Set<number>(),
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

const baseProps = {
  isOpen: true,
  onClose: () => {},
  sportsByKey,
  selectedLocation: null as Location | null,
  onOpenLocationPicker: () => {},
  locationPicker,
  onEffectiveSportChange: () => {},
  favoriteLocations: [] as Location[],
  isFavoriteLocationsLoading: false,
  onSelectLocation: () => {},
  friends,
  isFriendsLoading: false,
  onSubmit: () => {},
  isSubmitting: false,
  isError: false,
  sessionAttributeSchema: null as ResolvedSportAttributeSchema | null,
  sessionAttributeValues: {} as Record<string, unknown>,
  onSessionAttributeChange: () => {},
  availableSports: [] as SportKey[],
  onAddSport: () => {},
  isAddingSport: false,
  isAddSportError: false,
};

/** Picks Today + 19:00 across the three independent Date/Hour/Minute selects — enough to make
 * `scheduledStart` non-empty. Today's real date isn't known at test time, so payload assertions
 * match the date half by shape, not value (see the submit test below). */
async function pickAnyStartTime(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Date'), 'Today');
  await user.selectOptions(screen.getByLabelText('Hour'), '19');
  await user.selectOptions(screen.getByLabelText('Minute'), '00');
}

/** Clicks "Create session", then confirms the "Are you ready?" popup (CLIENT-SESSION-34) — "Let's go"
 * when nothing is missing, "Create preparing session" otherwise. */
async function createAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Create session' }));
  const go =
    screen.queryByRole('button', { name: "Let's go" }) ??
    screen.getByRole('button', { name: 'Create preparing session' });
  await user.click(go);
}

describe('CreateSessionModal', () => {
  it('has no mode toggle — the form is always the standalone sport picker', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.queryByRole('group', { name: 'Session type' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Sport/)).toBeInTheDocument();
  });

  it('pre-selects the first sport profile with no activeSport and more than one sport profile', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.getByLabelText(/^Sport/)).toHaveValue('football');
  });

  it('pre-selects the first sport profile when "All" is selected and more than one sport profile exists', () => {
    render(<CreateSessionModal {...baseProps} activeSport="all" />);
    expect(screen.getByLabelText(/^Sport/)).toHaveValue('football');
  });

  it('shows the "add a sport first" gate instead of the create form when the caller has no sport profiles at all', () => {
    render(
      <CreateSessionModal
        {...baseProps}
        sportsByKey={{} as Record<SportKey, SportProfile>}
        availableSports={['football', 'basketball']}
      />,
    );
    expect(screen.getByText(/add a sport first/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Session title')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create session' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add sport' })).toBeInTheDocument();
  });

  it('submitting the "add a sport first" gate calls onAddSport, and reveals the create form once a sport profile exists', async () => {
    const user = userEvent.setup();
    const onAddSport = vi.fn();
    const { rerender } = render(
      <CreateSessionModal
        {...baseProps}
        sportsByKey={{} as Record<SportKey, SportProfile>}
        availableSports={['football', 'basketball']}
        onAddSport={onAddSport}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Sport'), 'basketball');
    await user.selectOptions(screen.getByLabelText('Skill level'), 'beginner');
    await user.click(screen.getByRole('button', { name: 'Add sport' }));
    expect(onAddSport).toHaveBeenCalledWith({
      sportId: 6,
      skillLevel: 'beginner',
      yearsOfExperience: undefined,
    });

    // Real usage: the mutation's onSuccess writes the new profile into the query cache, which
    // flows back down as a non-empty sportsByKey prop — this Dialog was never unmounted, so it's
    // the same mounted instance that swaps from the gate to the real form.
    rerender(<CreateSessionModal {...baseProps} onAddSport={onAddSport} />);
    expect(screen.queryByText(/add a sport first/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create session' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Sport/)).toHaveValue('football');
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

  it('has five sections (Overview, When, Where, Who, Cost), all open by default; "Session detail" is absent when the sport has no session schema', () => {
    render(<CreateSessionModal {...baseProps} />);
    for (const name of [/^Overview/, /^When/, /^Where/, /^Who/, /^Cost/]) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'true');
    }
    expect(screen.getByLabelText(/^Sport/)).toBeVisible();
    // CLIENT-SESSION-15: no session schema -> the whole "Session detail" section is not rendered.
    expect(screen.queryByRole('button', { name: 'Session detail' })).not.toBeInTheDocument();
  });

  it('a section collapses and opens again from its header', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);
    const cost = screen.getByRole('button', { name: /^Cost/ });
    await user.click(cost);
    expect(cost).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Fee note')).not.toBeInTheDocument();
    await user.click(cost);
    expect(screen.getByLabelText('Fee note')).toBeVisible();
  });

  it('no field label says "(optional)" any more, and Description is gone from the form', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.queryByText(/\(optional\)/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Description/)).not.toBeInTheDocument();
  });

  describe('Session detail — session attributes (CLIENT-SESSION-15)', () => {
    const schema: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'match',
          label: 'Match details',
          isAvailable: true,
          attributes: [
            { key: 'racketBrand', label: 'Racket brand', type: 'STRING', isAvailable: true },
            { key: 'format', label: 'Format', type: 'STRING', isAvailable: true },
          ],
        },
      ],
    };

    it('renders SportAttributesFields under "Session detail" when a session schema is present', () => {
      render(<CreateSessionModal {...baseProps} sessionAttributeSchema={schema} />);
      expect(screen.getByRole('button', { name: 'Session detail' })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByLabelText('Racket brand')).toBeInTheDocument();
      expect(screen.getByLabelText('Format')).toBeInTheDocument();
    });

    it('shows a pre-filled attribute value from sessionAttributeValues', () => {
      render(
        <CreateSessionModal
          {...baseProps}
          sessionAttributeSchema={schema}
          sessionAttributeValues={{ 'match/racketBrand': 'Yonex' }}
        />,
      );
      expect(screen.getByLabelText('Racket brand')).toHaveValue('Yonex');
    });

    it('fires onSessionAttributeChange with the node path when an attribute is edited', async () => {
      const user = userEvent.setup();
      const onSessionAttributeChange = vi.fn();
      render(
        <CreateSessionModal
          {...baseProps}
          sessionAttributeSchema={schema}
          onSessionAttributeChange={onSessionAttributeChange}
        />,
      );
      await user.type(screen.getByLabelText('Format'), 'D');
      expect(onSessionAttributeChange).toHaveBeenLastCalledWith('match/format', 'D');
    });
  });

  it('the "Choose location" trigger is enabled from the start (Sport always prefills when the caller has any profile)', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.getByLabelText(/^Sport/)).toHaveValue('football');
    expect(screen.getByRole('button', { name: 'Choose location' })).toBeEnabled();
  });

  it('"Choose a location…" in the favorites dropdown calls onOpenLocationPicker with the effective sportId', async () => {
    const user = userEvent.setup();
    const onOpenLocationPicker = vi.fn();
    render(<CreateSessionModal {...baseProps} activeSport="basketball" onOpenLocationPicker={onOpenLocationPicker} />);

    await user.click(screen.getByRole('button', { name: 'Choose location' }));
    await user.click(screen.getByRole('menuitem', { name: 'Choose a location…' }));
    expect(onOpenLocationPicker).toHaveBeenCalledWith(6);
  });

  it('shows the chosen location name and "Change location"', () => {
    render(<CreateSessionModal {...baseProps} selectedLocation={location} />);
    expect(screen.getByText('Riverside Courts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change location' })).toBeInTheDocument();
  });

  it('favorites dropdown lists favoriteLocations, selecting one calls onSelectLocation, and shows an empty state', async () => {
    const user = userEvent.setup();
    const onSelectLocation = vi.fn();
    const favorite = { ...location, id: 2, name: 'Lakeside Courts' };
    const { rerender } = render(
      <CreateSessionModal
        {...baseProps}
        activeSport="basketball"
        favoriteLocations={[favorite]}
        onSelectLocation={onSelectLocation}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Choose location' }));
    await user.click(screen.getByRole('menuitem', { name: 'Lakeside Courts' }));
    expect(onSelectLocation).toHaveBeenCalledWith(favorite);

    rerender(<CreateSessionModal {...baseProps} activeSport="basketball" favoriteLocations={[]} />);
    await user.click(screen.getByRole('button', { name: 'Choose location' }));
    expect(screen.getByText('No favorites yet.')).toBeInTheDocument();
  });

  it('reports the effective sportId up via onEffectiveSportChange on mount and on every change', async () => {
    const user = userEvent.setup();
    const onEffectiveSportChange = vi.fn();
    render(
      <CreateSessionModal
        {...baseProps}
        activeSport="basketball"
        onEffectiveSportChange={onEffectiveSportChange}
      />,
    );
    expect(onEffectiveSportChange).toHaveBeenLastCalledWith(6);

    await user.selectOptions(screen.getByLabelText(/^Sport/), 'tennis');
    expect(onEffectiveSportChange).toHaveBeenLastCalledWith(2);
  });

  it('changing the Sport resets every field in the form (CLIENT-SESSION-15 scope change)', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} activeSport="basketball" />);

    await user.type(screen.getByLabelText(/^Session title/), 'Sunday game');
    await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '8');
    expect(screen.getByLabelText(/^Session title/)).toHaveValue('Sunday game');

    await user.selectOptions(screen.getByLabelText(/^Sport/), 'tennis');

    expect(screen.getByLabelText(/^Sport/)).toHaveValue('tennis');
    expect(screen.getByLabelText(/^Session title/)).toHaveValue('');
    expect(screen.getByLabelText(/^Duration \(min\)/)).toHaveValue(null);
    expect(screen.getByLabelText(/^Open slot/)).toHaveValue(null);
    // "Starts at" re-pre-fills for the new sport (SessionStartTimePicker is re-keyed on the
    // sport) — the reset clears `scheduledStart`, and without the re-key it would stay empty
    // and silently fail "Start time is required" on submit (regression matches-journey caught).
    expect(screen.getByLabelText('Hour')).not.toHaveValue('');
    expect(screen.getByLabelText('Date')).not.toHaveValue('');
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

    // CLIENT-SESSION-34: only sport, start time and open slot are required to create — the title
    // and the duration are optional now, and so are location and fee (SESSION-24).
    expect(screen.getByText('Open slot is required.')).toBeInTheDocument();
    expect(screen.queryByText('Title is required.')).not.toBeInTheDocument();
    expect(screen.queryByText('Duration is required.')).not.toBeInTheDocument();
    expect(screen.queryByText('Location is required.')).not.toBeInTheDocument();
    // …and no readiness popup for an invalid form.
    expect(screen.queryByText('Are you ready?')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Fee has no default selection, and it never blocks submit on its own (CLIENT-SESSION-21)', () => {
    render(<CreateSessionModal {...baseProps} />);
    expect(screen.getByRole('checkbox', { name: 'Free' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Split cost' })).not.toBeChecked();
    expect(screen.getByLabelText('Fixed amount')).toHaveValue('');
  });

  describe('CLIENT-SESSION-34: "Missing" chips and the "Are you ready?" popup', () => {
    it('shows an amber chip on the section that owns each gap: duration, location, fee', () => {
      render(<CreateSessionModal {...baseProps} />);
      expect(screen.getByText('Missing: duration')).toBeInTheDocument();
      expect(screen.getByText('Missing: location')).toBeInTheDocument();
      expect(screen.getByText('Missing: fee')).toBeInTheDocument();
    });

    it('each chip goes away once its gap is filled', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<CreateSessionModal {...baseProps} />);
      await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
      expect(screen.queryByText('Missing: duration')).not.toBeInTheDocument();
      await user.click(screen.getByRole('checkbox', { name: 'Free' }));
      expect(screen.queryByText('Missing: fee')).not.toBeInTheDocument();
      expect(screen.getByText('Missing: location')).toBeInTheDocument();
      rerender(<CreateSessionModal {...baseProps} selectedLocation={location} />);
      expect(screen.queryByText('Missing: location')).not.toBeInTheDocument();
    });

    it('no longer shows the old "will be created as Preparing" footer line', () => {
      render(<CreateSessionModal {...baseProps} />);
      expect(screen.queryByText(/will be created as/)).not.toBeInTheDocument();
    });

    it('incomplete: lists what is missing and offers "Continue editing" / "Create preparing session"', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" onSubmit={onSubmit} />);
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '10');
      await user.click(screen.getByRole('button', { name: 'Create session' }));

      expect(screen.getByText('Are you ready?')).toBeInTheDocument();
      const list = screen.getByRole('list');
      expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Location',
        'Fee',
        'Duration',
      ]);
      // Nothing is sent until the popup is confirmed.
      expect(onSubmit).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Continue editing' }));
      expect(screen.queryByText('Are you ready?')).not.toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Create session' }));
      await user.click(screen.getByRole('button', { name: 'Create preparing session' }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ locationId: undefined, feeType: undefined }));
    });

    it('names only what is still missing', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} selectedLocation={location} activeSport="basketball" />);
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '10');
      await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
      await user.click(screen.getByRole('button', { name: 'Create session' }));
      expect(within(screen.getByRole('list')).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Fee',
      ]);
    });

    it('complete: warns the details cannot be edited afterwards, "Let me check again" goes back, "Let\'s go" submits', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <CreateSessionModal {...baseProps} selectedLocation={location} activeSport="basketball" onSubmit={onSubmit} />,
      );
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '10');
      await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
      await user.click(screen.getByRole('checkbox', { name: 'Free' }));
      await user.click(screen.getByRole('button', { name: 'Create session' }));

      expect(screen.getByText(/Its details can't be edited after that/)).toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Let me check again' }));
      expect(onSubmit).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Create session' }));
      await user.click(screen.getByRole('button', { name: "Let's go" }));
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('submits with locationId/feeType omitted when both are left blank', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" onSubmit={onSubmit} />);

      await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
      await user.type(screen.getByLabelText(/^Open slot/), '10');
      await createAndConfirm(user);

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ locationId: undefined, feeType: undefined }),
      );
    });
  });

  it('typing into "Fixed amount" selects it; clearing it back to empty un-selects Fixed entirely (CLIENT-SESSION-21)', async () => {
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

    await user.type(screen.getByLabelText('Fixed amount'), '50000');
    expect(screen.getByRole('checkbox', { name: 'Free' })).not.toBeChecked();

    await user.clear(screen.getByLabelText('Fixed amount'));
    await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
    await pickAnyStartTime(user);
    await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '10');
    await createAndConfirm(user);

    // Clearing the amount cleared the FIXED selection too, so this submits with feeType
    // undefined (PREPARING), not FIXED with a missing amount.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feeType: undefined }));
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

  it('re-clicking a checked "Free"/"Split cost" checkbox un-checks it back to no fee selected (CLIENT-SESSION-21)', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);

    const free = screen.getByRole('checkbox', { name: 'Free' });
    await user.click(free);
    expect(free).toBeChecked();
    await user.click(free);
    expect(free).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Split cost' })).not.toBeChecked();

    const split = screen.getByRole('checkbox', { name: 'Split cost' });
    await user.click(split);
    expect(split).toBeChecked();
    await user.click(split);
    expect(split).not.toBeChecked();
  });

  it('a field error clears on its own once that field is filled in, without needing to resubmit', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} activeSport="basketball" />);

    await user.click(screen.getByRole('button', { name: 'Create session' }));
    expect(screen.getByText('Open slot is required.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Open slot/), '10');
    expect(screen.queryByText('Open slot is required.')).not.toBeInTheDocument();
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
    await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '10');
    await createAndConfirm(user);

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
    await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '10');
    await createAndConfirm(user);

    // scheduledStart's date half is "today" per the real clock (the Date select's "Today"
    // option) — asserted by shape, not value, so this test isn't coupled to which day it runs.
    expect(onSubmit).toHaveBeenCalledWith({
      sportId: 6,
      title: 'Sunday run',
      locationId: 1,
      locationNote: undefined,
      // CLIENT-SESSION-24: offset-aware (`Z` or `±HH:MM`) — a bare local datetime is a 400.
      scheduledStart: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T19:00:00(Z|[+-]\d{2}:\d{2})$/),
      durationMinutes: 90,
      // Taken slot left blank -> defaults to 1 (the creator, who auto-joins) -> capacity = 1 + 10,
      // initialSlot = 1 - 1 = 0 (the creator's own auto-joined row already accounts for it).
      capacity: 11,
      // CLIENT-SESSION-21: no fee picked in this test -> feeType stays undefined (SESSION-24
      // PREPARING), not the old FREE default.
      feeType: undefined,
      feeAmountVnd: undefined,
      feeNote: undefined,
      initialSlot: 0,
      autoApprove: false,
      // CLIENT-SESSION-34: nothing reserved by gender; the mood slider's untouched default is sent.
      maleSlots: undefined,
      femaleSlots: undefined,
      gameMood: 5,
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
    await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
    await user.type(screen.getByLabelText('Taken slot'), '3');
    await user.type(screen.getByLabelText(/^Open slot/), '4');
    await createAndConfirm(user);

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
    await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '10');
    await user.type(screen.getByLabelText('Fixed amount'), '50000');
    await createAndConfirm(user);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ feeType: 'FIXED', feeAmountVnd: 50000 }),
    );
  });

  it('every numeric field rejects non-digit keystrokes (Duration/Taken slot/Open slot/Fixed amount)', async () => {
    const user = userEvent.setup();
    render(<CreateSessionModal {...baseProps} />);

    const duration = screen.getByLabelText(/^Duration \(min\)/);
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

    const duration = screen.getByLabelText(/^Duration \(min\)/);
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

    // CLIENT-ERR-7: a coded 400 swaps the generic line for its specific copy.
    rerender(
      <CreateSessionModal {...baseProps} selectedLocation={location} isError errorText="Enter the fee amount." />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the fee amount.');
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
    await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
    await user.type(screen.getByLabelText(/^Open slot/), '10');
    await user.type(screen.getByLabelText('Search friends to invite'), 'Priya Shah');
    await user.click(screen.getByRole('button', { name: /Priya Shah/ }));
    await createAndConfirm(user);

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ inviteeIds: ['friend-1'] }));
  });

  describe('CLIENT-SESSION-34: auto approve asks first', () => {
    it('defaults unchecked; ticking opens the confirmation instead of checking, "Cancel" leaves it unchecked', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} />);
      const checkbox = screen.getByRole('checkbox', { name: 'Auto approve join request' });
      expect(checkbox).not.toBeChecked();
      // The inline hint under the checkbox is gone.
      expect(screen.queryByText('Everyone can join without your review.', { selector: 'p.text-2xs' })).not.toBeInTheDocument();

      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
      expect(screen.getByText('Turn on auto approve?')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Turn on auto approve?')).not.toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
    });

    it('"Turn on" checks it and the payload carries autoApprove; unticking opens nothing', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <CreateSessionModal {...baseProps} selectedLocation={location} activeSport="basketball" onSubmit={onSubmit} />,
      );
      const checkbox = screen.getByRole('checkbox', { name: 'Auto approve join request' });
      await user.click(checkbox);
      await user.click(screen.getByRole('button', { name: 'Turn on' }));
      expect(checkbox).toBeChecked();

      await user.click(checkbox);
      expect(checkbox).not.toBeChecked();
      expect(screen.queryByText('Turn on auto approve?')).not.toBeInTheDocument();

      await user.click(checkbox);
      await user.click(screen.getByRole('button', { name: 'Turn on' }));
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '10');
      await createAndConfirm(user);
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ autoApprove: true }));
    });

    it('Escape on the confirmation cancels it', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} />);
      const checkbox = screen.getByRole('checkbox', { name: 'Auto approve join request' });
      await user.click(checkbox);
      await user.keyboard('{Escape}');
      expect(screen.queryByText('Turn on auto approve?')).not.toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
    });
  });

  describe('CLIENT-SESSION-34: title and duration are optional', () => {
    it('submits without a title or a duration (both omitted from the payload)', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" onSubmit={onSubmit} />);
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '10');
      await createAndConfirm(user);
      const payload = onSubmit.mock.calls[0][0];
      expect(payload.title).toBeUndefined();
      expect(payload.durationMinutes).toBeUndefined();
    });

    it('a title of only spaces is treated as no title', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" onSubmit={onSubmit} />);
      await user.type(screen.getByLabelText(/^Session title/), '   ');
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '10');
      await createAndConfirm(user);
      expect(onSubmit.mock.calls[0][0].title).toBeUndefined();
    });
  });

  describe('CLIENT-SESSION-34: start, duration and end follow each other', () => {
    it('a duration derives the end', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} />);
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
      expect(screen.getByLabelText('Ends at: hour')).toHaveValue('20');
      expect(screen.getByLabelText('Ends at: minute')).toHaveValue('30');
    });

    it('an end past midnight lands on the next day', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} />);
      await user.selectOptions(screen.getByLabelText('Date'), 'Today');
      await user.selectOptions(screen.getByLabelText('Hour'), '23');
      await user.selectOptions(screen.getByLabelText('Minute'), '30');
      await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
      expect(screen.getByLabelText('Ends at: hour')).toHaveValue('01');
      expect(screen.getByLabelText('Ends at: minute')).toHaveValue('00');
      expect(screen.getByLabelText('Ends at: date')).not.toHaveValue((screen.getByLabelText('Date') as HTMLSelectElement).value);
    });

    it('an end picked by hand derives the duration', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} />);
      await pickAnyStartTime(user);
      await user.selectOptions(screen.getByLabelText('Ends at: date'), 'Today');
      await user.selectOptions(screen.getByLabelText('Ends at: hour'), '21');
      await user.selectOptions(screen.getByLabelText('Ends at: minute'), '15');
      expect(screen.getByLabelText(/^Duration \(min\)/)).toHaveValue(135);
    });

    it('moving the start keeps the duration and moves the end', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} />);
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
      await user.selectOptions(screen.getByLabelText('Hour'), '20');
      expect(screen.getByLabelText(/^Duration \(min\)/)).toHaveValue(90);
      expect(screen.getByLabelText('Ends at: hour')).toHaveValue('21');
      expect(screen.getByLabelText('Ends at: minute')).toHaveValue('30');
    });

    it('an end that is not after the start shows an error, clears the duration and blocks Create', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" onSubmit={onSubmit} />);
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '10');
      await user.selectOptions(screen.getByLabelText('Ends at: date'), 'Today');
      await user.selectOptions(screen.getByLabelText('Ends at: hour'), '18');
      await user.selectOptions(screen.getByLabelText('Ends at: minute'), '00');
      expect(screen.getByText('The end must be after the start.')).toBeInTheDocument();
      expect(screen.getByLabelText(/^Duration \(min\)/)).toHaveValue(null);
      await user.click(screen.getByRole('button', { name: 'Create session' }));
      expect(screen.queryByText('Are you ready?')).not.toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('the minute pickers step by one minute', () => {
      render(<CreateSessionModal {...baseProps} />);
      // 60 minutes plus the placeholder option.
      expect(screen.getByLabelText('Minute').querySelectorAll('option')).toHaveLength(61);
      expect(screen.getByLabelText('Ends at: minute').querySelectorAll('option')).toHaveLength(61);
    });
  });

  describe('CLIENT-SESSION-34: who can join (by gender)', () => {
    it('defaults to Anyone, with the gender slots locked until "By gender" is chosen', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} />);
      expect(screen.getByRole('radio', { name: 'Anyone' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Male slot' })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Female slot' })).toBeDisabled();
      await user.click(screen.getByRole('radio', { name: 'By gender' }));
      expect(screen.getByRole('checkbox', { name: 'Male slot' })).toBeEnabled();
      expect(screen.getByRole('checkbox', { name: 'Female slot' })).toBeEnabled();
      // A number input is locked until its own box is ticked.
      expect(screen.getByLabelText('Male slots')).toBeDisabled();
      await user.click(screen.getByRole('checkbox', { name: 'Male slot' }));
      expect(screen.getByLabelText('Male slots')).toBeEnabled();
    });

    it('sends the male and female slots, and nothing when Anyone is chosen', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <CreateSessionModal {...baseProps} selectedLocation={location} activeSport="basketball" onSubmit={onSubmit} />,
      );
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '8');
      await user.click(screen.getByRole('radio', { name: 'By gender' }));
      await user.click(screen.getByRole('checkbox', { name: 'Male slot' }));
      await user.type(screen.getByLabelText('Male slots'), '4');
      await user.click(screen.getByRole('checkbox', { name: 'Female slot' }));
      await user.type(screen.getByLabelText('Female slots'), '3');
      await createAndConfirm(user);
      expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ maleSlots: 4, femaleSlots: 3 }));

      // Back to Anyone clears both.
      await user.click(screen.getByRole('radio', { name: 'Anyone' }));
      expect(screen.getByLabelText('Male slots')).toHaveValue(null);
      await createAndConfirm(user);
      const payload = onSubmit.mock.calls[1][0];
      expect(payload.maleSlots).toBeUndefined();
      expect(payload.femaleSlots).toBeUndefined();
    });

    it('male + female over the open slots shows an error and blocks Create', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" onSubmit={onSubmit} />);
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '5');
      await user.click(screen.getByRole('radio', { name: 'By gender' }));
      await user.click(screen.getByRole('checkbox', { name: 'Male slot' }));
      await user.type(screen.getByLabelText('Male slots'), '4');
      await user.click(screen.getByRole('checkbox', { name: 'Female slot' }));
      await user.type(screen.getByLabelText('Female slots'), '2');
      expect(screen.getByText("Male and female slots can't be more than the open slots.")).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Create session' }));
      expect(screen.queryByText('Are you ready?')).not.toBeInTheDocument();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('exactly the open slots is fine', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" />);
      await user.type(screen.getByLabelText(/^Open slot/), '6');
      await user.click(screen.getByRole('radio', { name: 'By gender' }));
      await user.click(screen.getByRole('checkbox', { name: 'Male slot' }));
      await user.type(screen.getByLabelText('Male slots'), '4');
      await user.click(screen.getByRole('checkbox', { name: 'Female slot' }));
      await user.type(screen.getByLabelText('Female slots'), '2');
      expect(screen.queryByText("Male and female slots can't be more than the open slots.")).not.toBeInTheDocument();
    });
  });

  describe('CLIENT-SESSION-34: game mood', () => {
    it('starts at 5 · Normal, labelled, with the number beside the control', () => {
      render(<CreateSessionModal {...baseProps} />);
      const slider = screen.getByRole('slider', { name: 'Game mood' });
      expect(slider).toHaveValue('5');
      expect(slider).toHaveAttribute('aria-valuetext', '5 · Normal');
      expect(screen.getByText('5 · Normal')).toBeInTheDocument();
      expect(screen.getByText(/For fun/)).toBeInTheDocument();
      expect(screen.getByText(/Competitive/)).toBeInTheDocument();
    });

    it('moving it changes the number, the level word and the payload', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <CreateSessionModal {...baseProps} selectedLocation={location} activeSport="basketball" onSubmit={onSubmit} />,
      );
      fireEvent.change(screen.getByRole('slider', { name: 'Game mood' }), { target: { value: '9' } });
      expect(screen.getByText('9 · Competitive')).toBeInTheDocument();
      fireEvent.change(screen.getByRole('slider', { name: 'Game mood' }), { target: { value: '2' } });
      expect(screen.getByText('2 · For fun')).toBeInTheDocument();
      fireEvent.change(screen.getByRole('slider', { name: 'Game mood' }), { target: { value: '9' } });
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '10');
      await createAndConfirm(user);
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ gameMood: 9 }));
    });
  });

  describe('CLIENT-SESSION-34: fee note', () => {
    it('counts characters out of 300 and stops at 300', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} />);
      expect(screen.getByText('0/300')).toBeInTheDocument();
      await user.type(screen.getByLabelText('Fee note'), 'Cash');
      expect(screen.getByText('4/300')).toBeInTheDocument();
      expect(screen.getByLabelText('Fee note')).toHaveAttribute('maxlength', '300');
    });

    it('sends the trimmed note, and omits a blank one', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(
        <CreateSessionModal {...baseProps} selectedLocation={location} activeSport="basketball" onSubmit={onSubmit} />,
      );
      await pickAnyStartTime(user);
      await user.type(screen.getByLabelText(/^Open slot/), '10');
      await user.type(screen.getByLabelText('Fee note'), '  Cash at the door ');
      await createAndConfirm(user);
      expect(onSubmit).toHaveBeenLastCalledWith(expect.objectContaining({ feeNote: 'Cash at the door' }));

      await user.clear(screen.getByLabelText('Fee note'));
      await user.type(screen.getByLabelText('Fee note'), '   ');
      await createAndConfirm(user);
      expect(onSubmit.mock.calls[1][0].feeNote).toBeUndefined();
    });
  });

  describe('CLIENT-SESSION-34: collapsed sections always show their summary, and opening one scrolls it into view', () => {
    it('a collapsed section shows its "field: value" row even when nothing is filled in ("...")', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} />);
      await user.click(screen.getByRole('button', { name: /^Cost/ }));
      const fee = screen.getByText('Fee:').parentElement as HTMLElement;
      expect(within(fee).getByText('...')).toBeInTheDocument();
      expect(within(screen.getByText('Fee note:').parentElement as HTMLElement).getByText('...')).toBeInTheDocument();
    });

    it('the summary follows what was filled in', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" selectedLocation={location} />);
      await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
      await user.type(screen.getByLabelText(/^Duration \(min\)/), '90');
      await user.type(screen.getByLabelText(/^Open slot/), '6');
      await user.click(screen.getByRole('checkbox', { name: 'Free' }));
      for (const name of [/^Overview/, /^When/, /^Where/, /^Who/, /^Cost/]) {
        await user.click(screen.getByRole('button', { name }));
      }
      expect(screen.getByText('Title:').parentElement).toHaveTextContent('Title: Sunday run');
      expect(screen.getByText('Sport:').parentElement).toHaveTextContent('Sport: Basketball');
      expect(screen.getByText('Duration:').parentElement).toHaveTextContent('Duration: 90 min');
      expect(screen.getByText('Location:').parentElement).toHaveTextContent('Location: Riverside Courts');
      expect(screen.getByText('Open:').parentElement).toHaveTextContent('Open: 6 (anyone)');
      expect(screen.getByText('Mood:').parentElement).toHaveTextContent('Mood: 5 · Normal');
      expect(screen.getByText('Fee:').parentElement).toHaveTextContent('Fee: Free');
    });

    it('the summary shows the gender split', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" />);
      await user.type(screen.getByLabelText(/^Open slot/), '8');
      await user.click(screen.getByRole('radio', { name: 'By gender' }));
      await user.click(screen.getByRole('checkbox', { name: 'Male slot' }));
      await user.type(screen.getByLabelText('Male slots'), '4');
      await user.click(screen.getByRole('checkbox', { name: 'Female slot' }));
      await user.type(screen.getByLabelText('Female slots'), '4');
      await user.click(screen.getByRole('button', { name: /^Who/ }));
      expect(screen.getByText('Open:').parentElement).toHaveTextContent('Open: 8 (4 male - 4 female)');
    });

    it('the Session detail summary lists its attributes, "..." where empty', async () => {
      const user = userEvent.setup();
      const schema: ResolvedSportAttributeSchema = {
        groups: [
          {
            key: 'match',
            label: 'Match details',
            isAvailable: true,
            attributes: [
              { key: 'format', label: 'Format', type: 'STRING', isAvailable: true },
              { key: 'racketBrand', label: 'Racket brand', type: 'STRING', isAvailable: true },
            ],
          },
        ],
      };
      render(
        <CreateSessionModal
          {...baseProps}
          sessionAttributeSchema={schema}
          sessionAttributeValues={{ 'match/format': 'Doubles' }}
        />,
      );
      await user.click(screen.getByRole('button', { name: 'Session detail' }));
      expect(screen.getByText('Format:').parentElement).toHaveTextContent('Format: Doubles');
      expect(within(screen.getByText('Racket brand:').parentElement as HTMLElement).getByText('...')).toBeInTheDocument();
    });

    it('opening a collapsed section scrolls it into view', async () => {
      const user = userEvent.setup();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        render(<CreateSessionModal {...baseProps} />);
        const cost = screen.getByRole('button', { name: /^Cost/ });
        await user.click(cost);
        scrollIntoView.mockClear();
        await user.click(cost);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
      } finally {
        delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
    });
  });

  describe('CLIENT-SESSION-34: the Who section flags the open slot, which is needed to create', () => {
    it('shows "Missing: open slot" until the open slot is filled in', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} />);
      expect(screen.getByText('Missing: open slot')).toBeInTheDocument();
      await user.type(screen.getByLabelText(/^Open slot/), '6');
      expect(screen.queryByText('Missing: open slot')).not.toBeInTheDocument();
    });

    it('uses the 70vh height for the sectioned form (not the 60vh default)', () => {
      render(<CreateSessionModal {...baseProps} />);
      expect(screen.getByRole('dialog').style.height).toBe('70vh');
    });
  });

  it('opening the form does not scroll any section into view (it stays on top)', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      render(<CreateSessionModal {...baseProps} />);
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  describe('CLIENT-SESSION-34: a refused Create takes the user to the first blocking field', () => {
    it('focuses and scrolls to the open slot when it is missing', async () => {
      const user = userEvent.setup();
      const scrollIntoView = vi.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        render(<CreateSessionModal {...baseProps} activeSport="basketball" />);
        scrollIntoView.mockClear();
        await user.click(screen.getByRole('button', { name: 'Create session' }));
        expect(screen.getByLabelText(/^Open slot/)).toHaveFocus();
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
      } finally {
        delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
    });

    it('opens the Who section first if the user had collapsed it, then focuses the open slot', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" />);
      await user.click(screen.getByRole('button', { name: /^Who/ }));
      expect(screen.queryByLabelText(/^Open slot/)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Create session' }));
      expect(screen.getByLabelText(/^Open slot/)).toHaveFocus();
    });

    it('focuses it again on a second refused click', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" />);
      await user.click(screen.getByRole('button', { name: 'Create session' }));
      await user.click(screen.getByRole('button', { name: /^Cost/ })); // moves focus elsewhere
      await user.click(screen.getByRole('button', { name: 'Create session' }));
      expect(screen.getByLabelText(/^Open slot/)).toHaveFocus();
    });

    it('focuses the male count when male + female exceed the open slots', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" />);
      await user.type(screen.getByLabelText(/^Open slot/), '3');
      await user.click(screen.getByRole('radio', { name: 'By gender' }));
      await user.click(screen.getByRole('checkbox', { name: 'Male slot' }));
      await user.type(screen.getByLabelText('Male slots'), '5');
      await user.click(screen.getByRole('button', { name: 'Create session' }));
      expect(screen.getByLabelText('Male slots')).toHaveFocus();
    });

    it('does not move focus when Create is accepted (the popup opens instead)', async () => {
      const user = userEvent.setup();
      render(<CreateSessionModal {...baseProps} activeSport="basketball" />);
      await user.type(screen.getByLabelText(/^Open slot/), '3');
      await user.click(screen.getByRole('button', { name: 'Create session' }));
      expect(screen.getByText('Are you ready?')).toBeInTheDocument();
      expect(document.getElementById('create-session-open-slots')).not.toHaveFocus();
    });
  });

  describe('CLIENT-SESSION-34: closing with unsent entries asks first', () => {
    it('closes straight away when nothing was entered', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<CreateSessionModal {...baseProps} onClose={onClose} />);
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
    });

    it('asks "Leave without saving?" instead of closing once something was entered; Keep editing stays', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<CreateSessionModal {...baseProps} onClose={onClose} />);
      await user.type(screen.getByLabelText(/^Session title/), 'Sunday run');
      await user.keyboard('{Escape}');
      expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Keep editing' }));
      expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/^Session title/)).toHaveValue('Sunday run');
    });

    it('"Leave" closes the form', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<CreateSessionModal {...baseProps} onClose={onClose} />);
      await user.type(screen.getByLabelText(/^Open slot/), '4');
      await user.keyboard('{Escape}');
      await user.click(screen.getByRole('button', { name: 'Leave' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape on the question itself keeps editing (it does not leave)', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<CreateSessionModal {...baseProps} onClose={onClose} />);
      await user.type(screen.getByLabelText(/^Session title/), 'x');
      await user.keyboard('{Escape}');
      await user.keyboard('{Escape}');
      expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('a title of only spaces is not an entry; a chosen location, a fee, a mood and an invitee each are', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const { rerender } = render(<CreateSessionModal {...baseProps} onClose={onClose} />);
      await user.type(screen.getByLabelText(/^Session title/), '   ');
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
      onClose.mockClear();

      rerender(<CreateSessionModal {...baseProps} onClose={onClose} selectedLocation={location} />);
      await user.keyboard('{Escape}');
      expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Keep editing' }));
      rerender(<CreateSessionModal {...baseProps} onClose={onClose} selectedLocation={null} />);

      await user.click(screen.getByRole('checkbox', { name: 'Free' }));
      await user.keyboard('{Escape}');
      expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Keep editing' }));
      await user.click(screen.getByRole('checkbox', { name: 'Free' }));

      fireEvent.change(screen.getByRole('slider', { name: 'Game mood' }), { target: { value: '8' } });
      await user.keyboard('{Escape}');
      expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Keep editing' }));
      fireEvent.change(screen.getByRole('slider', { name: 'Game mood' }), { target: { value: '5' } });

      await user.type(screen.getByLabelText('Search friends to invite'), 'Priya Shah');
      await user.click(screen.getByRole('button', { name: /Priya Shah/ }));
      await user.keyboard('{Escape}');
      expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('a session attribute that was filled in counts too', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<CreateSessionModal {...baseProps} onClose={onClose} sessionAttributeValues={{ 'match/format': 'D' }} />);
      await user.keyboard('{Escape}');
      expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
    });

    describe('a schema default that the form seeded by itself is not an entry', () => {
      const schemaWithDefault: ResolvedSportAttributeSchema = {
        groups: [
          {
            key: 'match',
            label: 'Match details',
            isAvailable: true,
            attributes: [{ key: 'format', label: 'Format', type: 'STRING', isAvailable: true, defaultValue: 'Doubles' }],
          },
        ],
      };

      it('closes straight away when the only value is the default the schema seeded', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(
          <CreateSessionModal
            {...baseProps}
            onClose={onClose}
            sessionAttributeSchema={schemaWithDefault}
            sessionAttributeValues={{ 'match/format': 'Doubles' }}
          />,
        );
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
      });

      it('asks once the user changed that value, or filled one that has no default', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const { rerender } = render(
          <CreateSessionModal
            {...baseProps}
            onClose={onClose}
            sessionAttributeSchema={schemaWithDefault}
            sessionAttributeValues={{ 'match/format': 'Singles' }}
          />,
        );
        await user.keyboard('{Escape}');
        expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Keep editing' }));

        rerender(
          <CreateSessionModal
            {...baseProps}
            onClose={onClose}
            sessionAttributeSchema={schemaWithDefault}
            sessionAttributeValues={{ 'match/format': 'Doubles', 'match/racketBrand': 'Yonex' }}
          />,
        );
        await user.keyboard('{Escape}');
        expect(screen.getByText('Leave without saving?')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
      });
    });
  });
});
