import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import type { AttributeControlBaseProps } from './types';

/** `BOOLEAN` attribute control (CLIENT-SESSION-17 Part A) — verbatim from `SportAttributesFields`.
 * Stores a real `boolean` via the shared `Switch`. */
export function BooleanField({ label, value, onChange, requiredHint }: AttributeControlBaseProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="mb-0">{label}</Label>
      <Switch
        aria-label={label}
        checked={typeof value === 'boolean' ? value : false}
        onCheckedChange={onChange}
      />
      {requiredHint}
    </div>
  );
}
