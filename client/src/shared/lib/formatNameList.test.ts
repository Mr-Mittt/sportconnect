import { describe, expect, it } from 'vitest';
import { formatNameList } from './formatNameList';

describe('formatNameList', () => {
  it('returns an empty string for zero names', () => {
    expect(formatNameList([])).toBe('');
  });

  it('returns the bare name for one', () => {
    expect(formatNameList(['Sam Ito'])).toBe('Sam Ito');
  });

  it('joins two names with "and"', () => {
    expect(formatNameList(['Sam Ito', 'Priya Shah'])).toBe('Sam Ito and Priya Shah');
  });

  it('oxford-comma joins three or more names', () => {
    expect(formatNameList(['Sam Ito', 'Priya Shah', 'Morgan Diaz'])).toBe(
      'Sam Ito, Priya Shah, and Morgan Diaz',
    );
  });
});
