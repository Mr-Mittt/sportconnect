import { Skeleton } from '@/shared/ui/skeleton';
import type { TrendingHashtag } from '@/shared/types/rail';

interface TrendingHashtagsProps {
  hashtags: TrendingHashtag[];
  onHashtagClick: (tag: string) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

/**
 * Right-rail "Trending" card. Deliberately global — not filtered by
 * activeSport (epic open question #1, resolved: mockup parity; FEED-6's real
 * endpoint owns any future filtering). Rows render in caller order; the
 * component never re-sorts. Real (FEED-6).
 *
 * FEED-8: `isLoading` renders 2 row skeletons; `isError` renders a retry
 * block in place of the row list (still inside the card's header/border, so
 * the section itself never disappears).
 */
export function TrendingHashtags({
  hashtags,
  onHashtagClick,
  isLoading,
  isError,
  onRetry,
}: TrendingHashtagsProps) {
  return (
    <section
      aria-label="Trending hashtags"
      className="border-hairline rounded-xl border-border bg-surface-2 p-3.5"
    >
      <h2 className="mb-2.5 text-2sm font-medium text-text-primary">Trending</h2>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-start gap-1.5 py-1">
          <p className="text-xs text-text-danger">Couldn't load trending hashtags.</p>
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer rounded border-hairline border-border px-2.5 py-1 text-xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            Retry
          </button>
        </div>
      ) : hashtags.length === 0 ? (
        <div className="py-2 text-xs text-text-muted">Nothing trending right now.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {hashtags.map((hashtag) => (
            <button
              key={hashtag.tag}
              type="button"
              onClick={() => onHashtagClick(hashtag.tag)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            >
              <span className="truncate text-2sm text-text-accent">{hashtag.tag}</span>
              <span className="shrink-0 text-xs text-text-muted">{hashtag.postCount} posts</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
