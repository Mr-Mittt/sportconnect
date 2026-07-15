import { describe, expect, it } from 'vitest';
import type { SportKey } from '@/shared/types/sport';
import { useSportProfiles } from './useSportProfiles';

describe('useSportProfiles (mock-backed until SPORT-1)', () => {
  it('returns the convention shape, already resolved', () => {
    const { data, isLoading, isError } = useSportProfiles();

    expect(isLoading).toBe(false);
    expect(isError).toBe(false);
    expect(data.length).toBeGreaterThan(0);
  });

  it('has a sport profile for all 3 sports and no synthetic "All" entry', () => {
    const allSports: SportKey[] = ['football', 'basketball', 'tennis'];

    expect(useSportProfiles().data.map((s) => s.key).sort()).toEqual([...allSports].sort());
  });
});
