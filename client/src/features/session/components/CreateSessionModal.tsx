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
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { AddSportFields, type AddSportProfileSubmission } from '@/shared/components/AddSportFields';
import { RequiredMark } from '@/shared/components/RequiredMark';
import { SportAttributesFields } from '@/shared/components/SportAttributesFields';
import { hasEditedAttributeValues } from '@/shared/components/attributeFields/defaults';
import type { ResumablePrevious } from '@/shared/hooks/useResumableSports';
import { toOffsetAwareIso } from '@/shared/lib/scheduledStart';
import { formatFeeDisplay } from '@/shared/lib/feeType';
import { formatGameMood, GAME_MOOD_DEFAULT } from '@/shared/lib/gameMood';
import { genderSplitText } from '@/shared/lib/sessionSlots';
import { formatStartTime } from '@/shared/lib/startTime';
import { buildAttributeSummary } from '../sessionAttributeSummary';
import { missingForScheduling } from '../sessionReadiness';
import { useSessionTimeFields } from '../sessionFormTime';
import type { CreateSessionPayload } from '../types';
import { useSessionWhoFields } from '../useSessionWhoFields';
import { useAuthStore } from '@/app/authStore';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { AutoApproveConfirmDialog, LeaveWithoutSavingDialog, SessionReadinessDialog } from './SessionConfirmDialogs';
import { SectionSummary, SessionFormSection, type SectionSummaryItem } from './SessionFormSection';
import { CostFields, OverviewFields, WhenFields, WhereFields, WhoFields } from './SessionSectionFields';

const INVITE_SEARCH_MIN_LENGTH = 3;

