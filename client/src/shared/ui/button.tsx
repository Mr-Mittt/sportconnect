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

function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      type={asChild ? type : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button };
