import type { ReactNode } from 'react';
import type { GroupSearchResult } from '@/features/feed/types';
import type { GroupedSearchResults } from '@/features/groups/useJoinGroupModalData';
import { SportIcon } from '@/shared/components/SportIcon';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';

interface JoinGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSearch: () => void;
  sportProfiles: SportProfile[];
  selectedSports: Set<SportKey>;
  onToggleSport: (key: SportKey) => void;
  groupedResults: GroupedSearchResults[];
  isSearching: boolean;
  isSearchError: boolean;
  pendingGroupIds: Set<number>;
  onRequestToJoin: (groupName: string) => void;
  isRequesting: boolean;
  isRequestError: boolean;
}

interface SportFilterPillProps {
  label: string;
  icon: ReactNode;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * GRP-6's multi-select sport filter pill — visually mirrors
 * `SportSwitcher`'s `Pill` (same active-border treatment) but is a separate
 * component, not a shared one: `SportSwitcher` is single-select
 * (`active: SportKey | 'all'`), this one is independent multi-select
 * (`aria-pressed` per pill, toggled via a `Set<SportKey>`). `icon` is
 * resolved by the caller (same convention as `SportSwitcher`'s `Pill`) —
 * resolving it inside this component would create a new component
 * reference on every render, which `eslint-plugin-react-hooks` flags.
 */
function SportFilterPill({ label, icon, isSelected, onClick }: SportFilterPillProps) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-1.5 rounded-full bg-surface-1 px-3 py-1.75 text-2sm text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
        isSelected ? 'border-2 border-border-accent font-medium' : 'border-hairline border-border',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface ResultSectionProps {
  label: string;
  icon: ReactNode;
  results: GroupSearchResult[];
  pendingGroupIds: Set<number>;
  onRequestToJoin: (groupName: string) => void;
  isRequesting: boolean;
}

/** One sport's group of search results — header icon resolved by the caller, same reasoning as `SportFilterPill`. */
function ResultSection({
  label,
  icon,
  results,
  pendingGroupIds,
  onRequestToJoin,
  isRequesting,
}: ResultSectionProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-center gap-1.5 text-2xs font-medium text-text-secondary">
        {icon}
        {label}
      </div>
      <div className="flex flex-col gap-2.5">
        {results.map((result) => {
          const isPending = pendingGroupIds.has(result.id);
          return (
            <div
              key={result.id}
              className="border-hairline flex items-center justify-between gap-3 rounded-lg border-border p-2.5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-text-primary">{result.groupName}</div>
                <div className="text-2xs text-text-muted">{result.memberCount} members</div>
              </div>
              {result.isMember ? (
                <span className="shrink-0 text-2xs text-text-muted">Already a member</span>
              ) : isPending ? (
                <span className="shrink-0 text-2xs text-text-accent">Pending</span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 cursor-pointer"
                  disabled={isRequesting}
                  onClick={() => onRequestToJoin(result.groupName)}
                >
                  Request to join
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * FEED-5's real join flow — search/browse public groups (`GET /groups/public`)
 * since joining is by group NAME, not id (`CreateJoinRequestRequest` has no
 * groupId field at all). Presentational and controlled per client/CLAUDE.md —
 * all data/mutations come from the parent's `useJoinGroupModalData()` hook,
 * same shape as CommentSection/useCommentsData, so this stays
 * Storybook-testable without a TanStack Query provider.
 *
 * GRP-6: adds a multi-select sport filter (pre-seeded by the hook from page
 * context) and renders results grouped into one section per sport, instead
 * of a flat list. Search is submit-triggered (Enter/button) and, per GRP-6,
 * does not run at all while the search input is empty — the hook owns that
 * gating, this component just renders whatever `groupedResults` it's given.
 *
 * Each row's action is derived from two independent signals the parent hook
 * already resolved: `GroupSearchResult.isMember` (already a member — no
 * action) and `pendingGroupIds` (request already sent — shows "Pending",
 * not a second button).
 */
export function JoinGroupModal({
  isOpen,
  onClose,
  inputValue,
  onInputChange,
  onSearch,
  sportProfiles,
  selectedSports,
  onToggleSport,
  groupedResults,
  isSearching,
  isSearchError,
  pendingGroupIds,
  onRequestToJoin,
  isRequesting,
  isRequestError,
}: JoinGroupModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent fixedHeight>
        <DialogHeader title="Join a group" className="border-hairline-b border-border px-4 py-3" />
        <div className="border-hairline-b flex items-center gap-2 border-border px-4 py-3">
          <Input
            value={inputValue}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onSearch();
            }}
            placeholder="Search groups by name…"
            aria-label="Search groups"
          />
          <Button variant="outline" size="sm" className="shrink-0 cursor-pointer" onClick={onSearch}>
            Search
          </Button>
        </div>
        {sportProfiles.length > 0 && (
          <div
            role="group"
            aria-label="Sport filter"
            className="border-hairline-b flex flex-wrap gap-2 border-border px-4 py-3"
          >
            {sportProfiles.map((sport) => (
              <SportFilterPill
                key={sport.key}
                label={sport.label}
                icon={<SportIcon iconUrl={sport.iconUrl} className="size-4" />}
                isSelected={selectedSports.has(sport.key)}
                onClick={() => onToggleSport(sport.key)}
              />
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isSearching && <p className="text-2sm text-text-muted">Searching…</p>}
          {isSearchError && <p className="text-2sm text-text-danger">Couldn't load groups.</p>}
          {isRequestError && (
            <p role="alert" className="mb-2.5 text-2sm text-text-danger">
              Couldn't send the request. Try again.
            </p>
          )}
          {!isSearching && !isSearchError && groupedResults.length === 0 && (
            <p className="text-2sm text-text-muted">No groups found.</p>
          )}
          <div className="flex flex-col gap-4">
            {groupedResults.map(({ sportKey, sportProfile, results }) => (
              <ResultSection
                key={sportKey}
                label={sportProfile.label}
                icon={<SportIcon iconUrl={sportProfile.iconUrl} className="size-4" />}
                results={results}
                pendingGroupIds={pendingGroupIds}
                onRequestToJoin={onRequestToJoin}
                isRequesting={isRequesting}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
