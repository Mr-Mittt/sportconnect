import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/** Loading placeholder block (shadcn's `Skeleton`, restyled to our tokens —
 * `surface-1` is already the theme's "subtle" surface, no new token needed). */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('animate-pulse rounded-md bg-surface-1', className)} {...props} />
  );
}
