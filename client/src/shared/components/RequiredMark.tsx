/**
 * Visual-only marker for a required field — screen readers get the real signal from each field's
 * own `required`/`aria-required` attribute (or its error text), not this asterisk, hence
 * `aria-hidden`. Extracted from `CreateSessionModal.tsx` (its original, single owner) when
 * `RegisterForm` (CLIENT-REF-2) became a second consumer wanting the exact same marker.
 */
export function RequiredMark() {
  return (
    <span className="text-text-danger" aria-hidden="true">
      {' *'}
    </span>
  );
}
