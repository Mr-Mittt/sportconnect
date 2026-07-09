import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/*
 * shadcn/ui-style Input, hand-written (not CLI-generated — see AUTH-1's
 * summary) and restyled to the design tokens per client/CLAUDE.md. Border
 * uses border-strong (not the default hairline border) and the focus ring
 * mirrors design-reference-login.html's global `input:focus` rule exactly:
 * border-accent border color + a 3px bg-accent ring.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-auto w-full rounded-lg border-hairline border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text-primary transition-[box-shadow,border-color] outline-none placeholder:text-text-muted',
        'focus-visible:border-border-accent focus-visible:ring-3 focus-visible:ring-bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
