import type { ReactNode } from 'react';
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleLabelTrigger,
} from '@/shared/ui/collapsible';

interface GroupSessionsSectionProps {
  title: string;
  /** Whether the section starts open (Today's and History do, Others does not: owner, 2026-11-20). The state is local. */
  defaultOpen: boolean;
  /** The status filter, right-aligned in the header next to the chevron. */
  filter: ReactNode;
  children: ReactNode;
}

/**
 * CLIENT-GROUP-SESSION-2: one collapsible section of a group's Sessions tab. The header is the title (a toggle), then, pushed
 * to the right, the section's filter and the chevron; the filter sits to the left of the chevron, as in every session section
 * (`client/CLAUDE.md`). The body is whatever the caller renders (a list of cards, a hint, the history dates).
 */
export function GroupSessionsSection({ title, defaultOpen, filter, children }: GroupSessionsSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} asChild>
      <section aria-label={title}>
        <div className="flex flex-wrap items-center gap-2 p-1">
          <CollapsibleLabelTrigger className="gap-1.5 p-1 text-sm font-medium text-text-primary">{title}</CollapsibleLabelTrigger>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
            {filter}
            <CollapsibleChevron />
          </div>
        </div>
        <CollapsibleContent className="mt-1.5 flex flex-col gap-2.5">{children}</CollapsibleContent>
      </section>
    </Collapsible>
  );
}
