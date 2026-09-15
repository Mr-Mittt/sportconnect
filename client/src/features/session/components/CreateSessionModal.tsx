import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { sportIdForKey } from '@/features/feed/sportIdMap';
import type { FriendUser } from '@/features/friends/types';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import { LocationPicker } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { FeeType } from '@/shared/types/session';
import type { ResolvedSportAttributeSchema, SportKey, SportProfile } from '@/shared/types/sport';
import { IconX } from '@tabler/icons-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { AddSportFields, type AddSportProfileSubmission } from '@/shared/components/AddSportFields';
import { SportAttributesFields } from '@/shared/components/SportAttributesFields';
import type { ResumablePrevious } from '@/shared/hooks/useResumableSports';
import type { CreateSessionPayload } from '../types';
import { FeeTypeFields } from './FeeTypeFields';
import { SessionStartTimePicker } from './SessionStartTimePicker';

const NO_SPORTS_PROMPT = "Hey champ, add a sport first — can't host a match out of thin air! 🏆";

const INVITE_SEARCH_MIN_LENGTH = 3;

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Visual-only marker for a required field — screen readers get the real signal from each
 * field's own `aria-required`/error text, not this asterisk (hence `aria-hidden`). */
function RequiredMark() {
  return (
    <span className="text-text-danger" aria-hidden="true">
      {' *'}
    </span>
  );
}

const ALLOWED_DIGITS_ONLY_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Escape',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

/** Shared by every numeric field in this form (Duration, Taken/Open slot) — blocks any keystroke
 * that isn't a digit or a navigation/edit key. A native `type="number"` input still accepts
 * `e`/`+`/`-`/`.` from the keyboard, so `type="number"` alone isn't enough. (The Fixed-amount
 * field's own copy of this guard moved to `FeeTypeFields.tsx` along with the rest of the fee UI —
 * CLIENT-SESSION-21.) */
function handleDigitsOnlyKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.ctrlKey || event.metaKey || event.altKey || ALLOWED_DIGITS_ONLY_KEYS.has(event.key)) {
    return;
  }
  if (!/^[0-9]$/.test(event.key)) {
    event.preventDefault();
  }
}

/** Duration/Taken slot/Open slot — a plain `type="number"` input, paste-guarded: a number input
 * doesn't validate a pasted string at all (pasting "abc" leaves it showing "abc" until blur), so
 * this rejects the whole paste unless the full clipboard text is purely digits. */
function DigitsOnlyInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      type="number"
      onKeyDown={handleDigitsOnlyKeyDown}
      onPaste={(event) => {
        if (!/^[0-9]+$/.test(event.clipboardData.getData('text'))) {
          event.preventDefault();
        }
      }}
    />
  );
}

/** CLIENT-SESSION-4's "Invite your friend" — client-side fullname filter (3+ characters) over the
 * full `useFriends()` list (no new search endpoint), dismissible selected badges above a plain
 * input, and a plain non-portaled inline result list below it. Deliberately never a Popover/
 * DropdownMenu: both silently failed to open when nested inside this modal's own Dialog
 * (CLIENT-SESSION-2 confirmed live — two competing Radix focus traps, see this ticket's design
 * notes), so this reuses the same "plain conditional div" idiom as the cancel-reason reveal in
 * SessionDetailModal instead. */
