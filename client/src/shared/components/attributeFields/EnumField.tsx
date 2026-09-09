import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import type { ResolvedEnumAttribute, ResolvedEnumField } from '@/shared/types/sport';
import type { AttributeControlBaseProps } from './types';

interface EnumFieldProps extends AttributeControlBaseProps {
  attribute: Pick<ResolvedEnumAttribute | ResolvedEnumField, 'options'>;
}

/** `ENUM` attribute control (CLIENT-SESSION-17 Part A) — verbatim from `SportAttributesFields`. */
export function EnumField({
  attribute,
  fieldId,
  label,
  value,
  onChange,
  ariaRequired,
  requiredHint,
}: EnumFieldProps) {
  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <Select
        id={fieldId}
        aria-required={ariaRequired}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          Select…
        </option>
        {(attribute.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {requiredHint}
    </div>
  );
}
