import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/app/authStore';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import type { PickerMember } from '@/shared/components/MemberPicker';
import { useSportCatalogStore } from '@/shared/lib/sportCatalogStore';
import type { Location } from '@/shared/types/location';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { CreateSessionPayload } from '../types';
import { CreateSessionModal } from './CreateSessionModal';

/**
 * CLIENT-GROUP-SESSION-1: the create form in group mode (`group` prop): the group's sport, no slot information, no
 * visibility switch, auto approve on by default, and an audience (all members, or specific ones) in place of the slots.
 */

const sportsByKey: Record<SportKey, SportProfile> = {
  football: { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' },
  basketball: { key: 'basketball', label: 'Basketball', iconUrl: '/images/sports/basketball.png', colorRamp: 'coral' },
  tennis: { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' },
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

const tennis = { id: 2, key: 'tennis' as const, name: 'Tennis', iconUrl: null };
const group = { id: 5, sportId: tennis.id, name: 'Saigon Tennis Club' };
const linh: PickerMember = { id: 'm-linh', name: 'Linh Tran', avatarUrl: null };
const minh: PickerMember = { id: 'm-minh', name: 'Minh Le', avatarUrl: null };

function renderForm(overrides: Record<string, unknown> = {}) {
  const onSubmit = vi.fn<(payload: CreateSessionPayload) => void>();
  const onQueryChange = vi.fn();
  render(
    <CreateSessionModal
      isOpen
      onClose={() => {}}
      sportsByKey={sportsByKey}
      group={group}
      audienceSearch={{ query: 'li', onQueryChange, results: [linh, minh], isSearching: false, isSearchError: false }}
      selectedLocation={null as Location | null}
      onOpenLocationPicker={() => {}}
      locationPicker={locationPicker}
      onEffectiveSportChange={() => {}}
      favoriteLocations={[]}
      isFavoriteLocationsLoading={false}
      onSelectLocation={() => {}}
      friends={[]}
      isFriendsLoading={false}
      onSubmit={onSubmit}
      isSubmitting={false}
      isError={false}
      sessionAttributeSchema={null}
      sessionAttributeValues={{}}
      onSessionAttributeChange={() => {}}
      availableSports={[]}
      onAddSport={() => {}}
      isAddingSport={false}
      isAddSportError={false}
      {...overrides}
    />,
  );
  return { onSubmit, onQueryChange };
}

async function pickAnyStartTime(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Date'), 'Today');
  await user.selectOptions(screen.getByLabelText('Hour'), '19');
  await user.selectOptions(screen.getByLabelText('Minute'), '00');
}

async function createAndConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Create session' }));
  const go =
    screen.queryByRole('button', { name: "Let's go" }) ??
    screen.getByRole('button', { name: 'Create preparing session' });
  await user.click(go);
}

beforeEach(() => {
  // The form picks "Today 19:00": freeze the clock before it, as the standalone form's tests do, so the start is never in the past.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-08-03T06:00:00') });
  // The group's sport resolves through the catalog (`sportKeyForId`), as it does once the app has loaded it.
  useSportCatalogStore.setState({ sports: [tennis], byKey: new Map([['tennis', tennis]]), byId: new Map([[2, tennis]]) });
  useAuthStore.setState({
    user: {
      id: 'user-1',
      email: 'jordan@example.com',
      firstName: 'Jordan',
      lastName: 'Lee',
      username: 'jordanlee',
      phoneNumber: null,
      avatarUrl: null,
      roles: ['ROLE_USER'],
    },
    accessToken: 'token',
    isBootstrapping: false,
  });
});

describe('CreateSessionModal in group mode (CLIENT-GROUP-SESSION-1)', () => {
  it('is titled "Create session" and has no sport select', () => {
    renderForm();
    expect(screen.getByRole('dialog', { name: 'Create session' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Sport/)).not.toBeInTheDocument();
  });

  it('opens the Overview with the group-members line, then a title pre-filled with the group name', () => {
    renderForm();
    expect(
      screen.getByText('This session is for your group members. You can open it to non-members later if you need more players.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Session title/)).toHaveValue("Saigon Tennis Club's session");
  });

  it('asks no visible question above the audience choice', () => {
    renderForm();
    expect(screen.queryByText('Who is this session for?')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Who is this session for?' })).toBeInTheDocument();
  });

  it('shows no slot information, no visibility switch and no friend invite', () => {
    renderForm();
    expect(screen.queryByLabelText(/Taken slot/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Open slot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Who can join/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText(/Invite your friend/i)).not.toBeInTheDocument();
  });

  it('has auto approve on by default, and turning it back on needs no confirmation', async () => {
    const user = userEvent.setup();
    renderForm();
    const autoApprove = screen.getByRole('checkbox', { name: /Auto approve/i });
    expect(autoApprove).toBeChecked();
    await user.click(autoApprove);
    expect(autoApprove).not.toBeChecked();
    await user.click(autoApprove);
    expect(autoApprove).toBeChecked();
    expect(screen.queryByRole('dialog', { name: /auto approve/i })).not.toBeInTheDocument();
  });

  it('defaults the audience to all members', () => {
    renderForm();
    expect(screen.getByRole('radio', { name: 'All members' })).toBeChecked();
    expect(screen.queryByRole('textbox', { name: 'Search members' })).not.toBeInTheDocument();
  });

  it('creates for all members with the group, the audience and the uncapped sentinel, and no standalone-only field', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await pickAnyStartTime(user);
    await createAndConfirm(user);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({
      groupId: 5,
      audience: 'ALL_MEMBERS',
      capacity: 9999,
      autoApprove: true,
      title: "Saigon Tennis Club's session",
    });
    expect(payload.audienceUserIds).toBeUndefined();
    for (const standaloneOnly of ['sportId', 'isPublic', 'initialSlot', 'inviteeIds', 'maleSlots', 'femaleSlots']) {
      expect(payload).not.toHaveProperty(standaloneOnly, expect.anything());
    }
  });

  it('creates for specific members with the ids picked, and shows them as removable badges', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.click(screen.getByRole('radio', { name: 'Specific members' }));
    await user.click(screen.getByRole('button', { name: /Linh Tran/ }));

    const picked = screen.getByRole('list', { name: 'Picked members' });
    expect(within(picked).getByText('Linh Tran')).toBeInTheDocument();
    // A picked person is no longer offered in the results.
    expect(screen.queryByRole('button', { name: /^Linh Tran$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Minh Le/ }));
    await pickAnyStartTime(user);
    await createAndConfirm(user);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ audience: 'SPECIFIC', audienceUserIds: ['m-linh', 'm-minh'] });
  });

  it('lets a picked member be removed again', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('radio', { name: 'Specific members' }));
    await user.click(screen.getByRole('button', { name: /Linh Tran/ }));
    await user.click(screen.getByRole('button', { name: 'Remove Linh Tran' }));
    expect(screen.queryByRole('list', { name: 'Picked members' })).not.toBeInTheDocument();
  });

  it('refuses specific members with nobody picked and says so', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.click(screen.getByRole('radio', { name: 'Specific members' }));
    await pickAnyStartTime(user);
    await user.click(screen.getByRole('button', { name: 'Create session' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: "Let's go" })).not.toBeInTheDocument();
    expect(screen.getByText('Pick at least one member.')).toBeInTheDocument();
  });

  it('forwards what is typed in the member search', async () => {
    const user = userEvent.setup();
    const { onQueryChange } = renderForm();
    await user.click(screen.getByRole('radio', { name: 'Specific members' }));
    await user.type(screen.getByRole('textbox', { name: 'Search members' }), 'x');
    expect(onQueryChange).toHaveBeenCalledWith('lix');
  });

  it("still shows the form for a caller with no sport profile: the group's sport is the sport", () => {
    renderForm({ sportsByKey: {} });
    expect(screen.queryByText(/add a sport/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create session' })).toBeInTheDocument();
  });
});

afterEach(() => {
  vi.useRealTimers();
});
