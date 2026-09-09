import type { ResolvedSportAttributeOption } from '@/shared/types/sport';
import { MAX_LIST_ITEMS } from '@/shared/types/sport';

export interface ListFieldProps {
  fieldId: string;
  label: string;
  options: ResolvedSportAttributeOption[];
  selected: string[];
  onChange: (value: string[]) => void;
}

/**
 * Multi-select checkbox list for a `LIST` attribute (and a `LIST` record field). Capped at
 * `MAX_LIST_ITEMS` client-side — the server silently drops a whole over-cap value rather than
 * erroring. Extracted verbatim from `SportAttributesFields` (CLIENT-SESSION-17 Part A) so the
 * `LIST` arm and the `#ref` `LIST` control share one implementation.
 */
export function ListField({ fieldId, label, options, selected, onChange }: ListFieldProps) {
  const atCap = selected.length >= MAX_LIST_ITEMS;
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-text-secondary">{label}</legend>
      <div id={fieldId} className="flex flex-col gap-1.5">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          const disabled = !checked && atCap;
          return (
            <label
              key={option.value}
              className="flex items-center gap-2 text-sm text-text-primary has-disabled:text-text-muted"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => {
                  onChange(
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((value) => value !== option.value),
                  );
                }}
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {atCap && <p className="mt-1 text-2xs text-text-muted">{MAX_LIST_ITEMS} selected (maximum)</p>}
    </fieldset>
  );
}
