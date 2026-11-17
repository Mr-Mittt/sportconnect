import type { MissingField } from './sessionReadiness';

/**
 * CLIENT-SESSION-50: the order the missing fields sit in on the form, top to bottom (When: duration, Where:
 * location, Cost: fee). It is the page order, not the order `missingForScheduling` happens to list them in.
 */
export const MISSING_FIELD_FORM_ORDER: readonly MissingField[] = ['duration', 'location', 'fee'];

/** The first of `missing` on the form, top to bottom, or `undefined` when nothing is missing. */
export function firstMissingInFormOrder(missing: readonly MissingField[]): MissingField | undefined {
  return MISSING_FIELD_FORM_ORDER.find((field) => missing.includes(field));
}

/**
 * The id of the element that takes the focus for a missing field: the duration input, the location button
 * and the first fee option (Free). `idPrefix` is the form's (`create-session`, `detail-when`, ...).
 */
export function missingFieldId(field: MissingField, idPrefix: string): string {
  switch (field) {
    case 'duration':
      return `${idPrefix}-duration`;
    case 'location':
      return `${idPrefix}-location`;
    case 'fee':
      return `${idPrefix}-fee-free`;
  }
}

/** The form section that holds a missing field (the one that flicks when "Continue editing" lands on it). */
export function missingFieldSection(field: MissingField): 'when' | 'where' | 'cost' {
  switch (field) {
    case 'duration':
      return 'when';
    case 'location':
      return 'where';
    case 'fee':
      return 'cost';
  }
}

/**
 * Scrolls the element with this id into view and focuses it (no-op when it is not on the page). `scrollIntoView`
 * is skipped where it does not exist (jsdom). Shared by the create form's refused Create and "Continue editing".
 */
export function focusFieldById(id: string): void {
  const element = document.getElementById(id);
  if (element === null) return;
  if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  element.focus({ preventScroll: true });
}
