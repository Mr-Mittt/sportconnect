import { IconArrowLeft, IconUserPlus, IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import type {
  FriendRequestRow,
  FriendSectionKey,
  FriendUser,
  UserSearchResult,
} from '../types';

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

interface RailRowProps {
  id: string;
  name: string;
  avatarUrl?: string | null;
  isSelected: boolean;
  showIncomingBadge?: boolean;
  onSelect: (id: string) => void;
}

function RailRow({ id, name, avatarUrl = null, isSelected, showIncomingBadge, onSelect }: RailRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-lg p-1.75 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
        isSelected ? 'bg-bg-accent' : 'hover:bg-surface-1',
      )}
    >
      <Avatar className="size-7.5 shrink-0">
        {avatarUrl !== null && <AvatarImage src={avatarUrl} alt="" />}
        <AvatarFallback className="text-2xs">{initialsFor(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-2sm text-text-primary">{name}</span>
      {showIncomingBadge === true && (
        <span
          className="size-1.75 shrink-0 rounded-full bg-text-accent"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

interface SectionProps {
  sectionKey: FriendSectionKey;
  label: string;
  isCollapsed: boolean;
  onToggle: (key: FriendSectionKey) => void;
  count: number;
  totalCount: number;
  children: ReactNode;
}

function FriendSection({ sectionKey, label, isCollapsed, onToggle, count, totalCount, children }: SectionProps) {
  return (
    <section aria-label={label}>
      <Collapsible open={!isCollapsed} onOpenChange={() => onToggle(sectionKey)}>
        <CollapsibleTrigger className="px-1.75 py-1.5">
          <span className="text-2xs font-medium text-text-secondary">
            {label} ({count})
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-0.5 pb-1.5">
          {totalCount === 0 ? (
            <p className="px-1.75 text-2xs text-text-muted">Nothing here yet.</p>
          ) : count === 0 ? (
            <p className="px-1.75 text-2xs text-text-muted">No matches.</p>
          ) : (
            children
          )}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

interface FriendRailProps {
  query: string;
  onQueryChange: (value: string) => void;
  onClear: () => void;
  isAddMode: boolean;
  onToggleAddMode: () => void;
  onBack: () => void;
  collapsedSections: Record<FriendSectionKey, boolean>;
  onToggleSection: (key: FriendSectionKey) => void;
  onlineFriends: FriendUser[];
  friendRequestRows: FriendRequestRow[];
  totalFriendRequestsCount: number;
  offlineFriends: FriendUser[];
  totalFriendsCount: number;
  blockedFriends: FriendUser[];
  selectedPersonId: string | undefined;
  onSelectPerson: (id: string) => void;
  searchResults: UserSearchResult[];
  isSearching: boolean;
  isSearchError: boolean;
}

/**
 * FRIEND-1's left rail — a shared search+add-friend input on top, then
 * either 4 collapsible status-grouped sections (default mode) or a single
 * ungrouped directory-search results section (Add mode), per
 * `design-reference-friend.html`. Presentational/controlled: every list is
 * already resolved and filtered by `useFriendsPageData` — this component
 * only renders what it's given. Online/Blocked are always empty (no
 * presence system or block/blacklist backend concept exists) — rendered
 * the same "Nothing here yet." way any other genuinely-empty section would
 * be, not a special-cased message, since from this component's point of
 * view there's no difference.
 */
export function FriendRail({
  query,
  onQueryChange,
  onClear,
  isAddMode,
  onToggleAddMode,
  onBack,
  collapsedSections,
  onToggleSection,
  onlineFriends,
  friendRequestRows,
  totalFriendRequestsCount,
  offlineFriends,
  totalFriendsCount,
  blockedFriends,
  selectedPersonId,
  onSelectPerson,
  searchResults,
  isSearching,
  isSearchError,
}: FriendRailProps) {
  const trimmedQuery = query.trim();

  return (
    <div className="flex w-57.5 shrink-0 flex-col gap-1">
      <div className="mb-1.5 flex items-center gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search friends"
            aria-label="Search friends"
            className={query !== '' ? 'pr-8' : undefined}
          />
          {query !== '' && (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            >
              <IconX className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant={isAddMode ? 'primary' : 'outline'}
          size="icon"
          aria-label="Add friend"
          onClick={onToggleAddMode}
          className="shrink-0 rounded-full"
        >
          <IconUserPlus className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {isAddMode ? (
          <>
            <button
              type="button"
              onClick={onBack}
              className="flex cursor-pointer items-center gap-1.5 self-start px-1.75 py-1 text-2sm text-text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            >
              <IconArrowLeft className="size-3.5" aria-hidden="true" />
              Back to friend list
            </button>
            <p className="px-1.75 pb-1 text-center text-2xs text-text-muted">
              {isSearching
                ? 'Searching…'
                : isSearchError
                  ? "Couldn't search right now."
                  : searchResults.length > 0
                    ? `Matches for "${trimmedQuery}"`
                    : `No users found for "${trimmedQuery}"`}
            </p>
            <div className="flex flex-col gap-0.5">
              {searchResults.map((result) => (
                <RailRow
                  key={result.id}
                  id={result.id}
                  name={result.fullName}
                  avatarUrl={result.avatarUrl}
                  isSelected={selectedPersonId === result.id}
                  onSelect={onSelectPerson}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <FriendSection
              sectionKey="online"
              label="Online"
              isCollapsed={collapsedSections.online}
              onToggle={onToggleSection}
              count={onlineFriends.length}
              totalCount={onlineFriends.length}
            >
              {onlineFriends.map((friend) => (
                <RailRow
                  key={friend.id}
                  id={friend.id}
                  name={friend.fullName}
                  avatarUrl={friend.avatarUrl}
                  isSelected={selectedPersonId === friend.id}
                  onSelect={onSelectPerson}
                />
              ))}
            </FriendSection>

            <FriendSection
              sectionKey="friendRequests"
              label="Friend Requests"
              isCollapsed={collapsedSections.friendRequests}
              onToggle={onToggleSection}
              count={friendRequestRows.length}
              totalCount={totalFriendRequestsCount}
            >
              {friendRequestRows.map((row) => (
                <RailRow
                  key={row.id}
                  id={row.id}
                  name={row.name}
                  isSelected={selectedPersonId === row.id}
                  showIncomingBadge={row.direction === 'incoming'}
                  onSelect={onSelectPerson}
                />
              ))}
            </FriendSection>

            <FriendSection
              sectionKey="offline"
              label="Offline"
              isCollapsed={collapsedSections.offline}
              onToggle={onToggleSection}
              count={offlineFriends.length}
              totalCount={totalFriendsCount}
            >
              {offlineFriends.map((friend) => (
                <RailRow
                  key={friend.id}
                  id={friend.id}
                  name={friend.fullName}
                  avatarUrl={friend.avatarUrl}
                  isSelected={selectedPersonId === friend.id}
                  onSelect={onSelectPerson}
                />
              ))}
            </FriendSection>

            <FriendSection
              sectionKey="blocked"
              label="Blocked"
              isCollapsed={collapsedSections.blocked}
              onToggle={onToggleSection}
              count={blockedFriends.length}
              totalCount={blockedFriends.length}
            >
              {blockedFriends.map((friend) => (
                <RailRow
                  key={friend.id}
                  id={friend.id}
                  name={friend.fullName}
                  avatarUrl={friend.avatarUrl}
                  isSelected={selectedPersonId === friend.id}
                  onSelect={onSelectPerson}
                />
              ))}
            </FriendSection>
          </>
        )}
      </div>
    </div>
  );
}
