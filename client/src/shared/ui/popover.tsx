import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';

/*
 * shadcn/ui-style Popover (Radix), same pattern as DropdownMenu — Radix owns
 * floating position (incl. auto-flipping to the other side when there's no
 * room, e.g. a compose box near the bottom of a scroll panel), focus
 * trapping, and outside-click/Escape dismissal. Deliberately a separate
 * primitive from DropdownMenu rather than reusing it for arbitrary content
 * (CHAT-15's emoji picker): DropdownMenu's Content applies menu/menuitem
 * roving-keyboard-nav semantics meant for a list of actions, which would
 * fight a third-party widget's own internal keyboard handling (e.g. an
 * emoji grid's arrow-key navigation) rather than just getting out of the way
 * the way Popover's plain dismissible-container semantics do.
 */
function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  sideOffset = 8,
  align = 'end',
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          // pointer-events-auto: a *modal* Dialog (default `modal=true`) sets `pointer-events:
          // none` on <body> while open and restores `auto` only on its own Content node. This
          // Portal's content is a *sibling* of that Content under <body>, not a descendant, so
          // without this it inherits `none` and is visually on top but unclickable — a real bug
          // found live via CLIENT-SESSION-22's SessionDiscoverModal (both DiscoverTimeFilter and
          // DiscoverLocationFilter): the popover opens, but every click passes through to
          // whatever Dialog content sits underneath it instead.
          'shadow-menu pointer-events-auto z-50 rounded-[10px] border-hairline border-border-strong bg-surface-2 p-1.5 outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
