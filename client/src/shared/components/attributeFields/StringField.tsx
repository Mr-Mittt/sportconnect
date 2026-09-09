import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { AttributeControlBaseProps } from './types';

/** `STRING` attribute control (CLIENT-SESSION-17 Part A) — markup lifted verbatim from
 * `SportAttributesFields`' `STRING` cases so both the top-level and record contexts render
 * identically to before. */
export function StringField({
  fieldId,
  label,
  value,
  onChange,
  ariaRequired,
  requiredHint,
}: AttributeControlBaseProps) {
  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        aria-required={ariaRequired}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
      {requiredHint}
    </div>
  );
}
