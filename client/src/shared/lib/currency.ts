/** Formats a VND amount for display, e.g. `formatVnd(150000)` -> `"150 000 ₫"` — a space every 3
 * digits (same separator `CreateSessionModal`'s Fixed-amount input uses), not a comma. */
export function formatVnd(amountVnd: number): string {
  return `${amountVnd.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₫`;
}
