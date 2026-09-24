interface LoadMoreButtonProps {
  isFetching: boolean;
  onClick: () => void;
  /** Distinguishes sibling buttons for a screen reader when several sit on one page (each expanded
   * History date row has its own) — omit where there is only ever one. */
  ariaLabel?: string;
}

/**
 * The "Load more" pill shared by every paginated list on the Matches page — extracted from
 * `DiscoverResultsList` (CLIENT-SESSION-23) once the Upcoming and History sections needed the exact
 * same button, so the three don't drift.
 */
export function LoadMoreButton({ isFetching, onClick, ariaLabel }: LoadMoreButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={isFetching}
      className="cursor-pointer self-center rounded-lg border-hairline border-border px-3 py-1.5 text-2xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-60"
    >
      {isFetching ? 'Loading…' : 'Load more'}
    </button>
  );
}
