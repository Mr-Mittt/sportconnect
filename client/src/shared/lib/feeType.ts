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
 * renders the VND amount in that case, and the plain label otherwise. */
export function formatFeeDisplay(feeType: FeeType, feeAmountVnd: number | null): string {
  if (feeType === 'FIXED' && feeAmountVnd !== null) {
    return formatVnd(feeAmountVnd);
  }
  return FEE_TYPE_LABEL[feeType];
}
