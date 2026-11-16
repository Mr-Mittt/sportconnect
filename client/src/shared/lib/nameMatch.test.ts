import { describe, expect, it } from 'vitest';
import { foldName, matchesName, queryWords } from './nameMatch';

// CLIENT-GL-50: the client copy of the server's name rule (SESSION-GL-64).

describe('foldName', () => {
  it('lower-cases, drops accents and maps đ to d', () => {
    expect(foldName('Nguyễn Đặng Tuấn Ơn Ư')).toBe('nguyen dang tuan on u');
  });
});

describe('queryWords', () => {
  it('folds, splits on blanks and cuts to 5 words of at most 30 characters', () => {
    expect(queryWords('  Anh   TU ')).toEqual(['anh', 'tu']);
    expect(queryWords('a b c d e f g')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(queryWords('x'.repeat(40))).toEqual(['x'.repeat(30)]);
    expect(queryWords('   ')).toEqual([]);
  });
});

describe('matchesName', () => {
  it('matches the start of a word, case and accent insensitive', () => {
    expect(matchesName('Tuấn Anh', 'tuan')).toBe(true);
    expect(matchesName('Tuấn Anh', 'TUẤN')).toBe(true);
    expect(matchesName('Đặng Văn Lâm', 'dang')).toBe(true);
    expect(matchesName('Đặng Văn Lâm', 'đặ')).toBe(true);
  });

  it('matches a later word, not the middle of a word', () => {
    expect(matchesName('Anh Tuấn', 'tu')).toBe(true);
    expect(matchesName('Tuấn Anh', 'uan')).toBe(false);
    expect(matchesName('Priya Shah', 'ya')).toBe(false);
  });

  it('needs every typed word to start some word of the name, in any order', () => {
    expect(matchesName('Tuấn Anh', 'anh tu')).toBe(true);
    expect(matchesName('Tuấn Anh', 'anh x')).toBe(false);
  });

  it('matches every name for an empty query', () => {
    expect(matchesName('Bao', '')).toBe(true);
    expect(matchesName('Bao', '   ')).toBe(true);
  });

  it('reads only the first 5 words of a query, as the server does', () => {
    expect(matchesName('a b c d e', 'a b c d e zzz')).toBe(true);
  });
});
