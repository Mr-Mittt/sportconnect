import { IconChevronDown, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { SessionCard } from '@/shared/components/SessionCard';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { cn } from '@/shared/lib/utils';
import type { Session } from '@/shared/types/session';
import type { SportKey, SportProfile } from '@/shared/types/sport';

interface GroupSessionShortcutProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  /** Today's `ONGOING` then `SCHEDULED` sessions of the group, in the order they are shown. */
  sessions: Session[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** The "+" card: opens the create form in group mode. */
  onCreate: () => void;
  /** The "See all" link in the header: opens the group's Sessions tab (CLIENT-GROUP-SESSION-2). */
  onSeeAll: () => void;
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
}

const CARD_SLOT = 'w-62 shrink-0 snap-start max-[480px]:w-[78vw]';

/**
 * CLIENT-GROUP-SESSION-1: the "Session" shortcut under the post composer of a group's Posts tab. A collapsible section,
 * **expanded by default** (the state is local to this component and resets on a reload), holding a horizontal
 * scroll-snap row of today's ongoing and scheduled sessions (the standalone `SessionCard`, with the joined count only
 * for a group session) and, always last, a dashed "+" card that opens the create form. With no session today the row
 * is the "+" alone; a failed load shows a retry line and keeps the "+" usable. The row is a focusable region so the
 * keyboard can scroll it; every card is reachable by Tab.
 */
export function GroupSessionShortcut({
  sessions,
  isLoading,
  isError,
  onRetry,
  onCreate,
  onSeeAll,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  i18nOverridePrefix,
}: GroupSessionShortcutProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);
  const [isOpen, setIsOpen] = useState(true);
  const hasCards = sessions.length > 0;
  const contentId = 'group-session-shortcut-content';

  return (
    <section aria-label={t('sessionShortcut.title')}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={() => setIsOpen((open) => !open)}
          className="flex cursor-pointer items-center gap-1.5 rounded-md p-1 text-sm font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          <IconChevronDown
            className={cn('size-4 text-text-secondary transition-transform', !isOpen && '-rotate-90')}
            aria-hidden="true"
          />
          {t('sessionShortcut.title')}
        </button>
        {/* Right-aligned, always visible (also while collapsed): a link to the Sessions tab, which is a tab switch, not a route. */}
        <button
          type="button"
          aria-label={t('sessionShortcut.seeAllLabel')}
          onClick={onSeeAll}
          className="cursor-pointer rounded-md p-1 text-2sm font-medium text-text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        >
          {t('sessionShortcut.seeAll')}
        </button>
      </div>

      {isOpen && (
        <div id={contentId} className="mt-1.5">
          {isError && (
            <div role="alert" className="mb-1.5 flex items-center gap-2 px-1 text-2sm text-text-danger">
              {t('sessionShortcut.error')}
              <button
                type="button"
                onClick={onRetry}
                className="cursor-pointer text-text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              >
                {t('sessionShortcut.retry')}
              </button>
            </div>
          )}
          {/* A scrollable region must be focusable so the keyboard can scroll it (WCAG 2.1.1); the cards inside are focusable too. */}
          <div
            role="region"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-label={t('sessionShortcut.listLabel')}
            aria-busy={isLoading}
            className="flex snap-x snap-proximity gap-2.5 overflow-x-auto rounded-lg bg-surface-2 px-0.5 pb-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {isLoading && (
              <>
                <div role="status" aria-label={t('sessionShortcut.loading')} className={cn(CARD_SLOT, 'h-36 animate-pulse rounded-xl bg-surface-1')} />
                <div aria-hidden="true" className={cn(CARD_SLOT, 'h-36 animate-pulse rounded-xl bg-surface-1')} />
              </>
            )}
            {!isLoading &&
              sessions.map((session) => (
                <div key={session.id} className={cn(CARD_SLOT, 'flex')}>
                  <SessionCard
                    session={session}
                    sportsByKey={sportsByKey}
                    currentUserId={currentUserId}
                    onViewDetails={onViewDetails}
                    onParticipationAction={onParticipationAction}
                    isParticipationActionPending={isParticipationActionPending}
                  />
                </div>
              ))}
            <button
              type="button"
              aria-label={t('sessionShortcut.createLabel')}
              onClick={onCreate}
              className={cn(
                'border-hairline flex cursor-pointer items-center justify-center rounded-xl border-dashed border-border-strong bg-surface-2 text-sm font-medium text-text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
                hasCards || isLoading ? cn(CARD_SLOT, 'min-h-36 flex-col gap-1.5') : 'min-h-24 flex-1 gap-2.5',
              )}
            >
              <IconPlus className={hasCards || isLoading ? 'size-6' : 'size-5.5'} aria-hidden="true" />
              {hasCards || isLoading ? (
                <>
                  {t('sessionShortcut.create')}
                  <span className="text-xs font-normal text-text-muted">{t('sessionShortcut.createHint')}</span>
                </>
              ) : (
                t('sessionShortcut.createToday')
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
