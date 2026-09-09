import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { ResolvedNumberAttribute, ResolvedNumberField } from '@/shared/types/sport';
import type { AttributeControlBaseProps } from './types';

interface NumberFieldProps extends AttributeControlBaseProps {
  /** The narrowed arm — only `min`/`max` are read. */
  attribute: Pick<ResolvedNumberAttribute | ResolvedNumberField, 'min' | 'max'>;
}

/** `NUMBER` attribute control (CLIENT-SESSION-17 Part A) — verbatim from `SportAttributesFields`.
 * Stores a real `number`; an empty/cleared field reports `undefined` (never `''`/`NaN`).
 * `min`/`max` are a UX affordance only — the server drops an out-of-range value on save. */
export function NumberField({
  attribute,
  fieldId,
  label,
  value,
  onChange,
  ariaRequired,
  requiredHint,
}: NumberFieldProps) {
  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        type="number"
        step="any"
        min={attribute.min ?? undefined}
        max={attribute.max ?? undefined}
        aria-required={ariaRequired}
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => {
          const parsed = event.target.valueAsNumber;
          onChange(Number.isNaN(parsed) ? undefined : parsed);
        }}
      />
      {requiredHint}
    </div>
  );
}
