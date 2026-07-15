import type { TrendingHashtag } from '@/shared/types/rail';

interface TrendingHashtagsProps {
  hashtags: TrendingHashtag[];
  onHashtagClick: (tag: string) => void;
}

/**
 * Right-rail "Trending" card. Deliberately global — not filtered by
 * activeSport (epic open question #1, resolved: mockup parity; FEED-6's real
 * endpoint owns any future filtering). Rows render in caller order; the
 * component never re-sorts. Mock-backed until FEED-6 swaps the data source.
 */
export function TrendingHashtags({ hashtags, onHashtagClick }: TrendingHashtagsProps) {
  return (
    <section
      aria-label="Trending hashtags"
      className="border-hairline rounded-xl border-border bg-surface-2 p-3.5"
    >
      <h2 className="mb-2.5 text-2sm font-medium text-text-primary">Trending</h2>

      {hashtags.length === 0 ? (
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
