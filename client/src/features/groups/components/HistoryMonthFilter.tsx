import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { formatHistoryMonth } from '@/features/session/groupHistoryMonth';
import { useOverridableText } from '@/shared/lib/useOverridableText';

interface HistoryMonthFilterProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  /** The month shown, `yyyy-MM`. */
  month: string;
  /** False at the group's first month (nothing finished before the group existed). */
  canGoPrevious: boolean;
  /** False at yesterday's month (the current month has no finished day yet). */
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

const ARROW =
  'flex size-6 cursor-pointer items-center justify-center rounded-md text-text-secondary hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * CLIENT-GROUP-UI-1: the month filter in the header of the Sessions tab's History section: a previous arrow, the month's name and
 * a next arrow. Controlled (the data hook owns the month and the limits); each arrow is disabled at its limit. The label is a
 * polite live region so a screen reader hears the month change.
 */
export function HistoryMonthFilter({ month, canGoPrevious, canGoNext, onPrevious, onNext, i18nOverridePrefix }: HistoryMonthFilterProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);
  return (
    <div role="group" aria-label={t('sessionsTab.history.monthFilter')} className="flex items-center gap-0.5">
      <button type="button" aria-label={t('sessionsTab.history.previousMonth')} disabled={!canGoPrevious} onClick={onPrevious} className={ARROW}>
        <IconChevronLeft className="size-3.5" aria-hidden="true" />
      </button>
      <span aria-live="polite" className="min-w-24 text-center text-2xs font-medium text-text-secondary">
        {formatHistoryMonth(month)}
      </span>
      <button type="button" aria-label={t('sessionsTab.history.nextMonth')} disabled={!canGoNext} onClick={onNext} className={ARROW}>
        <IconChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
