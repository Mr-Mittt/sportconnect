import { formatGameMood, GAME_MOOD_MAX, GAME_MOOD_MIN } from '@/shared/lib/gameMood';
import { useOverridableText } from '@/shared/lib/useOverridableText';

interface GameMoodSliderProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  value: number;
  onChange: (next: number) => void;
  id?: string;
}

/**
 * CLIENT-SESSION-34: the game mood control — a native 1 to 10 range input (keyboard operable and
 * announced for free, like the shared `Slider`), a track that runs green -> amber -> red through the
 * `--color-mood-*` tokens, "For fun" / "Normal" / "Competitive" under its two ends and middle, and
 * the number with its level word always beside it (`5 · Normal`), so colour is only an accent. The
 * control carries an `aria-label` and the same text as `aria-valuetext`. Controlled; the form's
 * default (5) is its caller's initial state, so an untouched slider is the answer.
 */
export function GameMoodSlider({ value, onChange, id, i18nOverridePrefix }: GameMoodSliderProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const readout = formatGameMood(value);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <input
          type="range"
          id={id}
          min={GAME_MOOD_MIN}
          max={GAME_MOOD_MAX}
          step={1}
          value={value}
          aria-label={t('create.mood.label')}
          aria-valuetext={readout}
          onChange={(event) => onChange(event.target.valueAsNumber)}
          className="game-mood-slider h-2 w-full cursor-pointer appearance-none rounded-full focus-visible:ring-2 focus-visible:ring-border-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 focus-visible:outline-none"
        />
        <output htmlFor={id} className="w-24 shrink-0 text-right text-2sm font-semibold whitespace-nowrap tabular-nums text-text-primary">
          {readout}
        </output>
      </div>
      <div className="flex justify-between text-2xs text-text-muted" aria-hidden="true">
        <span>
          {GAME_MOOD_MIN} · {t('create.mood.ends.low')}
        </span>
        <span>{t('create.mood.ends.mid')}</span>
        <span>
          {t('create.mood.ends.high')} · {GAME_MOOD_MAX}
        </span>
      </div>
    </div>
  );
}
