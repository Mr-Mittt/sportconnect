import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { RadioGroup } from '@/shared/ui/radio-group';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { cn } from '@/shared/lib/utils';
import { devWarn } from '@/shared/lib/devWarn';
import type { ResolvedEnumAttribute, ResolvedEnumField } from '@/shared/types/sport';
import type { AttributeControlBaseProps } from './types';
import { normalizeLayout, pickLayoutId } from './layout';

interface EnumFieldProps extends AttributeControlBaseProps {
  attribute: Pick<ResolvedEnumAttribute | ResolvedEnumField, 'options'>;
}

const ENUM_LAYOUTS = ['dropdown', 'radio', 'segmented'] as const;

/** Past this many options a `segmented` control wraps awkwardly and loses to a `<select>`. */
const SEGMENTED_MAX_OPTIONS = 5;

/**
 * `ENUM` attribute control (CLIENT-SESSION-17 Part A). SPORT-13: `layout.id` picks `dropdown`
 * (default native `<Select>`), `radio` (`<RadioGroup>`), or `segmented` (`<SegmentedControl>` —
 * falls back to `dropdown` + a dev warning past {@link SEGMENTED_MAX_OPTIONS} options).
 *
 * SPORT-13 (scope addition): the selection can be **cleared**, not only changed — an `×` button on
 * the `dropdown` when a value is set, and click-the-selected-option-to-deselect on `radio` /
 * `segmented`. The empty state is byte-identical to before.
 */
export function EnumField({
  attribute,
  fieldId,
  label,
  value,
  onChange,
  ariaRequired,
  requiredHint,
  layout,
}: EnumFieldProps) {
  const options = attribute.options ?? [];
  const { id } = normalizeLayout(layout, label);
  let kind = pickLayoutId(id, ENUM_LAYOUTS, 'dropdown', label);
  const selected = typeof value === 'string' ? value : '';

  if (kind === 'segmented' && options.length > SEGMENTED_MAX_OPTIONS) {
    devWarn(
      `enum-segmented-too-many:${label}`,
      `"${label}" has ${options.length} options — "segmented" needs ≤ ${SEGMENTED_MAX_OPTIONS}; using "dropdown"`,
    );
    kind = 'dropdown';
  }

  if (kind === 'radio' || kind === 'segmented') {
    const Control = kind === 'radio' ? RadioGroup : SegmentedControl;
    return (
      <div>
        <Label className="mb-1.5 block">{label}</Label>
        <Control
          name={fieldId}
          aria-label={label}
          aria-required={ariaRequired}
          allowDeselect
          value={selected}
          onValueChange={onChange}
          options={options.map((option) => ({ value: option.value, label: option.label }))}
        />
        {requiredHint}
      </div>
    );
  }

  const select = (
    <Select
      id={fieldId}
      aria-required={ariaRequired}
      value={selected}
      onChange={(event) => onChange(event.target.value)}
      className={cn(selected !== '' && 'pr-9')}
    >
      <option value="" disabled>
        Select…
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      {selected === '' ? (
        select
      ) : (
        <div className="relative">
          {select}
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onClick={() => onChange('')}
            className="absolute right-6 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
      {requiredHint}
    </div>
  );
}
