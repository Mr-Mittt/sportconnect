import { IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { GROUP_SESSION_STATUS_OPTIONS, type GroupSessionSection } from '@/features/session/groupSessionStatuses';
import { formatSessionDayLabel } from '@/features/session/groupSessionsByDate';
import { LoadMoreButton } from '@/features/session/components/LoadMoreButton';
import type { SessionHistoryDate } from '@/features/session/types';
import { EmptyHint } from '@/shared/components/EmptyHint';
import { SessionCard } from '@/shared/components/SessionCard';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { Session, SessionStatus } from '@/shared/types/session';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Button } from '@/shared/ui/button';
import { GroupSessionsSection } from './GroupSessionsSection';
import { SessionStatusFilter } from './SessionStatusFilter';

interface LoadState {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export interface GroupSessionsTabViewProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  statuses: Record<GroupSessionSection, readonly SessionStatus[]>;
  onStatusesChange: (section: GroupSessionSection, statuses: SessionStatus[]) => void;
  today: LoadState & { sessions: Session[] };
  others: LoadState & { sessions: Session[]; hasMore: boolean; isFetchingMore: boolean; onLoadMore: () => void };
  history: LoadState & {
    dates: SessionHistoryDate[];
    hasMore: boolean;
    isFetchingMore: boolean;
    onLoadMore: () => void;
    expandedDates: ReadonlySet<string>;
    onToggleDate: (date: string) => void;
  };
  /** `yyyy-MM-dd` of the viewer's today, for the "Today" label of a history date (a prop so stories and tests are deterministic). */
  todayKey: string;
  onCreate: () => void;
  /** Renders one expanded history date's sessions (a render prop: the one connected piece, `GroupHistoryDateSessions`). */
  renderDateSessions: (date: string, dateLabel: string) => ReactNode;
  sportsByKey: Record<SportKey, SportProfile>;
  currentUserId: string;
  onViewDetails: (sessionId: number) => void;
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;
}

/**
 * CLIENT-GROUP-SESSION-2: the presentational body of a group's Sessions tab (`GroupSessionsTab` wires the data). A "Create
 * session" button, then three collapsible sections, each with a right-aligned multi-select status filter (owner, 2026-11-20):
 * **Today's** (playing time overlaps today; open), **Others** (from tomorrow on; collapsed) and **History** (finished sessions
 * grouped by end date, one row per date as `<date> (<count>)`; open, with yesterday's row expanded and the rest collapsed, and
 * a "Load more" for the next 30 days). A section with no status selected shows a hint and asks for nothing.
 */
export function GroupSessionsTabView({
  statuses,
  onStatusesChange,
  today,
  others,
  history,
  todayKey,
  onCreate,
  renderDateSessions,
  sportsByKey,
  currentUserId,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  i18nOverridePrefix,
}: GroupSessionsTabViewProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);

  const filter = (section: GroupSessionSection, label: string) => (
    <SessionStatusFilter
      sectionLabel={label}
      options={GROUP_SESSION_STATUS_OPTIONS[section]}
      selected={statuses[section]}
      onChange={(selected) => onStatusesChange(section, selected)}
    />
  );

  /** The body every section shares while there is nothing to list: no status chosen, loading, a failed load, or an empty list. */
  const placeholder = (section: GroupSessionSection, state: LoadState, isEmpty: boolean, emptyText: string): ReactNode => {
    if (statuses[section].length === 0) return <EmptyHint>{t('sessionsTab.noStatus')}</EmptyHint>;
    if (state.isLoading) return <p className="text-2sm text-text-muted">{t('sessionsTab.loading')}</p>;
    if (state.isError) {
      return (
        <div role="alert" className="flex items-center gap-2 px-1 text-2sm text-text-danger">
          {t('sessionsTab.error')}
          <button
            type="button"
            onClick={state.onRetry}
            className="cursor-pointer text-text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {t('sessionsTab.retry')}
          </button>
        </div>
      );
    }
    return isEmpty ? <EmptyHint>{emptyText}</EmptyHint> : null;
  };

  const cards = (sessions: Session[]) => (
    <div className="flex flex-col gap-2.5">
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          sportsByKey={sportsByKey}
          currentUserId={currentUserId}
          onViewDetails={onViewDetails}
          onParticipationAction={onParticipationAction}
          isParticipationActionPending={isParticipationActionPending}
        />
      ))}
    </div>
  );

  const showTodayList = statuses.today.length > 0 && !today.isLoading && !today.isError;
  const showOthersList = statuses.others.length > 0 && !others.isLoading && !others.isError;
  const showHistoryList = statuses.history.length > 0 && !history.isLoading && !history.isError;
  // Every day of the window has a row, with its count, 0 included, whether or not the group has any finished session (owner, 2026-11-20).

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onCreate}>
          <IconPlus className="size-4" aria-hidden="true" />
          {t('sessionsTab.create')}
        </Button>
      </div>

      <GroupSessionsSection title={t('sessionsTab.today.title')} defaultOpen filter={filter('today', t('sessionsTab.today.title'))}>
        {placeholder('today', today, today.sessions.length === 0, t('sessionsTab.today.empty'))}
        {showTodayList && cards(today.sessions)}
      </GroupSessionsSection>

      <GroupSessionsSection
        title={t('sessionsTab.others.title')}
        defaultOpen={false}
        filter={filter('others', t('sessionsTab.others.title'))}
      >
        {placeholder('others', others, others.sessions.length === 0, t('sessionsTab.others.empty'))}
        {showOthersList && cards(others.sessions)}
        {showOthersList && others.hasMore && (
          <LoadMoreButton isFetching={others.isFetchingMore} onClick={others.onLoadMore} ariaLabel={t('sessionsTab.others.loadMore')} />
        )}
      </GroupSessionsSection>

      <GroupSessionsSection title={t('sessionsTab.history.title')} defaultOpen filter={filter('history', t('sessionsTab.history.title'))}>
        {placeholder('history', history, false, '')}
        {showHistoryList && history.dates.length > 0 && (
          <div className="flex flex-col gap-3">
            {history.dates.map(({ date, count }) => {
              const isExpanded = history.expandedDates.has(date);
              const dateLabel = formatSessionDayLabel(date, todayKey);
              const rowLabel = `${dateLabel} (${count})`;
              return (
                <div key={date}>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? t('sessionsTab.history.collapse', { label: rowLabel }) : t('sessionsTab.history.expand', { label: rowLabel })}
                    onClick={() => history.onToggleDate(date)}
                    className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-none p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                  >
                    {isExpanded ? (
                      <IconChevronDown className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                    ) : (
                      <IconChevronRight className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                    )}
                    <span className="shrink-0 whitespace-nowrap text-2xs font-medium text-text-muted">{rowLabel}</span>
                    <div className="h-px flex-1 bg-border" />
                  </button>
                  {isExpanded && (
                    <div className="mt-3">
                      {count === 0 ? <EmptyHint>{t('sessionsTab.history.emptyDate')}</EmptyHint> : renderDateSessions(date, dateLabel)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {showHistoryList && history.hasMore && (
          <LoadMoreButton isFetching={history.isFetchingMore} onClick={history.onLoadMore} ariaLabel={t('sessionsTab.history.loadMore')} />
        )}
      </GroupSessionsSection>
    </div>
  );
}
