import type { GroupSearchResult } from '@/features/feed/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';

interface JoinGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSearch: () => void;
  results: GroupSearchResult[];
  isSearching: boolean;
  isSearchError: boolean;
  pendingGroupIds: Set<number>;
  onRequestToJoin: (groupName: string) => void;
  isRequesting: boolean;
  isRequestError: boolean;
}

/**
 * FEED-5's real join flow — search/browse public groups (`GET /groups/public`)
 * since joining is by group NAME, not id (`CreateJoinRequestRequest` has no
 * groupId field at all). Presentational and controlled per client/CLAUDE.md —
 * all data/mutations come from the parent's `useJoinGroupModalData()` hook,
 * same shape as CommentSection/useCommentsData, so this stays
 * Storybook-testable without a TanStack Query provider.
 *
 * Each row's action is derived from two independent signals the parent hook
 * already resolved: `GroupSearchResult.isMember` (already a member — no
 * action) and `pendingGroupIds` (request already sent — shows "Pending",
 * not a second button). Search is submit-triggered (Enter/button), not
 * per-keystroke — the endpoint has no debounce of its own.
 */
export function JoinGroupModal({
  isOpen,
  onClose,
  inputValue,
  onInputChange,
  onSearch,
  results,
  isSearching,
  isSearchError,
  pendingGroupIds,
  onRequestToJoin,
  isRequesting,
  isRequestError,
}: JoinGroupModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <div className="border-hairline-b flex items-center justify-between border-border px-4 py-3">
          <DialogTitle>Join a group</DialogTitle>
          <DialogClose aria-label="Close" />
        </div>
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
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isSearching && <p className="text-2sm text-text-muted">Searching…</p>}
          {isSearchError && <p className="text-2sm text-text-danger">Couldn't load groups.</p>}
          {isRequestError && (
            <p role="alert" className="mb-2.5 text-2sm text-text-danger">
              Couldn't send the request. Try again.
            </p>
          )}
          {!isSearching && !isSearchError && results.length === 0 && (
            <p className="text-2sm text-text-muted">No groups found.</p>
          )}
          <div className="flex flex-col gap-2.5">
            {results.map((result) => {
              const isPending = pendingGroupIds.has(result.id);
              return (
                <div
                  key={result.id}
                  className="border-hairline flex items-center justify-between gap-3 rounded-lg border-border p-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary">
                      {result.groupName}
                    </div>
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
      </DialogContent>
    </Dialog>
  );
}
