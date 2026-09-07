import type { ReactNode } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';

interface CollapsibleSectionProps {
  /** The section's visible title — also the accessible name of the disclosure toggle. */
  title: string;
  /** Starts expanded unless set to `false`. */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * ADMIN-5: one collapsible section of the sport admin detail panel (Sport fields / Profile
 * attributes / Session attributes). The `<h3>` wraps the trigger (WAI-ARIA accordion pattern),
 * so screen-reader heading navigation still works while the whole row is the collapse toggle —
 * same shape `SportAttributesFields`'s `GroupSection` uses.
 *
 * **`forceMount` on the content is load-bearing, not cosmetic.** Radix unmounts collapsed
 * content by default; the schema editors nested here own their draft text and a dirty-reporting
 * effect whose cleanup fires `onDirtyChange(false)`. Unmounting on collapse would silently
 * discard an in-progress edit and clear the `/admin` unsaved-changes guard. Kept mounted and
 * hidden with `data-[state=closed]:hidden` instead.
 */
export function CollapsibleSection({ title, defaultOpen = true, children }: CollapsibleSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="border-t border-border py-3 first:border-t-0">
      <h3 className="text-sm font-semibold text-text-primary">
        <CollapsibleTrigger className="py-0.5">{title}</CollapsibleTrigger>
      </h3>
      <CollapsibleContent forceMount className="pt-3 data-[state=closed]:hidden">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
