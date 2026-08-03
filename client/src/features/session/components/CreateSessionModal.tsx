import type { ComponentProps } from 'react';
import { useState } from 'react';
import { SPORT_ID_BY_KEY } from '@/features/feed/sportIdMap';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import { LocationPicker } from '@/features/location/components/LocationPicker';
import { FEE_TYPE_LABEL } from '@/shared/lib/feeType';
import type { Location } from '@/shared/types/location';
import type { FeeType } from '@/shared/types/session';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import type { CreateSessionPayload } from '../types';
import { SessionStartTimePicker } from './SessionStartTimePicker';

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

/** Shared by every numeric field in this form (Duration, Taken/Open slot, Fixed amount) — blocks
 * any keystroke that isn't a digit or a navigation/edit key. A native `type="number"` input still
 * accepts `e`/`+`/`-`/`.` from the keyboard, so `type="number"` alone isn't enough. */
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

/** `n.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')` — inserts a space every 3 digits from the right,
 * e.g. `"50000"` -> `"50 000"`. Only the Fixed-amount field uses this (large VND amounts);
 * Duration/Taken/Open slot stay small counts with no need for a thousands separator. */
function formatThousandSpaces(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** The Fixed-amount field — `type="text"` (not `number`, which can't render a space-formatted
 * value at all), reformatted on every keystroke: `onChange` strips the raw event value down to
 * digits only (so a paste like `"50,000"` normalizes to `"50000"` before it's ever re-displayed),
 * then `value` re-renders it with `formatThousandSpaces`. Same digits-only keydown guard as
 * `DigitsOnlyInput`; paste is allowed through as long as it contains at least one digit and
 * nothing outside digits/space/comma/period (so a pre-formatted "50,000" or "50 000" pastes in
 * fine, but "90 mins" is rejected outright) — `onChange` does the actual normalizing afterward. */
function VndAmountInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      value={formatThousandSpaces(value)}
      onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ''))}
      onKeyDown={handleDigitsOnlyKeyDown}
      onPaste={(event) => {
        const pasted = event.clipboardData.getData('text');
        if (pasted.replace(/[^0-9]/g, '') === '' || !/^[0-9\s,.]+$/.test(pasted)) {
          event.preventDefault();
        }
      }}
    />
  );
}

/** `Free`/`Split cost` are a checkbox + label each; `Fixed amount` is a label + number input
 * instead (no checkbox of its own) — typing into that input is what selects `FIXED`. All three
 * stay mutually exclusive: checking `Free`/`Split cost` also clears the amount field, and typing
 * a non-empty amount switches `value` to `FIXED`. Same inline-checkbox idiom `CreateGroupModal`'s
 * "Private group" toggle already uses, not a custom `Checkbox` primitive (none exists yet). */
