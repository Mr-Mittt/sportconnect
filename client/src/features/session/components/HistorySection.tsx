import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { formatSessionDayLabel } from '../groupSessionsByDate';
import type { SessionHistoryDate } from '../types';
import { LoadMoreButton } from './LoadMoreButton';

interface HistorySectionProps {
  /** Most-recent-first, as `GET /sessions/history?dateCount=` returns them (loaded pages so far). */
  dates: SessionHistoryDate[];
  /** `yyyy-MM-dd` for "now" in the viewer's zone — drives the "Today" special case. A prop (not read
   * from the clock here) so the section renders deterministically in stories/tests. */
  today: string;
  expandedDates: ReadonlySet<string>;
  onToggleDate: (date: string) => void;
  isLoading: boolean;
  isError: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  /** Pages further back — the next `dateCount` distinct history dates via the `before` cursor. */
  onLoadMore: () => void;
  /** Renders one expanded date's own session list. A render prop rather than a hook call here so
   * this component stays presentational and controlled: the page passes `HistoryDateSessions`, the
   * one connected component in this section (see its doc comment for why it has to be one). */
  renderDateSessions: (date: string, dateLabel: string) => ReactNode;
}

/**
 * CLIENT-SESSION-23 — the Matches page's "History" section (`GET /sessions/history`, backend
 * SESSION-27/43): one **collapsed-by-default** row per distinct date the caller has a
 * `CANCELLED`/`COMPLETED` session on (in the active sport), reading `<date> (<count>)` — "Sep 14,
 * 2026 (2)", "Today (1)". Expanding a row reveals that date's sessions (lazily fetched — nothing
 * loads until the first expand); a "Load more" after the last row pages further back. Not
 * date-grouped client-side any more (CLIENT-SESSION-20's history zone is retired) — the server
 * owns the bucketing, in the viewer's own zone. Independent of `UpcomingSessionsSection`.
 */
export function HistorySection({
  dates,
  today,
  expandedDates,
  onToggleDate,
  isLoading,
  isError,
  hasMore,
  isFetchingMore,
  onLoadMore,
  renderDateSessions,
}: HistorySectionProps) {
  return (
    <section aria-label="History" className="flex flex-col gap-3">
      <h2 className="text-2sm font-medium text-text-primary">History</h2>

      {isLoading && <p className="text-2sm text-text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-2sm text-text-danger">
          Couldn't load your session history.
        </p>
      )}
      {!isLoading && !isError && dates.length === 0 && (
        <p className="text-2sm text-text-muted">No session history yet.</p>
      )}
      {dates.length > 0 && (
        <div className="flex flex-col gap-3">
          {dates.map(({ date, count }) => {
            const isExpanded = expandedDates.has(date);
            const dateLabel = formatSessionDayLabel(date, today);
            const rowLabel = `${dateLabel} (${count})`;
            return (
              <div key={date}>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${rowLabel}`}
                  onClick={() => onToggleDate(date)}
                  className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-none p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                >
                  {isExpanded ? (
                    <IconChevronDown className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                  ) : (
                    <IconChevronRight className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                  )}
                  <span className="shrink-0 whitespace-nowrap text-2xs font-medium text-text-muted">
                    {rowLabel}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </button>
                {isExpanded && <div className="mt-3">{renderDateSessions(date, dateLabel)}</div>}
              </div>
            );
          })}
        </div>
      )}
      {!isLoading && !isError && hasMore && (
        <LoadMoreButton isFetching={isFetchingMore} onClick={onLoadMore} ariaLabel="Load more history dates" />
      )}
    </section>
  );
}
