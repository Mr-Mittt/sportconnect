import { beforeEach, describe, expect, it } from 'vitest';
import { useSportCatalogStore } from '@/shared/lib/sportCatalogStore';
import { sportProfileForId } from './sportProfileFromId';

describe('sportProfileForId', () => {
  beforeEach(() => {
    // Mirrors the global seed in test/setup.ts, made explicit here.
    useSportCatalogStore.getState().setCatalog([
      { id: 5, key: 'football', name: 'Football', iconUrl: '/images/sports/football.png' },
      { id: 6, key: 'basketball', name: 'Basketball', iconUrl: '/images/sports/basketball.png' },
    ]);
  });

  it('maps a catalog sport id to its display SportProfile', () => {
    expect(sportProfileForId(5)).toEqual({
      key: 'football',
      label: 'Football',
      colorRamp: 'gray', // no bespoke SPORT_PROFILE_CONFIG entry → generic fallback
      iconUrl: '/images/sports/football.png',
    });
  });

  it('returns undefined for an id the live catalog does not resolve (drop it, do not crash)', () => {
    expect(sportProfileForId(999)).toBeUndefined();
  });
});
