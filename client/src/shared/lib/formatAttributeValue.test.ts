import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatAttributeValue } from './formatAttributeValue';
import { resetDevWarnCache } from './devWarn';

beforeEach(() => {
  resetDevWarnCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatAttributeValue — NUMBER', () => {
  it('fixed decimals', () => {
    expect(formatAttributeValue(12, 'NUMBER', '0.0')).toBe('12.0');
    expect(formatAttributeValue(12.345, 'NUMBER', '0.00')).toBe('12.35');
    expect(formatAttributeValue(12.9, 'NUMBER', '0')).toBe('13');
  });

  it('grouping', () => {
    expect(formatAttributeValue(1234567, 'NUMBER', '#,##0')).toBe('1,234,567');
    expect(formatAttributeValue(1234.5, 'NUMBER', '#,##0.0')).toBe('1,234.5');
  });

  it('percent multiplies by 100', () => {
    expect(formatAttributeValue(0.5, 'NUMBER', '0%')).toBe('50%');
    expect(formatAttributeValue(0.1234, 'NUMBER', '0.0%')).toBe('12.3%');
  });

  it('literal prefix and suffix around the number token', () => {
    expect(formatAttributeValue(1234.5, 'NUMBER', '$#,##0.00')).toBe('$1,234.50');
    expect(formatAttributeValue(12, 'NUMBER', '0.0 lbs')).toBe('12.0 lbs');
  });

  it('a non-number value falls back to the raw string + warns', () => {
    expect(formatAttributeValue('nope', 'NUMBER', '0.0')).toBe('nope');
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('an unparseable pattern falls back to the raw string + warns', () => {
    expect(formatAttributeValue(5, 'NUMBER', 'abc')).toBe('5');
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe('formatAttributeValue — STRING', () => {
  it('case transforms', () => {
    expect(formatAttributeValue('yonex astrox', 'STRING', 'uppercase')).toBe('YONEX ASTROX');
    expect(formatAttributeValue('YoNeX', 'STRING', 'lowercase')).toBe('yonex');
    expect(formatAttributeValue("li-ning axforce o'brien", 'STRING', 'titlecase')).toBe(
      "Li-Ning Axforce O'brien",
    );
  });

  it('an unknown token falls back to the raw string + warns', () => {
    expect(formatAttributeValue('x', 'STRING', 'sideways')).toBe('x');
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe('formatAttributeValue — passthrough', () => {
  it('empty / nullish returns "" with no warning', () => {
    expect(formatAttributeValue(null, 'NUMBER', '0.0')).toBe('');
    expect(formatAttributeValue(undefined, 'STRING', 'uppercase')).toBe('');
    expect(formatAttributeValue('', 'STRING', 'uppercase')).toBe('');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('no pattern returns the raw string', () => {
    expect(formatAttributeValue(5, 'NUMBER', null)).toBe('5');
    expect(formatAttributeValue('hi', 'STRING', undefined)).toBe('hi');
  });

  it('a type with no format grammar passes through', () => {
    expect(formatAttributeValue('x', 'BOOLEAN', 'uppercase')).toBe('x');
  });
});
