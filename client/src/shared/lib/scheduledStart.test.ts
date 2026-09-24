import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toOffsetAwareIso } from './scheduledStart';
import { getViewerZoneId } from './viewerZone';

// The offset comes from the process's own zone, so each case pins TZ explicitly — Node re-reads
// process.env.TZ on assignment, so this works mid-process without a config-level TZ.
describe('toOffsetAwareIso', () => {
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Asia/Ho_Chi_Minh';
  });
  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('appends the browser zone offset to the picked wall-clock time', () => {
    expect(toOffsetAwareIso('2026-09-24T11:00')).toBe('2026-09-24T11:00:00+07:00');
  });

  it('keeps the same instant the backend will parse (round-trips through Date)', () => {
    const iso = toOffsetAwareIso('2026-09-24T11:00');
    expect(new Date(iso).toISOString()).toBe('2026-09-24T04:00:00.000Z');
  });

  it('emits Z for a UTC zone', () => {
    process.env.TZ = 'UTC';
    expect(toOffsetAwareIso('2026-09-24T11:00')).toBe('2026-09-24T11:00:00Z');
  });

  it('computes the offset for the selected date, not for today (DST changes between them)', () => {
    process.env.TZ = 'America/New_York';
    expect(toOffsetAwareIso('2026-01-15T19:00')).toBe('2026-01-15T19:00:00-05:00'); // EST
    expect(toOffsetAwareIso('2026-07-15T19:00')).toBe('2026-07-15T19:00:00-04:00'); // EDT
  });

  it('resolves a spring-forward gap time forward (02:30 does not exist on 2026-03-08 in New York)', () => {
    process.env.TZ = 'America/New_York';
    expect(toOffsetAwareIso('2026-03-08T02:30')).toBe('2026-03-08T03:30:00-04:00');
  });

  it('resolves an ambiguous fall-back time to its earlier occurrence (01:30 on 2026-11-01)', () => {
    process.env.TZ = 'America/New_York';
    expect(toOffsetAwareIso('2026-11-01T01:30')).toBe('2026-11-01T01:30:00-04:00');
  });

  it('throws on an incomplete value instead of sending a malformed payload', () => {
    expect(() => toOffsetAwareIso('')).toThrow();
    expect(() => toOffsetAwareIso('2026-09-24')).toThrow();
  });
});

describe('getViewerZoneId', () => {
  it('returns a non-empty IANA zone name', () => {
    expect(getViewerZoneId()).toMatch(/^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$/);
  });
});
