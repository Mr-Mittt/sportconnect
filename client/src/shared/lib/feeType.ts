import { formatVnd } from '@/shared/lib/currency';
import type { FeeType } from '@/shared/types/session';

// Shared across CreateSessionModal (the fee-type toggle), SessionCard (used at both sizes by
// UpcomingMatches and the Matches page), and SessionDetailModal so the fee reads identically
// everywhere a Session appears — same convention as sessionStatus.ts's SESSION_STATUS_LABEL.
export const FEE_TYPE_LABEL: Record<FeeType, string> = {
  FREE: 'Free',
  SPLIT: 'Split cost',
  FIXED: 'Fixed amount',
};

/** `feeAmountVnd` is only meaningful when `feeType` is `FIXED` (enforced backend-side) — this
 * renders the VND amount in that case, and the plain label otherwise. `feeType` is `null` on a
 * PREPARING session created without one (SESSION-24) — rendered as a distinct "pending" state,
 * never mistaken for the real `FREE` label. */
export function formatFeeDisplay(feeType: FeeType | null, feeAmountVnd: number | null): string {
  if (feeType === null) {
    return 'Fee pending';
  }
  if (feeType === 'FIXED' && feeAmountVnd !== null) {
    return formatVnd(feeAmountVnd);
  }
  return FEE_TYPE_LABEL[feeType];
}
