import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/*
 * shadcn/ui-style Textarea, same token/focus-ring conventions as Input —
 * the multi-line counterpart for GRP-2's rules/schedule fields.
 *
 * Wrapped in forwardRef (CHAT-15 chat compose/edit boxes, found live): React
 * 18 silently drops a `ref` passed to a plain function component — it never
 * reaches the underlying <textarea> DOM node, so a consumer hook reading
 * `ref.current` (e.g. an auto-resize-to-content effect) sees `null` forever
 * and its effect becomes a permanent no-op, with no error or warning
 * surfaced anywhere a test would catch it.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          'min-h-20 w-full resize-y rounded-lg border-hairline border-border-strong bg-surface-2 px-3 py-2.5 text-sm text-text-primary transition-[box-shadow,border-color] outline-none placeholder:text-text-muted',
          'focus-visible:border-border-accent focus-visible:ring-3 focus-visible:ring-bg-accent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);

export { Textarea };
