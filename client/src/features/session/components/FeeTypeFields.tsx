import type { ComponentProps } from 'react';
import { FEE_TYPE_LABEL } from '@/shared/lib/feeType';
import type { FeeType } from '@/shared/types/session';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

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

/** Blocks any keystroke that isn't a digit or a navigation/edit key. A native `type="number"`
 * input still accepts `e`/`+`/`-`/`.` from the keyboard, so `type="number"` alone isn't enough.
 * Not exported — `CreateSessionModal.tsx` keeps its own copy for its other numeric fields
 * (Duration/Taken/Open slot), same reasoning that file's own doc comment gives. */
function handleDigitsOnlyKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.ctrlKey || event.metaKey || event.altKey || ALLOWED_DIGITS_ONLY_KEYS.has(event.key)) {
    return;
  }
  if (!/^[0-9]$/.test(event.key)) {
    event.preventDefault();
  }
}

/** `n.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')` — inserts a space every 3 digits from the right,
 * e.g. `"50000"` -> `"50 000"`. */
function formatThousandSpaces(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** The Fixed-amount field — `type="text"` (not `number`, which can't render a space-formatted
 * value at all), reformatted on every keystroke: `onChange` strips the raw event value down to
 * digits only (so a paste like `"50,000"` normalizes to `"50000"` before it's ever re-displayed),
 * then `value` re-renders it with `formatThousandSpaces`. Same digits-only keydown guard as
 * every other numeric field in this form; paste is allowed through as long as it contains at
 * least one digit and nothing outside digits/space/comma/period (so a pre-formatted "50,000" or
 * "50 000" pastes in fine, but "90 mins" is rejected outright) — `onChange` does the actual
 * normalizing afterward. */
export function VndAmountInput({
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
 * a non-empty amount switches `value` to `FIXED`. `value` is `undefined` when the caller hasn't
 * picked anything yet (CLIENT-SESSION-21: `CreateSessionModal`'s fee is optional per SESSION-24 —
 * none of the three checkboxes render checked until one is explicitly chosen) — every checkbox's
 * `checked` comparison against `undefined` is simply false, so this needs no special-casing.
 * Un-selecting is symmetric with selecting: re-clicking the currently-checked `Free`/`Split cost`
 * checkbox, or clearing the amount input down to empty, both call `onChange(undefined)` — the
 * only way back to "nothing picked" once one of the three has been chosen. Extracted out of
 * `CreateSessionModal` (CLIENT-SESSION-21) so `SessionPreparingCompletion` can reuse the exact
 * same fee-picking UI for a PREPARING session's completion flow. */
export function FeeTypeFields({
  value,
  onChange,
  amount,
  onAmountChange,
  idPrefix = 'create-session',
}: {
  value: FeeType | undefined;
  onChange: (next: FeeType | undefined) => void;
  amount: string;
  onAmountChange: (next: string) => void;
  /** Distinguishes this instance's amount-input id from another `FeeTypeFields` mounted
   * elsewhere (e.g. `SessionPreparingCompletion`'s completion form) — the two never render at the
   * same time in practice (different dialogs), but this keeps every id unique regardless. */
  idPrefix?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
        <input
          type="checkbox"
          checked={value === 'FREE'}
          onChange={() => {
            onChange(value === 'FREE' ? undefined : 'FREE');
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
            onChange(value === 'SPLIT' ? undefined : 'SPLIT');
            onAmountChange('');
          }}
          className="size-4 cursor-pointer rounded border-border-strong"
        />
        {FEE_TYPE_LABEL.SPLIT}
      </label>
      <div className="flex items-center gap-2">
        <Label htmlFor={`${idPrefix}-fee-amount`} className="mb-0 shrink-0">
          {FEE_TYPE_LABEL.FIXED}
        </Label>
        <VndAmountInput
          id={`${idPrefix}-fee-amount`}
          value={amount}
          onChange={(next) => {
            onAmountChange(next);
            onChange(next === '' ? undefined : 'FIXED');
          }}
          placeholder="VND"
        />
      </div>
    </div>
  );
}
