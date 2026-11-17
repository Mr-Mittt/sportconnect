import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { useId } from 'react';
import { cn } from '@/shared/lib/utils';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { scoreboardTitle, type RecordSchema } from '../recordSchema';
import { formatScoreboardCell, type ScoreboardRow } from '../scoreboard';

interface ResultScoreboardProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  schema: RecordSchema;
  rows: ScoreboardRow[];
  locale: 'en' | 'vi';
  /** The caller: their row is highlighted. */
  currentUserId?: string;
  /** Whether the table is shown; the title bar above it toggles it. Owned by the caller so it survives the section opening and closing. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * CLIENT-GL-49: the session scoreboard, a collapsible table of one row per player (`buildScoreboard`), below the
 * record list in the Result section (open by default; the title bar with the chevron folds it). Its columns and their titles come from the sport's `record.scoreboard`; a title the sport does
 * not set uses the client's en/vi default. The caller's row is highlighted and marked "You" (colour is never the only
 * signal). An index column (`#`) numbers the rows in the order shown. Four short columns fit a 375px dialog without scrolling sideways; a long name is cut with an ellipsis.
 */
export function ResultScoreboard({
  i18nOverridePrefix,
  schema,
  rows,
  locale,
  currentUserId,
  open,
  onOpenChange,
}: ResultScoreboardProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const { columns } = schema.scoreboard;
  const bodyId = useId();
  const titleId = useId();
  const Chevron = open ? IconChevronUp : IconChevronDown;
  return (
    <div data-testid="result-scoreboard">
      <button
        id={titleId}
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onOpenChange(!open)}
        className="flex w-full cursor-pointer items-center justify-between gap-1 rounded px-1.5 py-0.5 text-left text-2xs font-semibold text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
      >
        <span>{t('result.scoreboard.title')}</span>
        <Chevron className="size-3.5" aria-hidden="true" />
      </button>
      {open && (
        <table
          id={bodyId}
          aria-labelledby={titleId}
          className="w-full table-fixed border-collapse text-2xs text-text-primary"
        >
          <thead>
            <tr className="border-hairline-b border-border text-text-muted">
              <th scope="col" className="w-6 px-0.5 py-0.5 text-right font-medium" title={t('result.scoreboard.rank')}>
                #
              </th>
              <th scope="col" className="w-[30%] px-1.5 py-0.5 text-left font-medium">
                {t('result.scoreboard.player')}
              </th>
              {columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="truncate px-0.5 py-0.5 text-right font-medium"
                  title={scoreboardTitle(schema.scoreboard, column, locale, t(`result.scoreboard.columns.${column}`))}
                >
                  {scoreboardTitle(schema.scoreboard, column, locale, t(`result.scoreboard.columns.${column}`))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const isMe = currentUserId !== undefined && row.userId === currentUserId;
              return (
                <tr
                  key={row.userId}
                  data-testid="scoreboard-row"
                  aria-current={isMe ? 'true' : undefined}
                  className={cn('border-hairline-b border-border', isMe && 'bg-bg-accent font-medium')}
                >
                  <td className="px-0.5 py-1 text-right tabular-nums text-text-muted">{index + 1}</td>
                  <th scope="row" className="truncate px-1.5 py-1 text-left font-normal" title={row.name}>
                    <span className={cn(isMe && 'font-medium')}>{row.name}</span>
                    {isMe && <span className="ml-1 text-text-accent">({t('result.scoreboard.you')})</span>}
                  </th>
                  {columns.map((column) => (
                    <td key={column} className="truncate px-0.5 py-1 text-right tabular-nums">
                      {formatScoreboardCell(row, column)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
