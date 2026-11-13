import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

const SIZE_CLASS = {
  '2xs': 'text-2xs',
  xs: 'text-xs',
  '2sm': 'text-2sm',
} as const;

interface EmptyHintProps {
  children: ReactNode;
  /** Text size: `2xs` inside compact sections and dropdowns, `xs`, or `2sm` (the default) for a list or panel. */
  size?: keyof typeof SIZE_CLASS;
  /** Spacing only (padding, margin); never an alignment: an empty hint is always centered. */
  className?: string;
}

/**
 * The one way the app shows an empty-state hint ("No comments yet.", "No friends found.", "Nothing here
 * yet."): muted text, **always centered** (owner's rule, 2026-11-13, whole app). Use it for every "there is
 * nothing to list" line instead of a bare `<p className="text-text-muted">`, so a new one cannot drift back
 * to left-aligned. A collapsible section whose body is empty also shows its hint while collapsed
 * (see `SessionResultSection`, `FriendRail`).
 */
export function EmptyHint({ children, size = '2sm', className }: EmptyHintProps) {
  return <p className={cn('text-center text-text-muted', SIZE_CLASS[size], className)}>{children}</p>;
}
