import i18next from 'i18next';

/** The slider's untouched value — an untouched slider counts as the answer (SESSION-46 default). */
export const GAME_MOOD_DEFAULT = 5;
export const GAME_MOOD_MIN = 1;
export const GAME_MOOD_MAX = 10;

export type GameMoodLevel = 'low' | 'mid' | 'high';

/** 1-3 "For fun", 4-7 "Normal", 8-10 "Competitive". */
export function getGameMoodLevel(mood: number): GameMoodLevel {
  if (mood <= 3) return 'low';
  if (mood <= 7) return 'mid';
  return 'high';
}

/** Token-backed background per level (`--color-mood-*`); the number is always shown beside it. */
export const GAME_MOOD_BADGE_CLASSES: Record<GameMoodLevel, string> = {
  low: 'bg-mood-low',
  mid: 'bg-mood-mid',
  high: 'bg-mood-high',
};

/** "For fun" / "Normal" / "Competitive", in the active language. */
export function getGameMoodLabel(mood: number): string {
  return i18next.t(`session:mood.level.${getGameMoodLevel(mood)}`);
}

/** "5 · Normal" — the readout next to the slider and the detail line. */
export function formatGameMood(mood: number): string {
  return `${mood} · ${getGameMoodLabel(mood)}`;
}
