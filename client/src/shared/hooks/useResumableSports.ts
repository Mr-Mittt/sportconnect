import { useMemo } from 'react';
import { sportKeyForId } from '@/features/feed/sportIdMap';
import { sportProfileForId } from '@/shared/lib/sportProfileFromId';
import type { SportKey, SportProfile } from '@/shared/types/sport';
import { useRawMySportProfiles } from './useRawMySportProfiles';

/** The bits of a soft-deleted profile the reactivate modal pre-fills (read-only). */
export interface ResumablePrevious {
  skillLevel: string | null;
  yearsOfExperience: number | null;
}

/**
 * SPORT-10: the caller's *resumable* sports — ones they hold a soft-deleted
 * (`isActive: false`) profile for and **no** active profile. Backs the
 * add-sport resume/reactivate flow: `resumableProfiles` pre-fills the modal's
 * read-only skill/YoE fields, `inactiveSports` is the display list the
 * Profile-page `SportSwitcher` renders as muted pills after the active ones.
 *
 * Reads `GET /api/sports/profiles?includeInactive=true` (A20) via
 * `useRawMySportProfiles({ includeInactive: true })` — its own cache key,
 * `staleTime: 0` (repo default) so it reloads on every navigation and window
 * focus rather than freezing. A sport whose id the live catalog can't resolve
 * is dropped from `inactiveSports`, same silent-drop as the active mapping.
 */
export function useResumableSports(): {
  resumableProfiles: Map<SportKey, ResumablePrevious>;
  inactiveSports: SportProfile[];
  isLoading: boolean;
  isError: boolean;
} {
  const query = useRawMySportProfiles({ includeInactive: true });

  const { resumableProfiles, inactiveSports } = useMemo(() => {
    const rows = query.data ?? [];
    const activeSportIds = new Set(rows.filter((row) => row.isActive).map((row) => row.sportId));

    const profiles = new Map<SportKey, ResumablePrevious>();
    const sports: SportProfile[] = [];
    for (const row of rows) {
      if (row.isActive || activeSportIds.has(row.sportId)) continue;
      const key = sportKeyForId(row.sportId);
      const mapped = sportProfileForId(row.sportId);
      if (key === undefined || mapped === undefined) continue;
      profiles.set(key, {
        skillLevel: row.skillLevel,
        yearsOfExperience: row.yearsOfExperience,
      });
      sports.push(mapped);
    }
    sports.sort((a, b) => a.label.localeCompare(b.label));
    return { resumableProfiles: profiles, inactiveSports: sports };
  }, [query.data]);

  return {
    resumableProfiles,
    inactiveSports,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
