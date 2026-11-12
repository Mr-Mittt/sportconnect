import type { FeeType, Session } from '@/shared/types/session';

/** What a session still needs before it can be scheduled (SESSION-46's `SESSION_NOT_READY`). */
export type MissingField = 'location' | 'fee' | 'duration';

/**
 * Mirrors the server's `missingForScheduling` (SESSION-46): a location, a fee (and, for a `FIXED`
 * fee, its amount) and a duration. The server re-checks at `POST /schedule`; this is for the form's
 * chips, the readiness popup and the Schedule button's enabled state. Order is fixed so the popup
 * list and the chips read the same way.
 */
export function missingForScheduling(input: {
  hasLocation: boolean;
  feeType: FeeType | null | undefined;
  /** Only read when `feeType` is `FIXED`; a blank or missing amount counts as the fee missing. */
  hasFeeAmount: boolean;
  hasDuration: boolean;
}): MissingField[] {
  const missing: MissingField[] = [];
  if (!input.hasLocation) missing.push('location');
  if (input.feeType === null || input.feeType === undefined || (input.feeType === 'FIXED' && !input.hasFeeAmount)) {
    missing.push('fee');
  }
  if (!input.hasDuration) missing.push('duration');
  return missing;
}

/** The same rule over a stored `Session` (a null end means the duration was never set). */
export function missingForSession(session: Session): MissingField[] {
  return missingForScheduling({
    hasLocation: session.location !== null,
    feeType: session.feeType,
    hasFeeAmount: session.feeAmountVnd !== null,
    hasDuration: session.scheduledEndAt !== null,
  });
}