function FeeTypeFields({
  value,
  onChange,
  amount,
  onAmountChange,
}: {
  value: FeeType;
  onChange: (next: FeeType) => void;
  amount: string;
  onAmountChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
        <input
          type="checkbox"
          checked={value === 'FREE'}
          onChange={() => {
            onChange('FREE');
            onAmountChange('');
          }}
          className="size-4 cursor-pointer rounded border-border-strong"
        />
        {FEE_TYPE_LABEL.FREE}
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
        <input
          type="checkbox"
          checked={value === 'SPLIT'}
          onChange={() => {
            onChange('SPLIT');
            onAmountChange('');
          }}
          className="size-4 cursor-pointer rounded border-border-strong"
        />
        {FEE_TYPE_LABEL.SPLIT}
      </label>
      <div className="flex items-center gap-2">
        <Label htmlFor="create-session-fee-amount" className="mb-0 shrink-0">
          {FEE_TYPE_LABEL.FIXED}
        </Label>
        <VndAmountInput
          id="create-session-fee-amount"
          value={amount}
          onChange={(next) => {
            onAmountChange(next);
            onChange('FIXED');
          }}
          placeholder="VND"
        />
      </div>
    </div>
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

  onSubmit: (payload: CreateSessionPayload) => void;
  isSubmitting: boolean;
  isError: boolean;
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
 * Description alone, full width. The location field is still the
 * plain "Choose a location" button from CLIENT-SESSION-1 — a `DropdownMenu`-shell version was
 * tried here and reverted (confirmed live: the menu never opened at all, nested inside this modal
 * Dialog) with nothing to show in it yet anyway (zero favorites exist pre-CLIENT-SESSION-5) —
 * CLIENT-SESSION-5 builds the real dropdown when it has actual data and can be verified
 * end-to-end, rather than shipping a broken shell for a feature that doesn't exist yet.
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
 */
export function CreateSessionModal({
  isOpen,
  onClose,
  sportsByKey,
  activeSport,
  selectedLocation,
  onOpenLocationPicker,
  locationPicker,
  onSubmit,
  isSubmitting,
  isError,
}: CreateSessionModalProps) {
  const sportKeys = Object.keys(sportsByKey) as SportKey[];
  const initialSport: SportKey | '' =
    activeSport !== undefined && activeSport !== 'all'
      ? activeSport
      : sportKeys.length === 1
        ? sportKeys[0]
        : '';

  const [selectedSport, setSelectedSport] = useState<SportKey | ''>(initialSport);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [takenSlots, setTakenSlots] = useState('');
  const [openSlots, setOpenSlots] = useState('');
  const [feeType, setFeeType] = useState<FeeType>('FREE');
  const [feeAmountVnd, setFeeAmountVnd] = useState('');
  const [isBasicInfoOpen, setIsBasicInfoOpen] = useState(true);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  /** Set on the first submit attempt while the form is still invalid — from then on, each
   * required field shows its own error message for as long as it stays unfilled (auto-clears the
   * moment that specific field becomes valid, since these are recomputed from current state on
   * every render, not tracked as separate per-field "touched" flags). */
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  const effectiveSportId = selectedSport !== '' ? SPORT_ID_BY_KEY[selectedSport] : undefined;

  const isFeeAmountRequired = feeType === 'FIXED';

  // "Taken slot" means the creator (and whoever's already with them) — it defaults to 1, not 0,
  // when left blank, since the creator always auto-joins the session they're creating.
  const effectiveTakenSlots = takenSlots === '' ? 1 : Number(takenSlots);
  const effectiveOpenSlots = openSlots === '' ? 0 : Number(openSlots);
  const capacity = effectiveTakenSlots + effectiveOpenSlots;
  // The backend's initialSlot is folded onto the real (auto-joined creator) participant row, so
  // it's "Taken slot" minus the creator's own already-real row — 0 when Taken slot is blank.
  const initialSlot = effectiveTakenSlots - 1;

  const isValid =
    effectiveSportId !== undefined &&
    selectedLocation !== null &&
    scheduledStart !== '' &&
    title.trim() !== '' &&
    durationMinutes !== '' &&
    openSlots !== '' &&
    (!isFeeAmountRequired || feeAmountVnd !== '');

  const submit = () => {
    if (!isValid || effectiveSportId === undefined || selectedLocation === null) {
      setHasAttemptedSubmit(true);
      return;
    }
    onSubmit({
      sportId: effectiveSportId,
      title: title.trim(),
      description: description.trim() || undefined,
      locationId: selectedLocation.id,
      locationNote: locationNote.trim() || undefined,
      scheduledStart: `${scheduledStart}:00`,
      durationMinutes: Number(durationMinutes),
      // The backend's `capacity` is a single total — "Taken slot"/"Open slot" is a UI-only split
      // for creators who think in those terms.
      capacity,
      feeType,
      feeAmountVnd: isFeeAmountRequired ? Number(feeAmountVnd) : undefined,
      initialSlot,
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent fixedHeight className="max-w-2xl">
          <DialogHeader title="Create your session" className="border-hairline-b border-border px-4 py-3" />
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
                      value={selectedSport}
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
                      Location
                      <RequiredMark />
                    </span>
                    <div className="flex items-center gap-2">
                      {selectedLocation !== null && (
                        <span className="min-w-0 flex-1 truncate text-2sm text-text-primary">
                          {selectedLocation.name}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={effectiveSportId === undefined}
                        onClick={() => effectiveSportId !== undefined && onOpenLocationPicker(effectiveSportId)}
                      >
                        {selectedLocation === null ? 'Choose location' : 'Change location'}
                      </Button>
                    </div>
                    {effectiveSportId === undefined ? (
                      <p className="mt-1 text-2xs text-text-muted">Pick a sport first.</p>
                    ) : (
                      hasAttemptedSubmit &&
                      selectedLocation === null && (
                        <p className="mt-1 text-2xs text-text-danger">Location is required.</p>
                      )
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
                    <SessionStartTimePicker value={scheduledStart} onChange={setScheduledStart} />
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
                      Fee
                      <RequiredMark />
                    </span>
                    <FeeTypeFields
                      value={feeType}
                      onChange={setFeeType}
                      amount={feeAmountVnd}
                      onAmountChange={setFeeAmountVnd}
                    />
                    {hasAttemptedSubmit && isFeeAmountRequired && feeAmountVnd === '' && (
                      <p className="mt-1 text-2xs text-text-danger">Amount is required.</p>
                    )}
                  </div>
                </div>

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

            <Collapsible open={isDetailOpen} onOpenChange={setIsDetailOpen} className="border-hairline-t border-border pt-3">
              <CollapsibleTrigger className="border-hairline-b justify-center gap-1.5 border-border px-1.75 py-1.5">
                <span className="text-2xs font-medium text-text-secondary">Session detail</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <p className="text-2sm text-text-muted">Coming soon.</p>
              </CollapsibleContent>
            </Collapsible>

            {isError && (
              <p role="alert" className="text-2sm text-text-danger">
                Couldn't create the session. Try again.
              </p>
            )}
          </div>
          <div className="border-hairline-t flex justify-end border-border px-4 py-3">
            <Button
              variant="primary"
              onClick={submit}
              disabled={isSubmitting}
              className={cn('cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
            >
              {isSubmitting ? 'Creating…' : 'Create session'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <LocationPicker {...locationPicker} />
    </>
  );
}
