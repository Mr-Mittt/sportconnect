import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState, type ComponentProps } from 'react';
import { Input } from '@/shared/ui/input';

interface PasswordInputProps
  extends Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange' | 'autoComplete' | 'className'> {
  value: string;
  onChange: (value: string) => void;
  /** With `hideLabel`, adds the show/hide toggle; without them the field has no toggle. */
  showLabel?: string;
  hideLabel?: string;
}

/** A password field with its own optional show/hide toggle; every instance reveals independently of the others. */
export function PasswordInput({ value, onChange, showLabel, hideLabel, ...inputProps }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const hasToggle = showLabel !== undefined && hideLabel !== undefined;
  return (
    <div className="relative">
      <Input
        {...inputProps}
        type={isVisible ? 'text' : 'password'}
        autoComplete="new-password"
        className={hasToggle ? 'pr-10' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hasToggle && (
        <button
          type="button"
          aria-label={isVisible ? hideLabel : showLabel}
          onClick={() => setIsVisible((prev) => !prev)}
          className="absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer p-2 text-text-muted"
        >
          {isVisible ? (
            <IconEyeOff className="size-4" aria-hidden="true" />
          ) : (
            <IconEye className="size-4" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