function InviteFriendField({
  friends,
  isFriendsLoading,
  selected,
  onSelect,
  onRemove,
}: {
  friends: FriendUser[];
  isFriendsLoading: boolean;
  selected: FriendUser[];
  onSelect: (friend: FriendUser) => void;
  onRemove: (friendId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const selectedIds = new Set(selected.map((friend) => friend.id));
  const trimmedQuery = query.trim();
  const results =
    trimmedQuery.length >= INVITE_SEARCH_MIN_LENGTH
      ? friends.filter(
          (friend) =>
            !selectedIds.has(friend.id) &&
            friend.fullName.toLowerCase().includes(trimmedQuery.toLowerCase()),
        )
      : [];

  return (
    <div className="flex flex-col gap-1.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((friend) => (
            <span
              key={friend.id}
              className="flex items-center gap-1 rounded-full bg-surface-1 py-1 pr-1.5 pl-2.5 text-2xs font-medium text-text-primary"
            >
              {friend.fullName}
              <button
                type="button"
                onClick={() => onRemove(friend.id)}
                aria-label={`Remove ${friend.fullName}`}
                className="flex size-4 cursor-pointer items-center justify-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text-primary"
              >
                <IconX className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search friends by name…"
        aria-label="Search friends to invite"
      />
      {trimmedQuery.length > 0 && trimmedQuery.length < INVITE_SEARCH_MIN_LENGTH && (
        <p className="text-2xs text-text-muted">Type at least 3 characters to search.</p>
      )}
      {trimmedQuery.length >= INVITE_SEARCH_MIN_LENGTH &&
        (isFriendsLoading ? (
          <p className="text-2xs text-text-muted">Loading…</p>
        ) : results.length === 0 ? (
          <p className="text-2xs text-text-muted">No friends found.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {results.map((friend) => (
              <button
                key={friend.id}
                type="button"
                onClick={() => {
                  onSelect(friend);
                  setQuery('');
                }}
                className="border-hairline flex cursor-pointer items-center gap-2 rounded-lg border-border p-2 text-left hover:bg-surface-1"
              >
                <Avatar className="size-6 shrink-0">
                  {friend.avatarUrl !== null && <AvatarImage src={friend.avatarUrl} alt="" />}
                  <AvatarFallback className="text-2xs">{initialsFor(friend.fullName)}</AvatarFallback>
                </Avatar>
                <span className="text-2sm text-text-primary">{friend.fullName}</span>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}

/** "Auto approve join request" — unchecked by default (matches the backend's new-session
 * default). Checking it reveals an inline warning immediately, no separate confirm step (user
 * decision) and no nested Dialog — same reasoning as `InviteFriendField` above. */
function AutoApproveField({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 cursor-pointer rounded border-border-strong"
        />
        Auto approve join request
      </label>
      {checked && <p className="text-2xs text-text-muted">Everyone can join without your review.</p>}
    </div>
  );
}

/** CLIENT-SESSION-5's favorites-aware location selector — a real Radix `DropdownMenu`, not the
 * plain "Choose location" button CLIENT-SESSION-1/2 shipped. `modal={false}` is required: a
 * default-modal DropdownMenu nested inside this modal's own Dialog calls the same `hideOthers()`
 * mechanism the Dialog itself uses, aria-hiding the *entire parent Dialog* (confirmed live via a
 * real browser test — the Dialog's `aria-hidden` flipped to `"true"` the instant the menu opened,
 * and `getByRole('dialog')` dropped from 1 match to 0) since the menu's portal is a DOM sibling
 * of the Dialog's, not a descendant. `modal={false}` skips that entirely while every other
 * behavior (Escape/outside-click dismiss, keyboard nav) still works, also verified live. Rows are
 * select-only (user decision) — unfavoriting stays a `LocationPicker`-search-results-only action
 * via the heart icon there. */
function LocationFavoritesDropdown({
  selectedLocation,
  favorites,
  isFavoritesLoading,
  disabled,
  onSelectFavorite,
  onOpenLocationPicker,
}: {
  selectedLocation: Location | null;
  favorites: Location[];
  isFavoritesLoading: boolean;
  disabled: boolean;
  onSelectFavorite: (location: Location) => void;
  onOpenLocationPicker: () => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={disabled}>
          {selectedLocation === null ? 'Choose location' : 'Change location'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {isFavoritesLoading ? (
          <p className="px-2 py-2 text-2xs text-text-muted">Loading…</p>
        ) : favorites.length === 0 ? (
          <p className="px-2 py-2 text-2xs text-text-muted">No favorites yet.</p>
        ) : (
          favorites.map((location) => (
            <DropdownMenuItem key={location.id} onSelect={() => onSelectFavorite(location)}>
              {location.name}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenLocationPicker}>Choose a location…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface CreateSessionModalProps {
  isOpen: boolean;
  onClose: () => void;

  sportsByKey: Record<SportKey, SportProfile>;
  /** The hosting page's active `SportSwitcher` pill, when it has one (`FriendsPage` doesn't) —
   * pre-selects the sport field. `'all'`/`undefined` fall through to the caller's-sole-profile
   * rule below. */
  activeSport?: SportKey | 'all';

  /** The location chosen via the nested LocationPicker — page-owned (useLocationPickerData's
   * onSelect fires at the page level, not from this component), so this modal reads it as a
   * prop rather than owning it as local state. */
  selectedLocation: Location | null;
  /** Called with the form's currently-effective sportId when "Choose a location" is clicked —
   * the page uses it to scope useLocationPickerData's search to the right sport. */
  onOpenLocationPicker: (sportId: number) => void;
  locationPicker: LocationPickerProps;

  /** CLIENT-SESSION-5: fires whenever the form's effective sportId changes (including on mount,
   * for a pre-selected sport) — the page uses this to scope the favorites dropdown's query
   * without lifting the Sport field itself out of this component's own local state. */
  onEffectiveSportChange: (sportId: number | undefined) => void;
  favoriteLocations: Location[];
  isFavoriteLocationsLoading: boolean;
  /** Selecting a favorite straight from the dropdown bypasses the full LocationPicker flow. */
  onSelectLocation: (location: Location) => void;

  /** CLIENT-SESSION-4's "Invite your friend" field filters this full list client-side — the
   * page's `useFriends()` query, gated to only fetch while this modal is open. */
  friends: FriendUser[];
  isFriendsLoading: boolean;

  onSubmit: (payload: CreateSessionPayload) => void;
  isSubmitting: boolean;
  isError: boolean;

  /** CLIENT-SESSION-15: the chosen sport's resolved *session* attribute schema (A17), or `null`
   * when it has none — the "Session detail" section renders `SportAttributesFields` from it, or
   * is hidden entirely. All three are owned by `useCreateSessionModalData` (the query boundary),
   * not this presentational component. */
  sessionAttributeSchema: ResolvedSportAttributeSchema | null;
  sessionAttributeValues: Record<string, unknown>;
  onSessionAttributeChange: (key: string, value: unknown) => void;
  /** CLIENT-SESSION-17 Part B: `#ref` node choice source (the creator's profile attributes) +
   * accumulated "Other…" drafts. Owned by `useCreateSessionModalData`. Optional — a `#ref` node
   * without a choice source simply doesn't render, and a session schema with no `#ref` node never
   * reads these. */
  refChoiceSource?: Record<string, unknown> | null;
  refDraftOptions?: Record<string, unknown[]>;
  onAddRefDraftOption?: (path: string, value: unknown) => void;
  /** SPORT-16: the chosen sport's resolved *profile* schema, for `#ref`→base `layout`
   * inheritance. Owned by `useCreateSessionModalData`; `null` until it settles. */
  refBaseSchema?: ResolvedSportAttributeSchema | null;

  /** CLIENT-SESSION-7 follow-up: when the caller has zero sport profiles (`sportsByKey` empty),
   * this form is replaced by an inline "add a sport first" prompt (`AddSportFields`) instead of
   * closing this Dialog and opening a second one — see that component's own doc comment for why.
   * `availableSports` is the same list the hosting page already computes for its own
   * `AddSportModal` (SportSwitcher's "+" pill) — always the full live catalog in this gated case,
   * since a caller with zero profiles has no sport to exclude. */
  availableSports: SportKey[];
  /** SPORT-10: forwarded to the inline `AddSportFields` so re-adding a soft-deleted sport from
   * this gate offers the read-only reactivate variant, same as the standalone `AddSportModal`. */
  resumableProfiles?: Map<SportKey, ResumablePrevious>;
  onAddSport: (payload: AddSportProfileSubmission) => void;
  isAddingSport: boolean;
  isAddSportError: boolean;
}

/**
 * CLIENT-SESSION-2's redesign of CLIENT-SESSION-1's session-creation form — standalone-only (the
 * group/standalone mode toggle is gone; group-linked session creation has no UI until the group
 * recurrence-config settings surface ships), two collapsible sections ("Session basic
 * information", open by default; "Session detail", collapsed, a "Coming soon" placeholder for a
 * later profile-derived-prefill ticket) styled after the Friends page rail's own section headers
 * (`FriendSection` — small `text-2xs`/`text-text-secondary` trigger label, not a bold heading),
 * sport pre-selected from context, now-required title/duration, and the new
 * `SessionStartTimePicker` (three independent Date/Hour/Minute selects) in place of the old native
 * `datetime-local` input. Four rows on a widened `max-w-2xl` modal (user decision on every split):
 * Sport(2)/Title(8); Location(7, selected-name + button on one line)/Location note(3);
 * "Starts at"(7)/Duration(3); "Taken slot"+"Open slot" as one flex pair(5)/Fee(5, CLIENT-SESSION-3);
 * Description alone, full width. CLIENT-SESSION-5 turns the location field's button into
 * `LocationFavoritesDropdown`, a real Radix `DropdownMenu` — a first attempt at this during
 * CLIENT-SESSION-2 was reverted after appearing to "never open at all" live; the real cause
 * (found and fixed here) was that a default-`modal` DropdownMenu nested inside this modal's own
 * Dialog aria-hides the entire parent Dialog when it opens (both portal to `document.body` as
 * siblings, and DropdownMenu's own `hideOthers()` treats everything outside itself, including the
 * Dialog, as "other") — `modal={false}` on the nested menu fixes this with no loss of Escape/
 * outside-click dismissal, confirmed via a real browser interaction test. See
 * `LocationFavoritesDropdown`'s own doc comment for the full mechanism.
 *
 * CLIENT-SESSION-3's capacity input is split into "Taken slot" (optional) and "Open slot"
 * (required) — the backend's single `capacity` field is their sum, computed at submit time;
 * nothing enforces this split server-side (`capacity` is informational/display-only, never
 * checked by `joinSession`), it's purely how the creator thinks about the number. "Taken slot"
 * means the creator (and whoever's already with them) — it defaults to **1**, not 0, when left
 * blank, since the creator auto-joins the session they're creating and so always occupies at
 * least one slot (user decision: "Taken slot empty, Open slot 5" -> capacity 6, shown as "1/6";
 * "Taken slot 3, Open slot 4" -> capacity 7, shown as "3/7"). A small live summary
 * (`{effectiveTaken}/{capacity}`) renders under the two inputs so the creator can see this before
 * submitting. The real backend now has its own `initialSlot` field (participants already
 * accounted for outside the app, folded into the reported `participantCount` on top of the real
 * JOINED count) — this modal sends `initialSlot = effectiveTakenSlots - 1` (the creator's own
 * auto-joined row already accounts for 1 of "Taken slot"'s count, so it isn't double-added). Fee
 * (`FeeTypeFields`) is a checkbox each for Free/Split cost plus a label+input for Fixed amount
 * (not a 3-way button/select group) — typing into the amount input is what selects `FIXED`;
 * checking Free/Split cost clears it.
 *
 * CLIENT-SESSION-4 adds two more full-width rows after Fee, still inside "Session basic
 * information" (per the ticket's own dependency note — it extends that section, not "Session
 * detail", which stays the unrelated "Coming soon" placeholder): `InviteFriendField` (a
 * client-side fullname filter over the full `useFriends()` list, no new search endpoint, feeding
 * `inviteeIds`) and `AutoApproveField` (unchecked by default, matching the backend's own
 * new-session default; checking it reveals an inline warning with no separate confirm step).
 * Neither uses a Popover/DropdownMenu — both silently failed to open the first time something
 * portaled tried to nest inside this modal's own Dialog (see the location-dropdown and
 * wheel-picker notes above) — so both are plain conditional `<div>`s instead, same idiom as
 * `SessionDetailModal`'s cancel-reason reveal.
 *
 * "Create session" is always clickable (user decision) rather than disabled until every required
 * field (marked with a red `*`) is filled — clicking it while invalid sets `hasAttemptedSubmit`
 * instead of submitting, which turns on a per-field error message for whichever required fields
 * are still empty; each one clears on its own the moment that field becomes valid, since they're
 * recomputed from current state every render rather than tracked as separate "touched" flags.
 * Presentational and controlled per
 * client/CLAUDE.md: the parent owns `useCreateSession()`/`useLocationPickerData()`, passing
 * `onSubmit`/`isSubmitting`/`isError` and the full `locationPicker` prop bundle down.
 *
 * Owns its own transient form field state locally (sport, title, description, locationNote,
 * scheduledStart, durationMinutes, both sections' open/closed state) — same "owns its own
 * transient state, remounted via a changing `key` prop on each open" precedent `CreateGroupModal`
 * uses, rather than a setState-in-effect reset. `selectedLocation` is the one field that can't be
 * local state, since the callback that sets it (`useLocationPickerData`'s `onSelect`) lives at
 * the page level, not in this component.
 *
 * CLIENT-SESSION-21 (SESSION-24): Location and Fee are no longer required — `feeType` now starts
 * `undefined` (no FREE default) instead of always carrying a value, each of the three fee
 * checkboxes/the amount input toggles back to `undefined` when unset (not just switching between
 * options), and neither field blocks `isValid`/submit anymore. Leaving either blank creates the
 * session `PREPARING` instead of `SCHEDULED`; an amber informational banner (`willBePreparing`)
 * says so, distinct from the red required-field errors since it isn't one — pinned in the footer
 * next to "Create session" (user decision, so it stays visible regardless of scroll position),
 * not the scrollable body. `FeeTypeFields` (and its digit-input helpers) moved out to their own
 * file so `SessionPreparingCompletion` can reuse the same fee UI for completing a `PREPARING`
 * session later.
 */
export function CreateSessionModal({
  isOpen,
  onClose,
  sportsByKey,
  activeSport,
  selectedLocation,
  onOpenLocationPicker,
  locationPicker,
  onEffectiveSportChange,
  favoriteLocations,
  isFavoriteLocationsLoading,
  onSelectLocation,
  friends,
  isFriendsLoading,
  onSubmit,
  isSubmitting,
  isError,
  sessionAttributeSchema,
  sessionAttributeValues,
  onSessionAttributeChange,
  refChoiceSource,
  refDraftOptions,
  onAddRefDraftOption,
  refBaseSchema,
  availableSports,
  resumableProfiles,
  onAddSport,
  isAddingSport,
  isAddSportError,
}: CreateSessionModalProps) {
  const sportKeys = Object.keys(sportsByKey) as SportKey[];
  // Prefers the hosting page's active SportSwitcher pill; otherwise falls back to the caller's
  // first sport profile (in sportsByKey's own order) — covers both "exactly one profile" and
  // "2+ profiles with 'All' selected" the same way, rather than leaving the field blank in the
  // latter case. Only stays blank when the caller has no sport profiles at all.
  const initialSport: SportKey | '' =
    activeSport !== undefined && activeSport !== 'all'
      ? activeSport
      : sportKeys.length > 0
        ? sportKeys[0]
        : '';

  const [selectedSport, setSelectedSport] = useState<SportKey | ''>(initialSport);
  // Derived at render time rather than synced via an effect+setState (which would cascade an
  // extra render every time). This Dialog stays mounted while the caller adds their first sport
  // (see AddSportFields' own doc comment) — `sportKeys` transitions from empty to non-empty
  // *without* this component remounting, so `selectedSport`'s useState initializer above never
  // re-runs on its own; falling back to `initialSport` (recomputed fresh from current props every
  // render) here is what actually picks a sport once one becomes available, without ever
  // clobbering a sport the caller already picked themselves (that only happens while
  // `selectedSport` is still '').
  const displaySport: SportKey | '' = selectedSport !== '' ? selectedSport : initialSport;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [takenSlots, setTakenSlots] = useState('');
  const [openSlots, setOpenSlots] = useState('');
  // CLIENT-SESSION-21: no default — undefined means "not picked yet", which SESSION-24 now
  // treats as a valid, intentional choice (the session is created PREPARING instead of
  // SCHEDULED), not just an unfinished form.
  const [feeType, setFeeType] = useState<FeeType | undefined>(undefined);
  const [feeAmountVnd, setFeeAmountVnd] = useState('');
  const [selectedInvitees, setSelectedInvitees] = useState<FriendUser[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);
  const [isBasicInfoOpen, setIsBasicInfoOpen] = useState(true);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  /** Set on the first submit attempt while the form is still invalid — from then on, each
   * required field shows its own error message for as long as it stays unfilled (auto-clears the
   * moment that specific field becomes valid, since these are recomputed from current state on
   * every render, not tracked as separate per-field "touched" flags). */
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const effectiveSportId = displaySport !== '' ? sportIdForKey(displaySport) : undefined;

  // CLIENT-SESSION-15 (scope change, user decision): a Sport change resets the whole form — every
  // field goes back to its default, as if the modal had been reopened for the new sport (the
  // session schema, favourite locations and location search are all sport-scoped, so a half-filled
  // form must not carry from sport A into sport B). Render-phase state adjustment, the same
  // `seededFrom` pattern `useSportProfileSettingsTabData` / `SportFieldsForm` use — no effect, no
  // extra render. Keyed on `displaySport` (the sport *key* string, derived purely from
  // `selectedSport`/`initialSport`), NOT `effectiveSportId` — the latter round-trips through
  // `sportIdForKey`, which returns `undefined` whenever the catalog store is mid-refetch
  // (`openCreateModal` refetches it), so keying on it made the reset thrash and wipe just-typed
  // fields mid-flow. `SessionStartTimePicker` is re-keyed on the same value so its on-open
  // "default to now + 1h" pre-fill actually re-runs for the new sport. The hook-owned pieces
  // (chosen location, attributes draft) reset in parallel via `onEffectiveSportChange` below.
  const [seededForSport, setSeededForSport] = useState(displaySport);
  if (displaySport !== seededForSport) {
    setSeededForSport(displaySport);
    setTitle('');
    setDescription('');
    setLocationNote('');
    setScheduledStart('');
    setDurationMinutes('');
    setTakenSlots('');
    setOpenSlots('');
    setFeeType(undefined);
    setFeeAmountVnd('');
    setSelectedInvitees([]);
    setAutoApprove(false);
    setHasAttemptedSubmit(false);
    setIsBasicInfoOpen(true);
    setIsDetailOpen(false);
  }

  // CLIENT-SESSION-5: report the effective sportId up on every change (including the initial
  // pre-selected value) so the parent can scope the favorites dropdown's query — this field
  // itself stays local state, only its current value is mirrored upward.
  useEffect(() => {
    onEffectiveSportChange(effectiveSportId);
    // onEffectiveSportChange deliberately excluded below: it's a stable page-level callback
    // (setState), not something that should retrigger this effect if the parent happens to pass
    // a new function identity across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSportId]);

  const isFeeAmountRequired = feeType === 'FIXED';

  // "Taken slot" means the creator (and whoever's already with them) — it defaults to 1, not 0,
  // when left blank, since the creator always auto-joins the session they're creating.
  const effectiveTakenSlots = takenSlots === '' ? 1 : Number(takenSlots);
  const effectiveOpenSlots = openSlots === '' ? 0 : Number(openSlots);
  const capacity = effectiveTakenSlots + effectiveOpenSlots;
  // The backend's initialSlot is folded onto the real (auto-joined creator) participant row, so
  // it's "Taken slot" minus the creator's own already-real row — 0 when Taken slot is blank.
  const initialSlot = effectiveTakenSlots - 1;

  // CLIENT-SESSION-21 / SESSION-24: Location and Fee are no longer required to submit — leaving
  // either blank is now a valid, intentional way to create a PREPARING session that gets
  // completed later via SessionPreparingCompletion. `isValid` (and the red-asterisk required
  // fields it still gates) covers everything that's genuinely still mandatory.
  const isValid =
    effectiveSportId !== undefined &&
    scheduledStart !== '' &&
    title.trim() !== '' &&
    durationMinutes !== '' &&
    openSlots !== '';

  // Drives the "will be created as Preparing" warning below — SESSION-24's own condition for
  // landing in PREPARING instead of SCHEDULED.
  const willBePreparing = selectedLocation === null || feeType === undefined;

  const submit = () => {
    if (!isValid || effectiveSportId === undefined) {
      setHasAttemptedSubmit(true);
      return;
    }
    onSubmit({
      sportId: effectiveSportId,
      title: title.trim(),
      description: description.trim() || undefined,
      locationId: selectedLocation?.id,
      locationNote: locationNote.trim() || undefined,
      scheduledStart: `${scheduledStart}:00`,
      durationMinutes: Number(durationMinutes),
      // The backend's `capacity` is a single total — "Taken slot"/"Open slot" is a UI-only split
      // for creators who think in those terms.
      capacity,
      feeType,
      feeAmountVnd: isFeeAmountRequired ? Number(feeAmountVnd) : undefined,
      initialSlot,
      autoApprove,
      inviteeIds: selectedInvitees.length > 0 ? selectedInvitees.map((friend) => friend.id) : undefined,
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        {/* The gated "add a sport first" view (see sportKeys.length === 0 below) is a compact
            3-field form — sized like the standalone AddSportModal (max-w-md, shrink-to-fit)
            instead of this form's own wide/fixed-height treatment, so its "Add sport" button
            sits right at the bottom of the modal instead of floating above dead space. */}
        <DialogContent
          fixedHeight={sportKeys.length > 0}
          className={sportKeys.length > 0 ? 'max-w-2xl' : 'max-w-md'}
        >
          <DialogHeader title="Create your session" className="border-hairline-b border-border px-4 py-3" />
          {sportKeys.length === 0 ? (
            <AddSportFields
              availableSports={availableSports}
              resumableProfiles={resumableProfiles}
              onSubmit={onAddSport}
              isSubmitting={isAddingSport}
              isError={isAddSportError}
              promptMessage={NO_SPORTS_PROMPT}
            />
          ) : (
            <>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 py-3.5">
            <Collapsible open={isBasicInfoOpen} onOpenChange={setIsBasicInfoOpen}>
              <CollapsibleTrigger className="border-hairline-b justify-center gap-1.5 border-border px-1.75 py-1.5">
                <span className="text-2xs font-medium text-text-secondary">Session basic information</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3.5 pt-3">
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-10">
                  <div className="sm:col-span-2">
                    <Label htmlFor="create-session-sport">
                      Sport
                      <RequiredMark />
                    </Label>
                    <Select
                      id="create-session-sport"
                      aria-required="true"
                      value={displaySport}
                      onChange={(event) => setSelectedSport(event.target.value as SportKey)}
                    >
                      <option value="" disabled>
                        Select a sport
                      </option>
                      {Object.values(sportsByKey).map((sport) => (
                        <option key={sport.key} value={sport.key}>
                          {sport.label}
                        </option>
                      ))}
                    </Select>
                    {hasAttemptedSubmit && effectiveSportId === undefined && (
                      <p className="mt-1 text-2xs text-text-danger">Sport is required.</p>
                    )}
                  </div>

                  <div className="sm:col-span-8">
                    <Label htmlFor="create-session-title">
                      Session title
                      <RequiredMark />
                    </Label>
                    <Input
                      id="create-session-title"
                      aria-required="true"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="e.g. Sunday pickup run"
                    />
                    {hasAttemptedSubmit && title.trim() === '' && (
                      <p className="mt-1 text-2xs text-text-danger">Title is required.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-10">
                  <div className="sm:col-span-7">
                    {/* Not a <Label> — it doesn't associate with a form control, it introduces the
                        display/button pair below (same reasoning as jsx-a11y flagging an
                        unassociated <label>). */}
                    <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
                      Location (optional)
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedLocation !== null && (
                        <span className="min-w-0 flex-1 truncate text-2sm text-text-primary">
                          {selectedLocation.name}
                        </span>
                      )}
                      <LocationFavoritesDropdown
                        selectedLocation={selectedLocation}
                        favorites={favoriteLocations}
                        isFavoritesLoading={isFavoriteLocationsLoading}
                        disabled={effectiveSportId === undefined}
                        onSelectFavorite={onSelectLocation}
                        onOpenLocationPicker={() =>
                          effectiveSportId !== undefined && onOpenLocationPicker(effectiveSportId)
                        }
                      />
                    </div>
                    {effectiveSportId === undefined && (
                      <p className="mt-1 text-2xs text-text-muted">Pick a sport first.</p>
                    )}
                  </div>

                  <div className="sm:col-span-3">
                    <Label htmlFor="create-session-location-note">Location note (optional)</Label>
                    <Input
                      id="create-session-location-note"
                      value={locationNote}
                      onChange={(event) => setLocationNote(event.target.value)}
                      placeholder="e.g. Court 3"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-10">
                  <div className="sm:col-span-7">
                    {/* Not a <Label> — three independent selects (Date/Hour/Minute), each with
                        its own aria-label, sit under this one heading; same reasoning as
                        Location's span above. */}
                    <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
                      Starts at
                      <RequiredMark />
                    </span>
                    {/* Re-keyed on the sport so a Sport change (which resets `scheduledStart` to
                        `''` above) re-mounts this and re-runs its on-open "default to now + 1h"
                        pre-fill — otherwise the reset would leave "Starts at" permanently empty. */}
                    <SessionStartTimePicker
                      key={displaySport}
                      value={scheduledStart}
                      onChange={setScheduledStart}
                    />
                    {hasAttemptedSubmit && scheduledStart === '' && (
                      <p className="mt-1 text-2xs text-text-danger">Start time is required.</p>
                    )}
                  </div>

                  <div className="sm:col-span-3">
                    <Label htmlFor="create-session-duration">
                      Duration in minutes
                      <RequiredMark />
                    </Label>
                    <DigitsOnlyInput
                      id="create-session-duration"
                      aria-required="true"
                      min={0}
                      value={durationMinutes}
                      onChange={(event) => setDurationMinutes(event.target.value)}
                      placeholder="e.g. 90"
                    />
                    {hasAttemptedSubmit && durationMinutes === '' && (
                      <p className="mt-1 text-2xs text-text-danger">Duration is required.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-10">
                  <div className="sm:col-span-5">
                    <div className="flex gap-3.5">
                      <div className="flex-1">
                        <Label htmlFor="create-session-taken-slots">Taken slot</Label>
                        <DigitsOnlyInput
                          id="create-session-taken-slots"
                          min={0}
                          value={takenSlots}
                          onChange={(event) => setTakenSlots(event.target.value)}
                          placeholder="e.g. 10"
                        />
                      </div>

                      <div className="flex-1">
                        <Label htmlFor="create-session-open-slots">
                          Open slot
                          <RequiredMark />
                        </Label>
                        <DigitsOnlyInput
                          id="create-session-open-slots"
                          aria-required="true"
                          min={0}
                          value={openSlots}
                          onChange={(event) => setOpenSlots(event.target.value)}
                          placeholder="e.g. 10"
                        />
                        {hasAttemptedSubmit && openSlots === '' && (
                          <p className="mt-1 text-2xs text-text-danger">Open slot is required.</p>
                        )}
                      </div>
                    </div>
                    <p className="mt-1.5 text-2xs text-text-muted">
                      {effectiveTakenSlots}/{capacity} slots
                    </p>
                  </div>

                  <div className="sm:col-span-5">
                    <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
                      Fee (optional)
                    </span>
                    <FeeTypeFields
                      value={feeType}
                      onChange={setFeeType}
                      amount={feeAmountVnd}
                      onAmountChange={setFeeAmountVnd}
                    />
                  </div>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
                    Invite your friend (optional)
                  </span>
                  <InviteFriendField
                    friends={friends}
                    isFriendsLoading={isFriendsLoading}
                    selected={selectedInvitees}
                    onSelect={(friend) => setSelectedInvitees((prev) => [...prev, friend])}
                    onRemove={(friendId) =>
                      setSelectedInvitees((prev) => prev.filter((friend) => friend.id !== friendId))
                    }
                  />
                </div>

                <AutoApproveField checked={autoApprove} onChange={setAutoApprove} />

                <div>
                  <Label htmlFor="create-session-description">Description (optional)</Label>
                  <textarea
                    id="create-session-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    placeholder="What's this session about?"
                    className="w-full resize-none rounded-lg border-hairline border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:border-border-accent focus-visible:ring-3 focus-visible:ring-bg-accent"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* CLIENT-SESSION-15: sport-specific session attributes (A17 schema). CLIENT-SESSION-17
                Part B: `#ref` nodes render as single-/multi-select sourced from the creator's
                profile (`refChoiceSource`). Hidden entirely when the chosen sport has no session
                schema. */}
            {sessionAttributeSchema !== null && (
              <Collapsible open={isDetailOpen} onOpenChange={setIsDetailOpen} className="border-hairline-t border-border pt-3">
                <CollapsibleTrigger className="border-hairline-b justify-center gap-1.5 border-border px-1.75 py-1.5">
                  <span className="text-2xs font-medium text-text-secondary">Session detail</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <SportAttributesFields
                    schema={sessionAttributeSchema}
                    values={sessionAttributeValues}
                    onChange={onSessionAttributeChange}
                    refChoiceSource={refChoiceSource}
                    refDraftOptions={refDraftOptions}
                    onAddRefDraftOption={onAddRefDraftOption}
                    refBaseSchema={refBaseSchema}
                  />
                </CollapsibleContent>
              </Collapsible>
            )}

            {isError && (
              <p role="alert" className="text-2sm text-text-danger">
                Couldn't create the session. Try again.
              </p>
            )}
          </div>
          <div className="border-hairline-t flex items-center justify-end gap-3 border-border px-4 py-3">
            {/* CLIENT-SESSION-21 / SESSION-24: informational, not a validation error — leaving
                Location and/or Fee blank is a valid choice, so this uses the app's reserved
                warning tokens (amber), not the red danger-text style the required-field errors
                use. Pinned in the footer (not the scrollable body) so it stays visible regardless
                of scroll position, same reasoning as the submit button itself. */}
            {willBePreparing && (
              <p className="flex-1 text-2xs text-amber-800">
                This session will be created as <strong>Preparing</strong> — add a location and
                fee to make it Scheduled. You can complete it anytime before it starts, or it will
                be auto-cancelled.
              </p>
            )}
            <Button
              variant="primary"
              onClick={submit}
              disabled={isSubmitting}
              className={cn('shrink-0 cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
            >
              {isSubmitting ? 'Creating…' : 'Create session'}
            </Button>
          </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <LocationPicker {...locationPicker} />
    </>
  );
}