type SectionKey = 'overview' | 'when' | 'where' | 'who' | 'cost' | 'detail';
const ALL_SECTIONS_OPEN: Record<SectionKey, boolean> = {
  overview: true,
  when: true,
  where: true,
  who: true,
  cost: true,
  detail: true,
};

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
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
  i18nOverridePrefix,
}: {
  friends: FriendUser[];
  isFriendsLoading: boolean;
  selected: FriendUser[];
  onSelect: (friend: FriendUser) => void;
  onRemove: (friendId: string) => void;
  i18nOverridePrefix?: string;
}) {
  const t = useOverridableText('session', i18nOverridePrefix);
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
                aria-label={t('create.invite.remove', { name: friend.fullName })}
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
        placeholder={t('create.invite.placeholder')}
        aria-label={t('create.invite.searchLabel')}
      />
      {trimmedQuery.length > 0 && trimmedQuery.length < INVITE_SEARCH_MIN_LENGTH && (
        <p className="text-2xs text-text-muted">{t('create.invite.minChars', { min: INVITE_SEARCH_MIN_LENGTH })}</p>
      )}
      {trimmedQuery.length >= INVITE_SEARCH_MIN_LENGTH &&
        (isFriendsLoading ? (
          <p className="text-2xs text-text-muted">{t('common.loading')}</p>
        ) : results.length === 0 ? (
          <p className="text-2xs text-text-muted">{t('create.invite.noResults')}</p>
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

interface CreateSessionModalProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
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
  /** CLIENT-ERR-7: specific copy for the inline error line when the server sent a code the client has copy for; falls back to the generic `create.error`. */
  errorText?: string;

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
  /** CLIENT-ERR-4: code-specific add-sport message; unset keeps the static line. */
  addSportErrorText?: string;
}

/**
 * The create-session form (CLIENT-SESSION-1 .. 34). CLIENT-SESSION-34 turns it into five collapsible
 * sections, all open by default, one scroll and one submit button (no wizard): **Overview** (sport,
 * title), **When** (starts at, duration, ends at), **Where** (location with favourites, note),
 * **Who** (taken and open slot, Anyone / By gender with the male and female slots, game mood, auto
 * approve, invite friends) and **Cost** (fee, fee note), then the sport's **Session detail**
 * attributes when it has any. Each header shows an amber "Missing: ..." chip for what is still needed
 * to schedule (location, fee, duration) — information, not an error; red asterisks stay on what is
 * needed to create (sport, start time, open slot). Title and duration are optional.
 *
 * Linked time fields: the start, the duration and the end follow each other (`useSessionTimeFields`,
 * minute-precise pickers). The Who draft lives in `useSessionWhoFields`. Ticking "Auto approve" opens
 * `AutoApproveConfirmDialog` instead of checking the box. "Create session" validates, then opens the
 * "Are you ready?" popup (`SessionReadinessDialog`) — the incomplete variant lists what is missing and
 * creates a Preparing session on confirm; the complete variant warns that a Scheduled session can't be
 * edited afterwards. Both popups and the nested `LocationPicker` are siblings of the form's `Dialog`.
 *
 * Presentational and controlled per client/CLAUDE.md: the parent owns `useCreateSession()`,
 * `useLocationPickerData()` and the attribute draft, passing `onSubmit`/`isSubmitting`/`isError` and
 * the `locationPicker` bundle down. The form's own fields are local state, remounted by a changing
 * `key` on each open, and reset as a whole when the sport changes (the session schema, favourites and
 * location search are sport-scoped — `seededForSport` below, same render-phase pattern as before).
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
  errorText,
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
  addSportErrorText,
  i18nOverridePrefix,
}: CreateSessionModalProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const sportKeys = Object.keys(sportsByKey) as SportKey[];
  // Prefers the hosting page's active SportSwitcher pill; otherwise falls back to the caller's
  // first sport profile (in sportsByKey's own order). Only stays blank when the caller has none.
  const initialSport: SportKey | '' =
    activeSport !== undefined && activeSport !== 'all'
      ? activeSport
      : sportKeys.length > 0
        ? sportKeys[0]
        : '';

  const [selectedSport, setSelectedSport] = useState<SportKey | ''>(initialSport);
  // Derived at render time: this Dialog stays mounted while the caller adds their first sport, so
  // `selectedSport`'s initializer never re-runs; falling back to `initialSport` picks one up without
  // ever clobbering a sport the caller already picked.
  const displaySport: SportKey | '' = selectedSport !== '' ? selectedSport : initialSport;
  // SESSION-49: the title is required and starts as "<first name>'s session" (en) / "Trận đấu của <first name>" (vi).
  // The account's first name is assumed present (making it required is auth A38 / client ACCOUNT-8).
  const firstName = useAuthStore((state) => state.user?.firstName ?? '');
  const defaultTitle = t('create.titleField.default', { firstName });
  const [title, setTitle] = useState(defaultTitle);
  const [locationNote, setLocationNote] = useState('');
  const time = useSessionTimeFields({ start: '', duration: '' });
  const who = useSessionWhoFields({
    taken: '',
    open: '',
    maleSlots: null,
    femaleSlots: null,
    gameMood: GAME_MOOD_DEFAULT,
    autoApprove: false,
  });
  // CLIENT-SESSION-21: no default — undefined means "not picked yet", a valid choice (PREPARING).
  const [feeType, setFeeType] = useState<FeeType | undefined>(undefined);
  const [feeAmountVnd, setFeeAmountVnd] = useState('');
  const [feeNote, setFeeNote] = useState('');
  const [selectedInvitees, setSelectedInvitees] = useState<FriendUser[]>([]);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(ALL_SECTIONS_OPEN);
  const [isAutoApproveConfirmOpen, setIsAutoApproveConfirmOpen] = useState(false);
  const [isReadinessOpen, setIsReadinessOpen] = useState(false);
  const [isLeaveOpen, setIsLeaveOpen] = useState(false);
  /** Set on the first submit attempt while the form is still invalid — from then on each required
   * field shows its own message for as long as it stays unfilled (recomputed every render). */
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const effectiveSportId = displaySport !== '' ? sportIdForKey(displaySport) : undefined;

  // CLIENT-SESSION-15 (scope change): a Sport change resets the whole form, as if reopened for the new
  // sport. Keyed on the sport *key* string, not `effectiveSportId` (which flickers to `undefined`
  // while the catalog store refetches). The start picker is re-keyed on the same value so its "now +
  // 1h" default re-runs. The hook-owned pieces (chosen location, attributes draft) reset in parallel
  // via `onEffectiveSportChange` below.
  const [seededForSport, setSeededForSport] = useState(displaySport);
  if (displaySport !== seededForSport) {
    setSeededForSport(displaySport);
    setTitle(defaultTitle);
    setLocationNote('');
    time.setDuration('');
    time.setStart('');
    who.setTaken('');
    who.setOpen('');
    who.setWhoCanJoin('ANYONE');
    who.setGameMood(GAME_MOOD_DEFAULT);
    who.setAutoApprove(false);
    setFeeType(undefined);
    setFeeAmountVnd('');
    setFeeNote('');
    setSelectedInvitees([]);
    setHasAttemptedSubmit(false);
    setOpenSections(ALL_SECTIONS_OPEN);
  }

  // CLIENT-SESSION-5: report the effective sportId up so the parent can scope the favourites query.
  useEffect(() => {
    onEffectiveSportChange(effectiveSportId);
    // onEffectiveSportChange deliberately excluded: a stable page-level callback, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSportId]);

  const isFeeAmountRequired = feeType === 'FIXED';

  // Anything entered that "Create session" has not sent yet. The start time is not counted: it is
  // pre-filled (now + 1h) and re-filled for a new sport, so it says nothing about the user's edits.
  const isDirty =
    title.trim() !== defaultTitle ||
    locationNote.trim() !== '' ||
    time.duration !== '' ||
    time.end !== '' ||
    who.taken !== '' ||
    who.open !== '' ||
    who.whoCanJoin !== 'ANYONE' ||
    who.gameMood !== GAME_MOOD_DEFAULT ||
    who.autoApprove ||
    feeType !== undefined ||
    feeAmountVnd !== '' ||
    feeNote.trim() !== '' ||
    selectedInvitees.length > 0 ||
    selectedLocation !== null ||
    hasEditedAttributeValues(sessionAttributeSchema, sessionAttributeValues);

  // Required to create: sport, start time and open slot (server rule unchanged); the end must be
  // after the start and the gender seats must fit in the open ones.
  const isValid =
    effectiveSportId !== undefined &&
    title.trim() !== '' &&
    time.start !== '' &&
    who.open !== '' &&
    !time.isEndInvalid &&
    !who.genderOverOpen;

  // What is still needed to schedule — drives the amber chips and the readiness popup's list.
  const missing = missingForScheduling({
    hasLocation: selectedLocation !== null,
    feeType,
    hasFeeAmount: feeAmountVnd !== '',
    hasDuration: time.duration !== '',
  });

  // The collapsed sections' `field: value` rows — always shown, "..." where nothing is filled in yet.
  const yes = t('detail.summary.yes');
  const split = genderSplitText(who.maleSlots > 0 ? who.maleSlots : null, who.femaleSlots > 0 ? who.femaleSlots : null, {
    male: t('detail.summary.male'),
    female: t('detail.summary.female'),
  });
  const summaries: Record<SectionKey, SectionSummaryItem[]> = {
    overview: [
      { label: t('detail.summary.sport'), value: displaySport !== '' ? sportsByKey[displaySport]?.label : null },
      { label: t('detail.summary.title'), value: title.trim() },
    ],
    when: [
      { label: t('detail.summary.starts'), value: time.start !== '' ? formatStartTime(toOffsetAwareIso(time.start)) : null },
      {
        label: t('detail.summary.duration'),
        value: time.duration !== '' ? t('detail.summary.minutes', { count: Number(time.duration) }) : null,
      },
      { label: t('detail.summary.ends'), value: time.end !== '' ? formatStartTime(toOffsetAwareIso(time.end)) : null },
    ],
    where: [
      { label: t('detail.summary.location'), value: selectedLocation?.name },
      { label: t('detail.summary.note'), value: locationNote.trim() },
    ],
    who: [
      { label: t('detail.summary.taken'), value: String(who.effectiveTaken) },
      {
        label: t('detail.summary.open'),
        value: who.open === '' ? null : `${who.openCount} (${split === '' ? t('detail.summary.anyone') : split})`,
      },
      { label: t('detail.summary.mood'), value: formatGameMood(who.gameMood) },
      { label: t('detail.summary.autoApprove'), value: who.autoApprove ? yes : t('detail.summary.no') },
    ],
    cost: [
      {
        label: t('detail.summary.fee'),
        value:
          feeType === undefined
            ? null
            : formatFeeDisplay(feeType, feeType === 'FIXED' && feeAmountVnd !== '' ? Number(feeAmountVnd) : null),
      },
      { label: t('detail.summary.feeNote'), value: feeNote.trim() },
    ],
    detail:
      sessionAttributeSchema !== null
        ? buildAttributeSummary(sessionAttributeSchema, sessionAttributeValues).map((entry) => ({
            label: entry.label,
            value: entry.text,
          }))
        : [],
  };

  const setSection = (key: SectionKey, open: boolean) =>
    setOpenSections((current) => ({ ...current, [key]: open }));

  /** The id of the first field that blocks Create, in form order — the one to scroll to and focus. */
  const firstInvalidFieldId = (): string | undefined => {
    if (effectiveSportId === undefined) return 'create-session-sport';
    if (title.trim() === '') return 'create-session-title';
    if (who.open === '') return 'create-session-open-slots';
    if (who.genderOverOpen) {
      return who.maleSlots >= who.femaleSlots ? 'create-session-male-slots' : 'create-session-female-slots';
    }
    return undefined;
  };

  // Set by a refused Create; the effect below runs once the sections are open (the target may sit in a
  // section the user collapsed) and the error lines have rendered. `n` makes a repeated click re-fire.
  const [focusRequest, setFocusRequest] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (focusRequest === null) return;
    const element = document.getElementById(focusRequest.id);
    if (element !== null) {
      if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element.focus({ preventScroll: true });
    }
  }, [focusRequest]);

  const requestSubmit = () => {
    if (!isValid) {
      setHasAttemptedSubmit(true);
      // Reveal a section that holds an error even if the user collapsed it.
      setOpenSections(ALL_SECTIONS_OPEN);
      // …then take the user to the first field that blocks Create (usually the open slot) and focus it.
      const id = firstInvalidFieldId();
      if (id !== undefined) setFocusRequest((current) => ({ id, n: (current?.n ?? 0) + 1 }));
      return;
    }
    setIsReadinessOpen(true);
  };

  const submit = () => {
    setIsReadinessOpen(false);
    if (effectiveSportId === undefined) return;
    onSubmit({
      sportId: effectiveSportId,
      title: title.trim(),
      locationId: selectedLocation?.id,
      locationNote: locationNote.trim() || undefined,
      // CLIENT-SESSION-24: offset-aware — backend SESSION-33 requires an Instant.
      scheduledStart: toOffsetAwareIso(time.start),
      durationMinutes: time.duration !== '' ? Number(time.duration) : undefined,
      // The backend's `capacity` is a single total — "Taken slot"/"Open slot" is a UI-only split.
      capacity: who.capacity,
      feeType,
      feeAmountVnd: isFeeAmountRequired ? Number(feeAmountVnd) : undefined,
      feeNote: feeNote.trim() || undefined,
      initialSlot: who.initialSlot,
      autoApprove: who.autoApprove,
      maleSlots: who.maleSlots > 0 ? who.maleSlots : undefined,
      femaleSlots: who.femaleSlots > 0 ? who.femaleSlots : undefined,
      gameMood: who.gameMood,
      inviteeIds: selectedInvitees.length > 0 ? selectedInvitees.map((friend) => friend.id) : undefined,
    });
  };

  return (
    <>
      {/* Closing (click outside, Escape, the X) with unsent entries asks first. A successful create closes
          through the page's own handler, so it never asks. */}
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (open) return;
          if (isDirty) setIsLeaveOpen(true);
          else onClose();
        }}
      >
        {/* The gated "add a sport first" view (see sportKeys.length === 0 below) is a compact
            3-field form — sized like the standalone AddSportModal (max-w-md, shrink-to-fit). */}
        <DialogContent
          fixedHeight={sportKeys.length > 0}
          // CLIENT-SESSION-34: the sectioned form is long, so it is taller than the 60vh default (and, on a
          // page that anchors modals below its pill row, still capped by the space left below the anchor).
          fixedHeightVh={70}
          className={sportKeys.length > 0 ? 'max-w-2xl' : 'max-w-md'}
        >
          <DialogHeader title={t('create.title')} className="border-hairline-b border-border px-4 py-3" />
          {sportKeys.length === 0 ? (
            <AddSportFields
              availableSports={availableSports}
              resumableProfiles={resumableProfiles}
              onSubmit={onAddSport}
              isSubmitting={isAddingSport}
              isError={isAddSportError}
              errorText={addSportErrorText}
              promptMessage={t('create.noSportsPrompt')}
            />
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-4 py-3.5">
                <SessionFormSection
                  title={t('form.sections.overview')}
                  open={openSections.overview}
                  onOpenChange={(open) => setSection('overview', open)}
                  summary={<SectionSummary items={summaries.overview} />}
                  scrollIntoViewOnOpen
                >
                  <OverviewFields
                    idPrefix="create-session"
                    i18nOverridePrefix={i18nOverridePrefix}
                    title={title}
                    onTitleChange={setTitle}
                    showTitleError={hasAttemptedSubmit && title.trim() === ''}
                    sportField={
                      <>
                        <Label htmlFor="create-session-sport">
                          {t('create.sport.label')}
                          <RequiredMark />
                        </Label>
                        <Select
                          id="create-session-sport"
                          aria-required="true"
                          value={displaySport}
                          onChange={(event) => setSelectedSport(event.target.value as SportKey)}
                        >
                          <option value="" disabled>
                            {t('create.sport.placeholder')}
                          </option>
                          {Object.values(sportsByKey).map((sport) => (
                            <option key={sport.key} value={sport.key}>
                              {sport.label}
                            </option>
                          ))}
                        </Select>
                        {hasAttemptedSubmit && effectiveSportId === undefined && (
                          <p className="mt-1 text-2xs text-text-danger">{t('create.validation.sport')}</p>
                        )}
                      </>
                    }
                  />
                </SessionFormSection>

                <SessionFormSection
                  title={t('form.sections.when')}
                  open={openSections.when}
                  onOpenChange={(open) => setSection('when', open)}
                  summary={<SectionSummary items={summaries.when} />}
                  scrollIntoViewOnOpen
                  missing={missing.filter((field) => field === 'duration')}
                >
                  <WhenFields
                    idPrefix="create-session"
                    i18nOverridePrefix={i18nOverridePrefix}
                    time={time}
                    startPickerKey={displaySport}
                    showStartError={hasAttemptedSubmit}
                  />
                </SessionFormSection>

                <SessionFormSection
                  title={t('form.sections.where')}
                  open={openSections.where}
                  onOpenChange={(open) => setSection('where', open)}
                  summary={<SectionSummary items={summaries.where} />}
                  scrollIntoViewOnOpen
                  missing={missing.filter((field) => field === 'location')}
                >
                  <WhereFields
                    idPrefix="create-session"
                    i18nOverridePrefix={i18nOverridePrefix}
                    location={selectedLocation}
                    favorites={favoriteLocations}
                    isFavoritesLoading={isFavoriteLocationsLoading}
                    pickerDisabled={effectiveSportId === undefined}
                    pickSportFirst={effectiveSportId === undefined}
                    onSelectFavorite={onSelectLocation}
                    onOpenPicker={() => effectiveSportId !== undefined && onOpenLocationPicker(effectiveSportId)}
                    note={locationNote}
                    onNoteChange={setLocationNote}
                  />
                </SessionFormSection>

                <SessionFormSection
                  title={t('form.sections.who')}
                  open={openSections.who}
                  missing={who.open === '' ? ['openSlot'] : []}
                  onOpenChange={(open) => setSection('who', open)}
                  summary={<SectionSummary items={summaries.who} />}
                  scrollIntoViewOnOpen
                >
                  <WhoFields
                    idPrefix="create-session"
                    i18nOverridePrefix={i18nOverridePrefix}
                    taken={who.taken}
                    onTakenChange={who.setTaken}
                    open={who.open}
                    onOpenChange={who.setOpen}
                    openRequired
                    showOpenError={hasAttemptedSubmit}
                    whoCanJoin={who.whoCanJoin}
                    onWhoCanJoinChange={who.setWhoCanJoin}
                    maleChecked={who.maleChecked}
                    onMaleCheckedChange={who.setMaleChecked}
                    male={who.male}
                    onMaleChange={who.setMale}
                    femaleChecked={who.femaleChecked}
                    onFemaleCheckedChange={who.setFemaleChecked}
                    female={who.female}
                    onFemaleChange={who.setFemale}
                    genderOverOpen={who.genderOverOpen}
                    gameMood={who.gameMood}
                    onGameMoodChange={who.setGameMood}
                    autoApprove={who.autoApprove}
                    // Ticking asks for confirmation first; unticking just unticks.
                    onAutoApproveChange={(next) =>
                      next ? setIsAutoApproveConfirmOpen(true) : who.setAutoApprove(false)
                    }
                    slotsSummary={t('create.slotsSummary', { taken: who.effectiveTaken, capacity: who.capacity })}
                    extra={
                      <div>
                        <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
                          {t('create.invite.label')}
                        </span>
                        <InviteFriendField
                          i18nOverridePrefix={i18nOverridePrefix}
                          friends={friends}
                          isFriendsLoading={isFriendsLoading}
                          selected={selectedInvitees}
                          onSelect={(friend) => setSelectedInvitees((prev) => [...prev, friend])}
                          onRemove={(friendId) =>
                            setSelectedInvitees((prev) => prev.filter((friend) => friend.id !== friendId))
                          }
                        />
                      </div>
                    }
                  />
                </SessionFormSection>

                <SessionFormSection
                  title={t('form.sections.cost')}
                  open={openSections.cost}
                  onOpenChange={(open) => setSection('cost', open)}
                  summary={<SectionSummary items={summaries.cost} />}
                  scrollIntoViewOnOpen
                  missing={missing.filter((field) => field === 'fee')}
                >
                  <CostFields
                    idPrefix="create-session"
                    i18nOverridePrefix={i18nOverridePrefix}
                    feeType={feeType}
                    onFeeTypeChange={setFeeType}
                    feeAmount={feeAmountVnd}
                    onFeeAmountChange={setFeeAmountVnd}
                    feeNote={feeNote}
                    onFeeNoteChange={setFeeNote}
                  />
                </SessionFormSection>

                {/* CLIENT-SESSION-15: sport-specific session attributes (A17 schema). CLIENT-SESSION-17
                    Part B: `#ref` nodes render as single-/multi-select sourced from the creator's
                    profile (`refChoiceSource`). Hidden entirely when the chosen sport has no session
                    schema. */}
                {sessionAttributeSchema !== null && (
                  <SessionFormSection
                    title={t('create.detail')}
                    open={openSections.detail}
                    onOpenChange={(open) => setSection('detail', open)}
                  summary={<SectionSummary items={summaries.detail} />}
                  scrollIntoViewOnOpen
                  >
                    <SportAttributesFields
                      schema={sessionAttributeSchema}
                      values={sessionAttributeValues}
                      onChange={onSessionAttributeChange}
                      refChoiceSource={refChoiceSource}
                      refDraftOptions={refDraftOptions}
                      onAddRefDraftOption={onAddRefDraftOption}
                      refBaseSchema={refBaseSchema}
                    />
                  </SessionFormSection>
                )}

                {isError && (
                  <p role="alert" className="text-2sm text-text-danger">
                    {errorText ?? t('create.error')}
                  </p>
                )}
              </div>
              <div className="border-hairline-t flex items-center justify-end gap-3 border-border px-4 py-3">
                <Button
                  variant="primary"
                  onClick={requestSubmit}
                  disabled={isSubmitting}
                  className={cn('shrink-0 cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
                >
                  {isSubmitting ? t('create.creating') : t('create.submit')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <LocationPicker {...locationPicker} />
      <AutoApproveConfirmDialog
        i18nOverridePrefix={i18nOverridePrefix}
        isOpen={isAutoApproveConfirmOpen}
        onCancel={() => setIsAutoApproveConfirmOpen(false)}
        onConfirm={() => {
          who.setAutoApprove(true);
          setIsAutoApproveConfirmOpen(false);
        }}
      />
      <LeaveWithoutSavingDialog
        i18nOverridePrefix={i18nOverridePrefix}
        isOpen={isLeaveOpen}
        onStay={() => setIsLeaveOpen(false)}
        onLeave={() => {
          setIsLeaveOpen(false);
          onClose();
        }}
      />
      <SessionReadinessDialog
        i18nOverridePrefix={i18nOverridePrefix}
        isOpen={isReadinessOpen}
        missing={missing}
        onBack={() => setIsReadinessOpen(false)}
        onConfirm={submit}
      />
    </>
  );
}
