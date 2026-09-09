import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Slider } from '@/shared/ui/slider';
import { formatAttributeValue } from '@/shared/lib/formatAttributeValue';
import { devWarn } from '@/shared/lib/devWarn';
import type { ResolvedNumberAttribute, ResolvedNumberField } from '@/shared/types/sport';
import type { AttributeControlBaseProps } from './types';
import { normalizeLayout, pickLayoutId } from './layout';

interface NumberFieldProps extends AttributeControlBaseProps {
  /** The narrowed arm — only `min`/`max` are read. */
  attribute: Pick<ResolvedNumberAttribute | ResolvedNumberField, 'min' | 'max'>;
}

const NUMBER_LAYOUTS = ['input', 'stepper', 'slider', 'readonly-text'] as const;

/**
 * `NUMBER` attribute control (CLIENT-SESSION-17 Part A). Stores a real `number`; an empty/cleared
 * field reports `undefined` (never `''`/`NaN`). `min`/`max` are a UX affordance only.
 *
 * SPORT-13: `layout.id` picks `input` (default), `stepper` (−/+ buttons around the input),
 * `slider` (falls back to `input` + a dev warning when `min`/`max` aren't both set), or
 * `readonly-text` (the value as text). `layout.format` renders a muted formatted preview under
 * the editable layouts and is the whole value in `readonly-text` — display only, the stored
 * number is untouched.
 */
export function NumberField({
  attribute,
  fieldId,
  label,
  value,
  onChange,
  ariaRequired,
  requiredHint,
  layout,
}: NumberFieldProps) {
  const { id, format } = normalizeLayout(layout, label);
  let kind = pickLayoutId(id, NUMBER_LAYOUTS, 'input', label);

  const hasBounds = attribute.min != null && attribute.max != null;
  if (kind === 'slider' && !hasBounds) {
    devWarn(
      `number-slider-no-bounds:${label}`,
      `"${label}" \`layout.id\` "slider" needs both \`min\` and \`max\` — using "input"`,
    );
    kind = 'input';
  }

  const num = typeof value === 'number' ? value : undefined;
  const preview =
    format != null && num !== undefined ? formatAttributeValue(num, 'NUMBER', format) : null;

  const plainInput = (
    <Input
      id={fieldId}
      type="number"
      step="any"
      min={attribute.min ?? undefined}
      max={attribute.max ?? undefined}
      aria-required={ariaRequired}
      value={num ?? ''}
      onChange={(event) => {
        const parsed = event.target.valueAsNumber;
        onChange(Number.isNaN(parsed) ? undefined : parsed);
      }}
    />
  );

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>

      {kind === 'readonly-text' ? (
        <p id={fieldId} className="text-sm text-text-primary" aria-readonly="true">
          {num === undefined ? '—' : formatAttributeValue(num, 'NUMBER', format)}
        </p>
      ) : kind === 'slider' ? (
        <Slider
          id={fieldId}
          min={attribute.min as number}
          max={attribute.max as number}
          value={num ?? (attribute.min as number)}
          valueText={preview ?? undefined}
          aria-label={label}
          onValueChange={(next) => onChange(next)}
        />
      ) : kind === 'stepper' ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={`Decrease ${label}`}
            disabled={attribute.min != null && num !== undefined && num <= attribute.min}
            onClick={() => onChange((num ?? attribute.min ?? 0) - 1)}
          >
            −
          </Button>
          <div className="w-24">{plainInput}</div>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Increase ${label}`}
            disabled={attribute.max != null && num !== undefined && num >= attribute.max}
            onClick={() => onChange((num ?? attribute.min ?? 0) + 1)}
          >
            +
          </Button>
        </div>
      ) : (
        plainInput
      )}

      {kind !== 'readonly-text' && preview != null && (
        <p className="mt-1 text-2xs text-text-muted">{preview}</p>
      )}
      {requiredHint}
    </div>
  );
}
