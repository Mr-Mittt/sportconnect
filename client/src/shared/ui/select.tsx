import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/*
 * Minimal native <select>, hand-written (not a Radix primitive — see
 * AUTH-1's summary for why the shadcn CLI is avoided) and styled to match
 * Input's tokens. A native element is deliberate here: full keyboard/screen
 * reader support for free, and every current use case (a handful of
 * options) doesn't need Radix's custom-popover Select.
 */
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-auto w-full rounded-lg border-hairline border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text-primary transition-[box-shadow,border-color] outline-none',
        'focus-visible:border-border-accent focus-visible:ring-3 focus-visible:ring-bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Select };
