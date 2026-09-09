import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import type { AttributeControlBaseProps } from './types';
import { normalizeLayout, pickLayoutId } from './layout';

const BOOLEAN_LAYOUTS = ['switch', 'checkbox', 'segmented'] as const;

const YES_NO = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

/** `BOOLEAN` attribute control (CLIENT-SESSION-17 Part A). Stores a real `boolean`.
 * SPORT-13: `layout.id` picks `switch` (default `<Switch>`), `checkbox` (native), or `segmented`
 * (a Yes/No segmented control). An absent/unknown `layout` renders the default `<Switch>`. */
export function BooleanField({
  fieldId,
  label,
  value,
  onChange,
  ariaRequired,
  requiredHint,
  layout,
}: AttributeControlBaseProps) {
  const { id } = normalizeLayout(layout, label);
  const kind = pickLayoutId(id, BOOLEAN_LAYOUTS, 'switch', label);
  const checked = typeof value === 'boolean' ? value : false;

  if (kind === 'segmented') {
    return (
      <div>
        <Label className="mb-1.5 block">{label}</Label>
        <SegmentedControl
          name={fieldId}
          aria-label={label}
          aria-required={ariaRequired}
          value={String(checked)}
          onValueChange={(next) => onChange(next === 'true')}
          options={YES_NO}
        />
        {requiredHint}
      </div>
    );
  }

  if (kind === 'checkbox') {
    return (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={fieldId}
          aria-required={ariaRequired}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 accent-accent-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
        />
        <Label htmlFor={fieldId} className="mb-0">
          {label}
        </Label>
        {requiredHint}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="mb-0">{label}</Label>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
      {requiredHint}
    </div>
  );
}
