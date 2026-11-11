import { describe, expect, it } from 'vitest';
import { formatGameMood, GAME_MOOD_BADGE_CLASSES, getGameMoodLabel, getGameMoodLevel } from './gameMood';

describe('game mood levels', () => {
  it.each([
    [1, 'low'],
    [3, 'low'],
    [4, 'mid'],
    [5, 'mid'],
    [7, 'mid'],
    [8, 'high'],
    [10, 'high'],
  ] as const)('%i is %s', (mood, level) => {
    expect(getGameMoodLevel(mood)).toBe(level);
  });

  it('labels the levels For fun / Normal / Competitive', () => {
    expect(getGameMoodLabel(2)).toBe('For fun');
    expect(getGameMoodLabel(5)).toBe('Normal');
    expect(getGameMoodLabel(9)).toBe('Competitive');
  });

  it('formats the number with its word', () => {
    expect(formatGameMood(5)).toBe('5 · Normal');
  });

  it('tints by level through the mood tokens, never a hard-coded colour', () => {
    expect(Object.values(GAME_MOOD_BADGE_CLASSES)).toEqual(['bg-mood-low', 'bg-mood-mid', 'bg-mood-high']);
  });
});
