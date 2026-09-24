import { IconSearch } from '@tabler/icons-react';
import { sportIdForKey } from '@/features/feed/sportIdMap';
import type { SportKey, SportProfile } from '@/shared/types/sport';

interface DiscoverModalSportSearchBoxProps {
  sportId: number | undefined;
  onSportIdChange: (sportId: number) => void;
  /** The caller's own held sport profiles — same map `SessionDiscoverModal` already receives for
   * its results grid, reused here as the dropdown's option list (never the "sports not yet
   * added" `availableSports` list that gates the zero-profile prompt). */
  sportsByKey: Record<SportKey, SportProfile>;
  searchText: string;
  onSearchTextChange: (text: string) => void;
}

/**
 * CLIENT-SESSION-29 revision (2026-09-23) — replaces the modal's old "Sessions/Location/Gear"
 * search-scope `<select>` (`DiscoverSearchBox`, still used by the full `/matches` page) with a
 * dropdown over the caller's own sports. The modal used to be locked to whichever sport the
 * hosting page's pill happened to be on when it was opened; this lets the caller switch sport
 * without leaving the modal. Pre-filled from that pill (or the caller's first held sport when the
 * pill is 'all'/absent) — see `useDiscoverModalFilters`'s own doc comment for the reset timing.
 */
export function DiscoverModalSportSearchBox({
  sportId,
  onSportIdChange,
  sportsByKey,
  searchText,
  onSearchTextChange,
}: DiscoverModalSportSearchBoxProps) {
  const sports = Object.values(sportsByKey);

  return (
    <div className="flex items-center gap-2">
      <select
        value={sportId ?? ''}
        onChange={(event) => onSportIdChange(Number(event.target.value))}
        aria-label="Sport to discover"
        className="border-hairline cursor-pointer rounded-lg border-border bg-surface-2 px-2.5 py-2 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
      >
        {sports.map((sport) => {
          const id = sportIdForKey(sport.key);
          return id === undefined ? null : (
            <option key={sport.key} value={id}>
              {sport.label}
            </option>
          );
        })}
      </select>
      <div className="relative min-w-0 flex-1">
        <IconSearch
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder="Search"
          aria-label="Search sessions"
          className="border-hairline w-full rounded-lg border-border bg-surface-2 py-2 pr-2.5 pl-8 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
        />
      </div>
    </div>
  );
}
