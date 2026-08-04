import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/*
 * shadcn/ui-style Button, restyled to the design tokens (see client/CLAUDE.md —
 * primitives are copied into the repo and themed, never left on shadcn defaults).
 */
const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg text-2sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-hairline border-border bg-surface-1 text-text-primary hover:bg-surface-2',
        outline: 'border-hairline border-border-strong bg-transparent text-text-primary hover:bg-surface-1',
        ghost: 'text-text-secondary hover:bg-surface-1 hover:text-text-primary',
        // Solid CTA fill (design-reference-login.html's submit button). Uses
        // accent-solid, not border-accent — border-accent's #378add fails
        // WCAG AA contrast with white text (3.59:1); see index.css (AUTH-6).
        primary: 'bg-accent-solid text-white hover:opacity-90',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * `forwardRef` (not a plain function component) — required for `asChild` compositions where a
 * Radix trigger (`DropdownMenuTrigger`, `PopoverTrigger`, etc.) needs a real DOM ref on the
 * rendered element to measure its position for floating content. Every existing `asChild`
 * trigger in this codebase happened to wrap a plain native `<button>` instead of this component,
 * which is why this gap went unnoticed until CLIENT-SESSION-5 tried `DropdownMenuTrigger asChild`
 * around `Button` for the first time — Radix's Popper silently measured the wrong (or no) anchor
 * without a forwarded ref, rendering its content off-screen ("outside of the viewport" in a real
 * click-and-observe test), which looks identical to "never opens" to anyone testing by eye.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? type : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

/**
 * `Button`'s disabled treatment is opacity-fade by default (client/CLAUDE.md),
 * but any "Post"-style composer button (FEED-2's comment composer/reply,
 * FEED-3's post composer) uses a distinct muted-gray-to-solid-blue swap per
 * the design references — overriding just the `disabled:` classes keeps this
 * on the shared primitive rather than hand-rolling a second button. Hoisted
 * here once a second call site needed it (FEED-2's own note on FEED-3).
 */
export const POST_BUTTON_DISABLED_OVERRIDE =
  'disabled:bg-border disabled:text-text-muted disabled:opacity-100';

export { Button };
