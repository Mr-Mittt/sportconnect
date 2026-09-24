import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import { useFloatingPortalContainer } from './floatingPortalContainer';

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
  onFocusOutside,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  // CLIENT-SESSION-27/28/29 — when this Popover is nested inside this app's own Dialog, portal
  // into the Dialog's own Content node instead of the document.body default, so this content
  // becomes a real DOM descendant and stops tripping the Dialog's FocusScope trap (see
  // floatingPortalContainer.ts's doc comment for the full root cause and why this is the fix).
  // `null` outside a Dialog — Portal's own `container || document.body` fallback still applies.
  const dialogContainer = useFloatingPortalContainer();
  return (
    <PopoverPrimitive.Portal container={dialogContainer}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        sideOffset={sideOffset}
        align={align}
        // CLIENT-SESSION-32 — Radix Popper collides against the viewport only unless told
        // otherwise, but a Dialog-nested popover is *clipped* by the Dialog's `overflow-hidden`
        // Content box, which at narrow widths (375px: dialog 343px wide) is smaller than the
        // viewport — a fixed-width popover (e.g. Location's `w-72`) fit the viewport yet overhung
        // the dialog's right edge and got cut off. Making the Dialog's own Content the collision
        // boundary makes Radix shift/flip the popover to stay inside it (and feeds
        // `--radix-popover-content-available-width` below). Deliberately not "move the popover back
        // out of the Dialog" — that reintroduces the FocusScope bug (floatingPortalContainer.ts).
        // Callers can still override either prop; `undefined` outside a Dialog keeps Radix defaults.
        collisionBoundary={dialogContainer ?? undefined}
        collisionPadding={dialogContainer !== null ? 8 : undefined}
        // A Dialog-nested popover must not dismiss itself just because the *Dialog* reclaimed
        // focus. The Dialog's FocusScope focuses its own container whenever `document.activeElement`
        // is `<body>` and a node is removed — which happens mid-Tab, when a re-render lands between
        // the old field's blur and the next field's focus. That is the Dialog protecting itself, not
        // the user leaving the popover (found 2026-09-24: Time filter closed on Tab out of Hour).
        // Any other outside focus still dismisses as before.
        onFocusOutside={(event) => {
          onFocusOutside?.(event);
          if (dialogContainer !== null && event.target === dialogContainer) {
            event.preventDefault();
          }
        }}
        className={cn(
          // pointer-events-auto: a *modal* Dialog (default `modal=true`) sets `pointer-events:
          // none` on <body> while open and restores `auto` only on its own Content node. Kept as
          // a defensive no-op even now that a Dialog-nested Popover portals into that Content
          // node (inheriting `pointer-events: auto` naturally as a descendant) — this still
          // matters for any Popover portaled to document.body with no Dialog ancestor at all. See
          // CLIENT-SESSION-22's SessionDiscoverModal for the bug this was originally found in.
          // CLIENT-SESSION-32: never wider than the room left inside the collision boundary (the
          // Dialog box when nested in one, the viewport otherwise), so a fixed `w-*` shrinks on
          // very narrow screens instead of overhanging. A caller's own `max-w-*` wins via cn().
          'max-w-[var(--radix-popover-content-available-width)]',
          'shadow-menu pointer-events-auto z-50 rounded-[10px] border-hairline border-border-strong bg-surface-2 p-1.5 outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
