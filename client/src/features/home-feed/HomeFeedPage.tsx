import { useMemo, useState } from 'react';
import { SportSwitcher } from '@/shared/components/SportSwitcher';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Feed } from './components/Feed';
import { GroupBroadcasts } from './components/GroupBroadcasts';
import { TrendingHashtags } from './components/TrendingHashtags';
import { UpcomingMatches } from './components/UpcomingMatches';
import { useHomeFeedData } from './useHomeFeedData';

// Callback-only entry points in this epic — the destinations (hashtag results,
// Matches screen, broadcast detail, add-sport flow) are future tickets.
const noop = () => {};

/**
 * Assembles the Home Feed (HF-7): SportSwitcher above a two-column grid —
 * feed left, rail (Upcoming → Trending → Broadcasts) right, stacking below md
 * (768px; HF-8 hardens responsiveness). TopBar/NavTabs come from AppShell, not
 * here. activeSport is page-local by design — move it to the Zustand store
 * when a second page needs it (client/CLAUDE.md).
 */
export function HomeFeedPage() {
  const [activeSport, setActiveSport] = useState<SportKey | 'all'>('all');
  const { data, toggleLike } = useHomeFeedData();

  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(data.sportProfiles.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [data.sportProfiles],
  );

  return (
    <main className="py-4">
      {/* The rail cards introduce h2s; give the page its h1 for AT users (HF-8) */}
      <h1 className="sr-only">Home Feed</h1>
      <div className="mb-4">
        <SportSwitcher
          sports={data.sportProfiles}
          active={activeSport}
          onChange={setActiveSport}
          onAddSport={noop}
        />
      </div>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0">
          <Feed
            posts={data.posts}
            activeSport={activeSport}
            sportsByKey={sportsByKey}
            onToggleLike={toggleLike}
            onHashtagClick={noop}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          <UpcomingMatches
            matches={data.upcomingMatches}
            activeSport={activeSport}
            sportsByKey={sportsByKey}
            onSeeAll={noop}
            onSelectMatch={noop}
          />
          <TrendingHashtags hashtags={data.hashtags} onHashtagClick={noop} />
          <GroupBroadcasts broadcasts={data.broadcasts} onBroadcastClick={noop} />
        </div>
      </div>
    </main>
  );
}
