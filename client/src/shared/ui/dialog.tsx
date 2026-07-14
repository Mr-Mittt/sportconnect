import { IconX } from '@tabler/icons-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/*
 * shadcn/ui-style Dialog (Radix), hand-written (not CLI-generated — same
 * reasoning as dropdown-menu.tsx/AUTH-1's summary: the CLI writes to a
 * broken path on Windows) and restyled to the design tokens. Radix owns
 * focus trapping, Escape/outside-click dismissal, and scroll locking.
 */
function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn('fixed inset-0 z-50 bg-overlay', className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'shadow-card fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border-hairline border-border-strong bg-surface-2',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/**
 * Radix requires an accessible Title somewhere in Content — visually
 * stylable, or pass `className="sr-only"` when a consumer's own header
 * markup (e.g. CommentSection's post-context header) already conveys the
 * dialog's purpose visually and a plain title would be redundant.
 */
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-sm font-semibold text-text-primary', className)}
      {...props}
    />
  );
}

function DialogClose({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      className={cn(
        'cursor-pointer rounded p-1 text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
        className,
      )}
      {...props}
    >
      <IconX className="size-4" aria-hidden="true" />
    </DialogPrimitive.Close>
  );
}

export { Dialog, DialogContent, DialogTitle, DialogClose };
