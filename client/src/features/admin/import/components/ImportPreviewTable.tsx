import { IconChevronDown } from '@tabler/icons-react';
import { useState } from 'react';
import { cn } from '@/shared/lib/utils';
import type { ImportCandidate, ImportPreviewPlayer, ImportPreviewSession } from '../types';

interface ImportPreviewTableProps {
  sessions: ImportPreviewSession[];
  /** The member chosen for each unresolved name (a user id by the name as written), shown in place of "not matched". */
  aliases: Record<string, string>;
  /** The group's active members, to give a chosen member a name. */
  members: ImportCandidate[];
}

/** A player as the admin should read it: the matched member, the member chosen for the name, or "not matched". */
function playerLabel(player: ImportPreviewPlayer, aliases: Record<string, string>, members: ImportCandidate[]): string {
  if (player.userId) return player.fullName ?? player.name;
  const chosen = aliases[player.name];
  if (chosen) return members.find((m) => m.userId === chosen)?.fullName ?? player.name;
  return `${player.name} (not matched)`;
}

function names(players: ImportPreviewPlayer[], aliases: Record<string, string>, members: ImportCandidate[]): string {
  return players.map((p) => playerLabel(p, aliases, members)).join(', ');
}

function SessionRow({ session, aliases, members }: { session: ImportPreviewSession } & Pick<ImportPreviewTableProps, 'aliases' | 'members'>) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = `import-games-${session.localDate}-${session.title.replace(/\W+/g, '-')}`;
  return (
    <li className="rounded-lg border-hairline border-border bg-surface-2">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-2sm focus-visible:ring-3 focus-visible:ring-bg-accent focus-visible:outline-none"
      >
        <IconChevronDown
          className={cn('size-4 shrink-0 text-text-muted transition-transform', isOpen && 'rotate-180')}
          aria-hidden="true"
        />
        <span className="font-medium text-text-primary">{session.localDate}</span>
        <span className="min-w-0 flex-1 truncate text-text-secondary">{session.title}</span>
        <span className="shrink-0 text-text-muted">
          {session.games.length} {session.games.length === 1 ? 'game' : 'games'}
        </span>
        {session.exists && <span className="shrink-0 font-medium text-text-accent">Already imported</span>}
      </button>
      {isOpen && (
        <ol id={panelId} className="space-y-1 border-t-hairline border-border px-3 py-2 text-2sm text-text-secondary">
          {session.games.map((game, index) => (
            <li key={index}>
              <span className="text-text-muted">{index + 1}. </span>
              {names(game.winners, aliases, members)} <span className="text-text-muted">beat</span>{' '}
              {names(game.losers, aliases, members)}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

/**
 * CLIENT-ADMIN-IMPORT-1: the sessions of a preview, one row each (date, title, number of games), opening to its games with
 * the winners first. A session the group already has is marked "Already imported" (an apply will skip it); a name nobody
 * matched reads "(not matched)" until the admin has chosen a member for it.
 */
export function ImportPreviewTable({ sessions, aliases, members }: ImportPreviewTableProps) {
  return (
    <ul className="space-y-2" aria-label="Sessions to import">
      {sessions.map((session) => (
        <SessionRow key={`${session.localDate}|${session.title}`} session={session} aliases={aliases} members={members} />
      ))}
    </ul>
  );
}
