import type { ComponentProps } from 'react';
import { Input } from '@/shared/ui/input';

const ALLOWED_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Escape',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

function handleDigitsOnlyKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.ctrlKey || event.metaKey || event.altKey || ALLOWED_KEYS.has(event.key)) return;
  if (!/^[0-9]$/.test(event.key)) event.preventDefault();
}

/**
 * A plain `type="number"` input for the form's numeric fields (Duration, Taken/Open/Male/Female
 * slot), paste-guarded and keystroke-guarded: a native number input still accepts `e`/`+`/`-`/`.`
 * from the keyboard and doesn't validate a pasted string at all, so this rejects any key that isn't
 * a digit or a navigation key, and any paste that isn't purely digits. Moved out of
 * `CreateSessionModal` (CLIENT-SESSION-34) so the create form and the detail modal's section
 * editors share it.
 */
export function DigitsOnlyInput(props: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      type="number"
      onKeyDown={handleDigitsOnlyKeyDown}
      onPaste={(event) => {
        if (!/^[0-9]+$/.test(event.clipboardData.getData('text'))) event.preventDefault();
      }}
    />
  );
}
