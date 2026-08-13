import { AddSportFields, type AddSportProfileSubmission } from '@/shared/components/AddSportFields';
import type { ParticipationActionKind } from '@/shared/lib/sessionParticipation';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import type { SessionListItem, SessionSearchMode } from '../types';
import { SessionDiscoverPanel } from './SessionDiscoverPanel';

const NO_SPORTS_PROMPT = "Hey champ, add a sport first — can't join a match you don't even play! 🎯";

interface SessionDiscoverModalProps {
  isOpen: boolean;
  onClose: () => void;

  searchMode: SessionSearchMode;
  onSearchModeChange: (mode: SessionSearchMode) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;

  sessions: SessionListItem[];
  isLoading: boolean;
  isError: boolean;
  sportsByKey: Record<SportKey, SportProfile>;
  onViewDetails: (sessionId: number) => void;
  /** CLIENT-SESSION-9: threaded straight through to `SessionDiscoverPanel`. */
  onParticipationAction: (sessionId: number, kind: ParticipationActionKind) => void;
  isParticipationActionPending: (sessionId: number) => boolean;

  /** CLIENT-SESSION-7 follow-up: when the caller has zero sport profiles (`sportsByKey` empty),
   * the Discover panel is replaced by an inline "add a sport first" prompt (`AddSportFields`) —
   * same reasoning and same shared fields component as `CreateSessionModal`'s own gate. */
  availableSports: SportKey[];
  onAddSport: (payload: AddSportProfileSubmission) => void;
  isAddingSport: boolean;
  isAddSportError: boolean;
}

/**
 * CLIENT-SESSION-7's rail-triggered entry point into Discover — the `UpcomingMatches` empty
 * state's "Join a match" CTA opens this instead of navigating to `/matches`, so a caller on Home
 * Feed/Groups/Friends can browse and join a session inline. Wraps `SessionDiscoverPanel`, the
 * same UI `MatchesPage` renders inline, so the two never drift. `onViewDetails` closes this
 * dialog (see `useDiscoverModalData`) before the host page opens `SessionDetailModal` — two
 * sequential top-level Dialogs, not one nested inside the other.
 */
export function SessionDiscoverModal({
  isOpen,
  onClose,
  searchMode,
  onSearchModeChange,
  searchText,
  onSearchTextChange,
  sessions,
  isLoading,
  isError,
  sportsByKey,
  onViewDetails,
  onParticipationAction,
  isParticipationActionPending,
  availableSports,
  onAddSport,
  isAddingSport,
  isAddSportError,
}: SessionDiscoverModalProps) {
  const hasNoSportProfiles = Object.keys(sportsByKey).length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* The gated "add a sport first" view (see hasNoSportProfiles below) is a compact 3-field
          form — sized like the standalone AddSportModal (max-w-md, shrink-to-fit) instead of
          this panel's own wide/fixed-height treatment, so its "Add sport" button sits right at
          the bottom of the modal instead of floating above dead space. */}
      <DialogContent
        fixedHeight={!hasNoSportProfiles}
        className={hasNoSportProfiles ? 'max-w-md' : 'max-w-2xl'}
      >
        <DialogHeader title="Discover sessions" className="border-hairline-b border-border px-4 py-3" />
        {hasNoSportProfiles ? (
          <AddSportFields
            availableSports={availableSports}
            onSubmit={onAddSport}
            isSubmitting={isAddingSport}
            isError={isAddSportError}
            promptMessage={NO_SPORTS_PROMPT}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3.5">
            <SessionDiscoverPanel
              searchMode={searchMode}
              onSearchModeChange={onSearchModeChange}
              searchText={searchText}
              onSearchTextChange={onSearchTextChange}
              sessions={sessions}
              isLoading={isLoading}
              isError={isError}
              sportsByKey={sportsByKey}
              onViewDetails={onViewDetails}
              onParticipationAction={onParticipationAction}
              isParticipationActionPending={isParticipationActionPending}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
