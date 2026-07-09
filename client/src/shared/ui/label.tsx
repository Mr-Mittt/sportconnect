import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/*
 * shadcn/ui-style Label, hand-written as a plain semantic <label> — Radix's
 * Label primitive's only real value-add (click-to-focus association) is
 * already native browser behavior via htmlFor, so no Radix dependency is
 * needed here (unlike Avatar, which genuinely needs Radix's fallback-timing
 * behavior).
 */
function Label({ className, ...props }: React.ComponentProps<'label'>) {
  /* eslint-disable jsx-a11y/label-has-associated-control -- htmlFor arrives via
     ...props (spread), which the rule can't statically see; the labelComponents
     config option only fixes call sites, not this definition. */
  return (
    <label
      data-slot="label"
      className={cn(
        'mb-1.5 block text-xs font-medium text-text-secondary select-none',
        className,
      )}
      {...props}
    />
  );
  /* eslint-enable jsx-a11y/label-has-associated-control */
}

export { Label };
