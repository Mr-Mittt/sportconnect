import i18next from 'i18next';
import { formatVnd } from '@/shared/lib/currency';
import type { FeeType } from '@/shared/types/session';

/** Shared across CreateSessionModal (the fee-type toggle), SessionCard (used at both sizes by
 * UpcomingMatches and the Matches page), and SessionDetailModal so the fee reads identically
 * everywhere a Session appears — same convention as sessionStatus.ts's `getSessionStatusLabel`.
 * CLIENT-I18N-10: was a constant map; now a function so the label follows the active language
 * (plain function → reads the i18next singleton directly, like `getSessionStatusLabel`). */
export function getFeeTypeLabel(feeType: FeeType): string {
  return i18next.t(`session:fee.type.${feeType}`);
}

/** `feeAmountVnd` is only meaningful when `feeType` is `FIXED` (enforced backend-side) — this
 * renders the VND amount in that case, and the plain label otherwise. `feeType` is `null` on a
 * PREPARING session created without one (SESSION-24) — rendered as a distinct "pending" state,
 * never mistaken for the real `FREE` label. */
export function formatFeeDisplay(feeType: FeeType | null, feeAmountVnd: number | null): string {
  if (feeType === null) {
    return i18next.t('session:fee.pending');
  }
  if (feeType === 'FIXED' && feeAmountVnd !== null) {
    return formatVnd(feeAmountVnd);
  }
  return getFeeTypeLabel(feeType);
}
