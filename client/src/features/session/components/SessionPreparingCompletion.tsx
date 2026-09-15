import { useState } from 'react';
import type { LocationPickerProps } from '@/features/location/components/LocationPicker';
import { LocationPicker } from '@/features/location/components/LocationPicker';
import type { Location } from '@/shared/types/location';
import type { FeeType, Session } from '@/shared/types/session';
import { Button } from '@/shared/ui/button';
import type { UpdateSessionPayload } from '../types';
import { FeeTypeFields } from './FeeTypeFields';

interface SessionPreparingCompletionProps {
  /** Caller guarantees `status === 'PREPARING'` before rendering this at all — SESSION-24's own
   * definition of PREPARING means at least one of `location`/`feeType` is null here. */
  session: Session;
  selectedLocation: Location | null;
  onOpenLocationPicker: () => void;
  locationPicker: LocationPickerProps;
  onSubmit: (payload: UpdateSessionPayload) => void;
  isSubmitting: boolean;
  isError: boolean;
}

/**
 * CLIENT-SESSION-21: the "complete session setup" surface for a PREPARING session's own
 * creator/owner-admin (SESSION-24) — renders only whichever of location/fee is still missing,
 * reusing the exact same `LocationPicker` and `FeeTypeFields` widgets `CreateSessionModal` uses
 * for the same fields, rather than inventing a second location/fee-picking UI. No prior "edit
 * session" pattern exists in this codebase to follow instead (the ticket's own scoping note).
 *
 * Submits only the field(s) actually being completed — never re-sends a field the session
 * already has, since `updateSession` rejects touching `locationId`/`feeType` at all once the
 * session is no longer PREPARING, and there's no reason to touch an already-set one anyway.
 * After a submit that completes only one of two missing fields (partial completion, SESSION-24
 * keeps the session PREPARING), the parent's session refetch updates `session.location`/
 * `.feeType`, which this component reads fresh on every render — so "still missing: X" updates
 * itself with no extra state.
 */
export function SessionPreparingCompletion({
  session,
  selectedLocation,
  onOpenLocationPicker,
  locationPicker,
  onSubmit,
  isSubmitting,
  isError,
}: SessionPreparingCompletionProps) {
  const missingLocation = session.location === null;
  const missingFee = session.feeType === null;

  const [feeType, setFeeType] = useState<FeeType | undefined>(undefined);
  const [feeAmountVnd, setFeeAmountVnd] = useState('');
  // Once the fee is completed (session refetches with a non-null feeType), drop the local draft
  // so a stale half-typed amount doesn't linger if this session is ever revisited while still
  // PREPARING for its other field. Render-phase state adjustment (same `seededForSport` idiom
  // `CreateSessionModal` uses) rather than an effect+setState, which would cascade an extra render.
  const [seededForMissingFee, setSeededForMissingFee] = useState(missingFee);
  if (missingFee !== seededForMissingFee) {
    setSeededForMissingFee(missingFee);
    if (!missingFee) {
      setFeeType(undefined);
      setFeeAmountVnd('');
    }
  }

  const isFeeAmountRequired = feeType === 'FIXED';
  const hasLocationToSubmit = missingLocation && selectedLocation !== null;
  const hasFeeToSubmit = missingFee && feeType !== undefined && (!isFeeAmountRequired || feeAmountVnd !== '');
  const canSubmit = hasLocationToSubmit || hasFeeToSubmit;

  const missingLabel =
    missingLocation && missingFee ? 'Location and Fee' : missingLocation ? 'Location' : 'Fee';

  const submit = () => {
    if (!canSubmit) return;
    const payload: UpdateSessionPayload = {};
    if (hasLocationToSubmit && selectedLocation !== null) {
      payload.locationId = selectedLocation.id;
    }
    if (hasFeeToSubmit && feeType !== undefined) {
      payload.feeType = feeType;
      if (isFeeAmountRequired) {
        payload.feeAmountVnd = Number(feeAmountVnd);
      }
    }
    onSubmit(payload);
  };

  return (
    <section
      aria-label="Complete session setup"
      className="border-amber-800/30 bg-amber-50 flex flex-col gap-2.5 rounded-xl border-hairline p-2.5"
    >
      <p className="text-2sm text-amber-800">
        Still missing: <strong>{missingLabel}</strong>. Complete it before this session starts, or
        it will be auto-cancelled.
      </p>

      {missingLocation && (
        <div className="flex items-center gap-2">
          {selectedLocation !== null && (
            <span className="min-w-0 flex-1 truncate text-2sm text-text-primary">
              {selectedLocation.name}
            </span>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onOpenLocationPicker}>
            {selectedLocation === null ? 'Choose location' : 'Change location'}
          </Button>
        </div>
      )}

      {missingFee && (
        <FeeTypeFields
          value={feeType}
          onChange={setFeeType}
          amount={feeAmountVnd}
          onAmountChange={setFeeAmountVnd}
          idPrefix="session-preparing-completion"
        />
      )}

      {isError && (
        <p role="alert" className="text-2xs text-text-danger">
          Couldn't complete the session setup. Try again.
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={!canSubmit || isSubmitting}
        onClick={submit}
        className="self-start"
      >
        {isSubmitting ? 'Saving…' : 'Save'}
      </Button>

      <LocationPicker {...locationPicker} />
    </section>
  );
}
