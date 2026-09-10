import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type { ResolvedAttributeLayout, ResolvedSportAttributeOption } from '@/shared/types/sport';
import { MAX_LIST_ITEMS } from '@/shared/types/sport';
import { cn } from '@/shared/lib/utils';
import { normalizeLayout, pickLayoutId } from './layout';

export interface ListFieldProps {
  fieldId: string;
  label: string;
  options: ResolvedSportAttributeOption[];
  selected: string[];
  onChange: (value: string[]) => void;
  /** SPORT-14: container/edit layout for the `LIST` node — `checkboxes` (default, unchanged),
   * `chips` (toggle pills), `multiselect` (native `<select multiple>`), `ordered` (checkboxes plus
   * up/down reordering of the stored array). Absent/unknown → `checkboxes`. */
  layout?: ResolvedAttributeLayout | null;
}

const LIST_LAYOUTS = ['checkboxes', 'chips', 'multiselect', 'ordered'] as const;

/**
 * Multi-select control for a `LIST` attribute (and a `LIST` record field). Capped at
 * `MAX_LIST_ITEMS` client-side — the server silently drops a whole over-cap value rather than
 * erroring. Extracted verbatim from `SportAttributesFields` (CLIENT-SESSION-17 Part A) so the
 * `LIST` arm and the `#ref` `LIST` control share one implementation; SPORT-14 adds the `layout`
 * variants. Every variant stores and emits a `string[]`; the `checkboxes` default is byte-identical
 * to the pre-SPORT-14 markup.
 */
export function ListField({ fieldId, label, options, selected, onChange, layout }: ListFieldProps) {
  const kind = pickLayoutId(normalizeLayout(layout, label).id, LIST_LAYOUTS, 'checkboxes', label);
  const atCap = selected.length >= MAX_LIST_ITEMS;

  const toggle = (value: string, checked: boolean) => {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
  };

  if (kind === 'chips') {
    return (
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-text-secondary">{label}</legend>
        <div id={fieldId} className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const checked = selected.includes(option.value);
            const disabled = !checked && atCap;
            return (
              <button
                key={option.value}
                type="button"
                role="checkbox"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => toggle(option.value, !checked)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border-hairline px-2.5 py-1 text-2sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-not-allowed disabled:opacity-50',
                  checked
                    ? 'border-border-accent bg-accent-solid text-white'
                    : 'border-border bg-surface-1 text-text-secondary hover:text-text-primary',
                )}
              >
                {checked && <span aria-hidden="true">✓</span>}
                {option.label}
              </button>
            );
          })}
        </div>
        {atCap && (
          <p className="mt-1 text-2xs text-text-muted">{MAX_LIST_ITEMS} selected (maximum)</p>
        )}
      </fieldset>
    );
  }

  if (kind === 'multiselect') {
    return (
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-text-secondary">{label}</legend>
        <select
          id={fieldId}
          multiple
          value={selected}
          size={Math.min(Math.max(options.length, 3), 6)}
          onChange={(event) => {
            const next = Array.from(event.target.selectedOptions, (o) => o.value);
            // Enforce the same cap the checkbox list does — keep the earlier picks, drop the rest.
            onChange(next.length > MAX_LIST_ITEMS ? next.slice(0, MAX_LIST_ITEMS) : next);
          }}
          className="w-full rounded-lg border-hairline border-border bg-surface-2 p-1.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {atCap && (
          <p className="mt-1 text-2xs text-text-muted">{MAX_LIST_ITEMS} selected (maximum)</p>
        )}
      </fieldset>
    );
  }

  if (kind === 'ordered') {
    const move = (index: number, delta: number) => {
      const next = [...selected];
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    };
    const labelFor = (value: string) =>
      options.find((option) => option.value === value)?.label ?? value;
    const unselected = options.filter((option) => !selected.includes(option.value));
    return (
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-text-secondary">{label}</legend>
        <div id={fieldId} className="flex flex-col gap-1.5">
          {selected.map((value, index) => (
            <div key={value} className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked
                onChange={() => toggle(value, false)}
                aria-label={`${labelFor(value)} (selected, position ${index + 1})`}
              />
              <span className="flex-1">{labelFor(value)}</span>
              <button
                type="button"
                aria-label={`Move ${labelFor(value)} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="cursor-pointer rounded p-0.5 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconChevronUp className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Move ${labelFor(value)} down`}
                disabled={index === selected.length - 1}
                onClick={() => move(index, 1)}
                className="cursor-pointer rounded p-0.5 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconChevronDown className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {unselected.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 text-sm text-text-primary has-disabled:text-text-muted"
            >
              <input
                type="checkbox"
                checked={false}
                disabled={atCap}
                onChange={(event) => toggle(option.value, event.target.checked)}
              />
              {option.label}
            </label>
          ))}
        </div>
        {atCap && (
          <p className="mt-1 text-2xs text-text-muted">{MAX_LIST_ITEMS} selected (maximum)</p>
        )}
      </fieldset>
    );
  }

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
