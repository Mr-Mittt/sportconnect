import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDevWarnCache } from '@/shared/lib/devWarn';
import { normalizeLayout, resolveFormatMap } from './layout';

describe('resolveFormatMap — SPORT-16 locale-map → one pattern', () => {
  it('prefers the UI locale (en-US), then falls back to en', () => {
    expect(resolveFormatMap({ 'en-US': '#,##0', en: '0' })).toBe('#,##0');
    expect(resolveFormatMap({ en: '0%' })).toBe('0%');
  });

  it('a map with neither en-US nor en → null (renders unformatted)', () => {
    expect(resolveFormatMap({ vi: '0', fr: '0.0' })).toBeNull();
    expect(resolveFormatMap({})).toBeNull();
  });

  it('null / undefined → null', () => {
    expect(resolveFormatMap(null)).toBeNull();
    expect(resolveFormatMap(undefined)).toBeNull();
  });

  it('tolerates a bare string (older fixtures / a hand-built layout)', () => {
    expect(resolveFormatMap('titlecase')).toBe('titlecase');
    expect(resolveFormatMap('')).toBeNull();
  });

  it('a non-string map value is ignored', () => {
    expect(resolveFormatMap({ en: 42 as unknown as string })).toBeNull();
  });
});

describe('normalizeLayout — format resolution', () => {
  beforeEach(() => {
    resetDevWarnCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('resolves a format map to one string on the normalized layout', () => {
    expect(normalizeLayout({ id: 'readonly-text', format: { en: '0%' } }, 'ctx').format).toBe('0%');
  });

  it('a format map with no usable locale → null format, no warning (an absent pattern is normal)', () => {
    expect(normalizeLayout({ id: 'input', format: { vi: '0' } }, 'ctx').format).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
