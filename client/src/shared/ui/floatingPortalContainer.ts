import * as React from 'react';

/**
 * CLIENT-SESSION-27/28/29 — the fix for the whole "Popover portaled outside a Dialog's own DOM
 * subtree gets its focus/typing fought by the Dialog's `FocusScope`" bug family. Root cause
 * (`@radix-ui/react-focus-scope`'s `handleFocusIn`/`handleFocusOut`): a trapped `FocusScope`
 * redirects focus back inside on every `focusin`/`focusout` whose target isn't
 * `container.contains(target)` — `container` being the Dialog's own Content DOM node. A
 * `Popover`'s default Portal renders into `document.body`, a *sibling* of that Content node, so
 * every click/focus into the popover looks like "focus escaped the boundary" and gets yanked
 * back — this is what broke `DiscoverLocationFilter`'s search input (CLIENT-SESSION-28) and
 * `DiscoverTimeFilter`'s Hour/Minute inputs (CLIENT-SESSION-29 item 5), and this fix resolves
 * both, confirmed live. CLIENT-SESSION-27's Escape-cascades bug is a *different* mechanism
 * (`@radix-ui/react-dismissable-layer`'s global mount-order layer stack, not DOM containment) —
 * this change does not touch it; it stays open as its own ticket.
 *
 * Fix: `DialogContent` provides its own Content DOM node through this context;
 * `PopoverContent` (if rendered inside one) portals into that node via `Popover.Portal`'s own
 * `container` prop instead of the `document.body` default — making the popover a real DOM
 * *descendant* of the Dialog's Content, so `container.contains(target)` is true and the trap
 * never fires. `null` (the default, and what every non-Dialog usage sees) falls through to
 * `Portal`'s own `container || document.body` fallback, so this is a no-op everywhere a
 * `Popover` isn't nested inside this app's own `Dialog`.
 */
export const FloatingPortalContainerContext = React.createContext<HTMLElement | null>(null);

export function useFloatingPortalContainer(): HTMLElement | null {
  return React.useContext(FloatingPortalContainerContext);
}
