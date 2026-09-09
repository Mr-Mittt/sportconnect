import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { formatAttributeValue } from '@/shared/lib/formatAttributeValue';
import type { AttributeControlBaseProps } from './types';
import { normalizeLayout, pickLayoutId } from './layout';

const STRING_LAYOUTS = ['input', 'textarea', 'readonly-text'] as const;

/** `STRING` attribute control (CLIENT-SESSION-17 Part A). SPORT-13: `layout.id` picks
 * `input` (default `<Input>`), `textarea` (`<Textarea>`), or `readonly-text` (the value rendered
 * as text, through `layout.format` — `uppercase`/`lowercase`/`titlecase`). An absent/unknown
 * `layout` renders the default `<Input>` unchanged. */
export function StringField({
  fieldId,
  label,
  value,
  onChange,
  ariaRequired,
  requiredHint,
  layout,
}: AttributeControlBaseProps) {
  const { id, format } = normalizeLayout(layout, label);
  const kind = pickLayoutId(id, STRING_LAYOUTS, 'input', label);
  const text = typeof value === 'string' ? value : '';

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      {kind === 'readonly-text' ? (
        <p
          id={fieldId}
          className="text-sm text-text-primary"
          aria-readonly="true"
        >
          {formatAttributeValue(text, 'STRING', format) || '—'}
        </p>
      ) : kind === 'textarea' ? (
        <Textarea
          id={fieldId}
          aria-required={ariaRequired}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={fieldId}
          aria-required={ariaRequired}
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {requiredHint}
    </div>
  );
}
