import { IconChevronDown } from '@tabler/icons-react';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/*
 * shadcn/ui-style Collapsible (Radix), hand-written (same reasoning as
 * dialog.tsx/dropdown-menu.tsx — the CLI writes to a broken path on
 * Windows), restyled to the design tokens. Radix owns the open/close state
 * machine and animation-ready data attributes; this file only adds the
 * visual chevron/rotation and token classes.
 */
function Collapsible(props: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

/**
 * Full-width header row: label content (passed as `children`) plus a
 * trailing chevron that rotates based on Radix's own `data-state` attribute
 * — no separate open/closed prop needed here, `CollapsibleTrigger` already
 * knows the parent `Collapsible`'s state.
 */
function CollapsibleTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      className={cn(
        'group flex w-full cursor-pointer items-center justify-between rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
        className,
      )}
      {...props}
    >
      {children}
      <IconChevronDown
        className="size-4 shrink-0 text-text-secondary transition-transform group-data-[state=open]:rotate-180"
        aria-hidden="true"
      />
    </CollapsiblePrimitive.CollapsibleTrigger>
  );
}

function CollapsibleContent(props: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return <CollapsiblePrimitive.CollapsibleContent data-slot="collapsible-content" {...props} />;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
