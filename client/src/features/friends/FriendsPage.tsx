import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/app/authStore';
import { GroupBroadcasts } from '@/shared/components/GroupBroadcasts';
import { TrendingHashtags } from '@/shared/components/TrendingHashtags';
import { UpcomingMatches } from '@/shared/components/UpcomingMatches';
import { useGroupBroadcasts } from '@/shared/hooks/useGroupBroadcasts';
import { useSportProfiles } from '@/shared/hooks/useSportProfiles';
import { useTrendingHashtags } from '@/shared/hooks/useTrendingHashtags';
import { useUpcomingMatches } from '@/shared/hooks/useUpcomingMatches';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { FriendChatPanel } from './components/FriendChatPanel';
import { FriendProfilePanel } from './components/FriendProfilePanel';
import { FriendRail } from './components/FriendRail';
import { useFriendsPageData } from './useFriendsPageData';

const noop = () => {};

/**
 * FRIEND-1's page assembly: `AppShell` already renders TopBar/NavTabs (this
 * page only assembles the content area, same convention HF-7 established).
 * Right rail (Upcoming/Trending/Broadcasts) is unchanged from Home
 * Feed/Groups — these three hooks are page-independent already, no
 * dedicated mega page-data hook needed for them here.
 *
 * `UpcomingMatches` is given `activeSport="all"` unconditionally — the
 * design reference's friends-view renders its Upcoming rail unfiltered
 * (`renderUpcoming('upcoming-friends')` with no sport-filter argument),
 * unlike Home Feed/Groups which filter by the shared `activeSport`. This
 * page has no sport switcher at all.
 *
 * `FriendContent` (profile + chat) is keyed by `selectedPersonId` so both
 * panels remount on every selection change — resets `FriendProfilePanel`'s
 * local Achievements-collapsed toggle, and (since CHAT-9) is what drives
 * `FriendChatPanel`'s `useDirectChatData` WebSocket connect/disconnect per
 * person, same "remount via key" precedent `GroupChatTab` uses per group.
 */
export function FriendsPage() {
  const navigate = useNavigate();
  const data = useFriendsPageData();
  const user = useAuthStore((state) => state.user)!;

  const upcomingMatchesQuery = useUpcomingMatches();
  const hashtagsQuery = useTrendingHashtags();
  const broadcastsQuery = useGroupBroadcasts();
  const sportProfilesQuery = useSportProfiles();
  const sportsByKey = useMemo(
    () =>
      Object.fromEntries(sportProfilesQuery.data.map((sport) => [sport.key, sport])) as Record<
        SportKey,
        SportProfile
      >,
    [sportProfilesQuery.data],
  );

  return (
    <main className="py-4">
      <h1 className="sr-only">Friends</h1>
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-[2.1fr_0.9fr]">
        <div className="flex min-w-0 flex-col gap-3.5 sm:flex-row">
          <FriendRail
            query={data.query}
            onQueryChange={data.setQuery}
            onClear={data.clearQuery}
            isAddMode={data.isAddMode}
            onToggleAddMode={data.toggleAddMode}
            onBack={data.clearQuery}
            collapsedSections={data.collapsedSections}
            onToggleSection={data.toggleSection}
            onlineFriends={data.onlineFriends}
            friendRequestRows={data.friendRequestRows}
            totalFriendRequestsCount={data.totalFriendRequestsCount}
            offlineFriends={data.offlineFriends}
            totalFriendsCount={data.totalFriendsCount}
            blockedFriends={data.blockedFriends}
            selectedPersonId={data.selectedPersonId}
            onSelectPerson={data.selectPerson}
            searchResults={data.searchResults}
            isSearching={data.isSearching}
            isSearchError={data.isSearchError}
          />
          <div className="min-w-0 flex-1">
            {(() => {
              const { selectedPerson } = data;
              if (selectedPerson === undefined) {
                return (
                  <div className="border-hairline flex h-160 items-center justify-center rounded-xl border-border bg-surface-2 text-2sm text-text-muted">
                    Select a friend to view their profile and chat.
                  </div>
                );
              }
              const { requestId } = selectedPerson;
              return (
                <div key={selectedPerson.id} className="flex h-160 flex-col gap-3.5">
                  <div className="h-1/2 min-h-0">
                    <FriendProfilePanel
                      person={selectedPerson}
                      sports={data.selectedSports}
                      isSportsLoading={data.isSelectedSportsLoading}
                      onSendRequest={() => data.sendRequest(selectedPerson.id)}
                      onAccept={() => requestId !== null && data.acceptRequest(requestId)}
                      onDecline={() => requestId !== null && data.declineRequest(requestId)}
                      isActionPending={
                        data.isSendingRequest || data.isAcceptingRequest || data.isDecliningRequest
                      }
                    />
                  </div>
                  <div className="h-1/2 min-h-0">
                    <FriendChatPanel userId={selectedPerson.id} currentUserId={user.id} />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3.5">
          <UpcomingMatches
            matches={upcomingMatchesQuery.data}
            activeSport="all"
            sportsByKey={sportsByKey}
            onSeeAll={() => navigate('/matches')}
            onSelectMatch={(sessionId) => navigate(`/matches?session=${sessionId}`)}
          />
          <TrendingHashtags
            hashtags={hashtagsQuery.data}
            onHashtagClick={noop}
            isLoading={hashtagsQuery.isLoading}
            isError={hashtagsQuery.isError}
            onRetry={hashtagsQuery.refetch}
          />
          <GroupBroadcasts
            broadcasts={broadcastsQuery.data}
            onBroadcastClick={noop}
            isLoading={broadcastsQuery.isLoading}
            isError={broadcastsQuery.isError}
            onRetry={broadcastsQuery.refetch}
          />
        </div>
      </div>
    </main>
  );
}
