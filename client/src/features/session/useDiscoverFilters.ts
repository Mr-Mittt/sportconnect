import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import type { DiscoverFilters } from './discoverParams';
import { discoverQuickDates, formatDiscoverDateLabel, formatDiscoverDateOptionLabel, MAX_DISCOVER_DATES } from './discoverDateLabel';
import { useDiscoverBaseFilters } from './useDiscoverBaseFilters';
import { useDiscoverDateCounts } from './hooks/useDiscoverDateCounts';
import { buildDiscoverDateSections, useDiscoverDateSections } from './hooks/useDiscoverDateSections';

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * CLIENT-SESSION-22's Discover data boundary for the **full `/matches` page** — real multi-date
 * browsing (Date/Location/Time pills + collapsible per-date sections). `useDiscoverModalFilters`
 * is the rail modal's own, simpler sibling (today-only, no date picker, no counts) — the two share
 * `useDiscoverBaseFilters` (search/location/time) so neither duplicates that state, but diverge on
 * `date` because the two surfaces now have genuinely different scope (CLIENT-SESSION-22 delta,
 * 2026-09-22): the modal exists to get someone into a session *right now*, the full page is where
 * real multi-day browsing/filtering belongs — a "Discover more" link on the modal sends anyone who
 * wants more than today to this hook's own page.
 *
 * `sportId` is the hosting page's active sport pill (`undefined` = every active sport).
 */
export function useDiscoverFilters(sportId: number | undefined, enabled: boolean) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const base = useDiscoverBaseFilters(sportId, enabled);

  // --- Date filter ---
  const [selectedDates, setSelectedDates] = useState<string[]>([today]);
  const sortedDates = useMemo(() => [...selectedDates].sort(), [selectedDates]);
  const earliestDate = sortedDates[0] ?? today;

  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set([today]));
  // Re-expand to just the (new) earliest date whenever it changes — see useDiscoverBaseFilters'
  // own doc comment for why this is state, not a ref.
  const [prevEarliestDate, setPrevEarliestDate] = useState(earliestDate);
  if (prevEarliestDate !== earliestDate) {
    setPrevEarliestDate(earliestDate);
    setExpandedDates(new Set([earliestDate]));
  }

  const toggleDate = (date: string) => {
    setSelectedDates((current) => {
      if (current.includes(date)) {
        const next = current.filter((d) => d !== date);
        return next.length > 0 ? next : [today]; // never allow zero selection
      }
      if (current.length >= MAX_DISCOVER_DATES) return current;
      return [...current, date];
    });
  };
  const toggleExpanded = (date: string) => {
    setExpandedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  // --- Assembled filters + queries ---
  const filters: DiscoverFilters = { sportId, ...base.filters };

  // Only send an explicit `date` list to /discover/counts once the caller has actually touched
  // the Date filter — until then this mirrors the server's own today+7-days default window.
  const hasExplicitDateSelection = !arraysEqual(sortedDates, [today]);
  const countsQuery = useDiscoverDateCounts(
    filters,
    hasExplicitDateSelection ? sortedDates : undefined,
    enabled,
  );
  const countsByDate = useMemo(
    () => new Map((countsQuery.data?.counts ?? []).map((c) => [c.date, c.count])),
    [countsQuery.data],
  );

  const sectionQueries = useDiscoverDateSections(sortedDates, expandedDates, filters, enabled);
  const labelsByDate = useMemo(
    () => new Map(sortedDates.map((date) => [date, formatDiscoverDateLabel(date, today)])),
    [sortedDates, today],
  );
  const dateSections = buildDiscoverDateSections(
    sortedDates,
    labelsByDate,
    countsByDate,
    expandedDates,
    sectionQueries,
  );
  const loadMoreSection = (date: string) => sectionQueries.get(date)?.fetchNextPage();

  return {
    ...base,

    // Date pill
    selectedDates: sortedDates,
    toggleDate,
    quickDates: discoverQuickDates(),
    dateLabel: (date: string) => formatDiscoverDateLabel(date, today),
    dateOptionLabel: (date: string) => formatDiscoverDateOptionLabel(date, today),
    isDateSelectionAtMax: sortedDates.length >= MAX_DISCOVER_DATES,
    toggleExpanded,

    // Results
    dateSections,
    isCountsLoading: countsQuery.isLoading,
    isCountsError: countsQuery.isError,
    loadMoreSection,
  };
}
