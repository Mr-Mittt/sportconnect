import { describe, expect, it } from 'vitest';
import { buildDiscoverParams, serializeDiscoverFilters, type DiscoverFilters } from './discoverParams';

function baseFilters(overrides: Partial<DiscoverFilters> = {}): DiscoverFilters {
  return {
    sportId: undefined,
    title: '',
    locationIds: [],
    feeType: undefined,
    startTimeFilter: undefined,
    startTime: undefined,
    viewerZoneId: 'Asia/Ho_Chi_Minh',
    ...overrides,
  };
}

describe('serializeDiscoverFilters', () => {
  it('produces the same key regardless of locationIds order', () => {
    const a = serializeDiscoverFilters(baseFilters({ locationIds: [3, 1, 2] }));
    const b = serializeDiscoverFilters(baseFilters({ locationIds: [1, 2, 3] }));
    expect(a).toBe(b);
  });

  it('produces a different key for a different filter value', () => {
    const a = serializeDiscoverFilters(baseFilters({ title: 'pickup' }));
    const b = serializeDiscoverFilters(baseFilters({ title: 'scrimmage' }));
    expect(a).not.toBe(b);
  });
});

describe('buildDiscoverParams', () => {
  it('omits every unset optional field, always sends viewerZoneId', () => {
    expect(buildDiscoverParams(baseFilters())).toEqual({ viewerZoneId: 'Asia/Ho_Chi_Minh' });
  });

  it('includes every set field under its real backend param name', () => {
    const params = buildDiscoverParams(
      baseFilters({
        sportId: 6,
        title: 'pickup',
        locationIds: [1, 2],
        feeType: 'FREE',
        startTimeFilter: 'AFTER_OR_EQUAL',
        startTime: '18:00',
      }),
    );
    expect(params).toEqual({
      sportId: 6,
      title: 'pickup',
      locationId: [1, 2],
      feeType: 'FREE',
      startTimeFilter: 'AFTER_OR_EQUAL',
      startTime: '18:00',
      viewerZoneId: 'Asia/Ho_Chi_Minh',
    });
  });

  it('omits locationId entirely when locationIds is empty', () => {
    expect(buildDiscoverParams(baseFilters({ locationIds: [] }))).not.toHaveProperty('locationId');
  });
});
