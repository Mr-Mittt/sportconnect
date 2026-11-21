import { useState } from 'react';
import { DigitsOnlyInput } from '@/features/session/components/DigitsOnlyInput';
import { RequiredMark } from '@/shared/components/RequiredMark';
import { recurrenceDayLabel } from '@/shared/lib/recurrenceDay';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import type { RecurrenceTimeFields } from '../useRecurrenceTimeFields';
import type { RecurrenceMode } from '../types';

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'));

interface ClockSelectProps {
  /** `HH:mm`, or `''` while nothing is picked. */
  value: string;
  onChange: (next: string) => void;
  /** Names the two selects ("Starts at: hour"). */
  field: string;
  i18nOverridePrefix?: string;
}

/**
 * Hour and minute as two native selects, like the session form's picker without its date. The two pieces are kept here, because `value` is empty
 * while one is still missing (re-deriving them from it would lose the one just picked); the picker reports `HH:mm` only once both are set. A new
 * value from outside (the end follows the duration) is adopted, and an end that goes empty clears the pieces.
 */
function ClockSelect({ value, onChange, field, i18nOverridePrefix }: ClockSelectProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const [hour, setHour] = useState(value.slice(0, 2));
  const [minute, setMinute] = useState(value.slice(3, 5));
  const [adopted, setAdopted] = useState(value);
  if (value !== adopted) {
    setAdopted(value);
    if (value !== '') {
      setHour(value.slice(0, 2));
      setMinute(value.slice(3, 5));
    } else if (hour !== '' && minute !== '') {
      setHour('');
      setMinute('');
    }
  }
  const commit = (nextHour: string, nextMinute: string) => {
    setHour(nextHour);
    setMinute(nextMinute);
    onChange(nextHour !== '' && nextMinute !== '' ? `${nextHour}:${nextMinute}` : '');
  };
  return (
    <div className="flex gap-1.5">
      <Select
        className="w-16 shrink-0 px-2 text-center"
        aria-label={t('time.hourFor', { field })}
        value={hour}
        onChange={(event) => commit(event.target.value, minute)}
      >
        <option value="" disabled>
          {t('time.hour')}
        </option>
        {HOURS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
      <Select
        className="w-16 shrink-0 px-2 text-center"
        aria-label={t('time.minuteFor', { field })}
        value={minute}
        onChange={(event) => commit(hour, event.target.value)}
      >
        <option value="" disabled>
          {t('time.minuteShort')}
        </option>
        {MINUTES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </div>
  );
}

interface RecurrenceWhenFieldsProps {
  /** The group's recurrence: its days are weekdays (Weekly) or days of the month (Monthly). */
  mode: RecurrenceMode;
  dayKey: number;
  onDayChange: (next: number) => void;
  time: RecurrenceTimeFields;
  /** Distinguishes element ids when two forms could be mounted at once. */
  idPrefix: string;
  i18nOverridePrefix?: string;
}

/**
 * CLIENT-GROUP-SESSION-5: the recurrence form's When section, the date-less sibling of `WhenFields`: the **day** (a weekday for a weekly group, a day
 * of the month for a monthly one), the start, the duration and the end. The end follows the duration and the duration the end; an end earlier than
 * the start is the next day's.
 */
export function RecurrenceWhenFields({ mode, dayKey, onDayChange, time, idPrefix, i18nOverridePrefix }: RecurrenceWhenFieldsProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const tg = useOverridableText('groups', i18nOverridePrefix);
  const days = Array.from({ length: mode === 'MONTHLY' ? 31 : 7 }, (_, index) => index + 1);
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <Label htmlFor={`${idPrefix}-day`}>
          {mode === 'MONTHLY' ? tg('settings.sessions.form.dayOfMonth') : tg('settings.sessions.form.dayOfWeek')}
          <RequiredMark />
        </Label>
        <Select id={`${idPrefix}-day`} className="sm:w-56" value={String(dayKey)} onChange={(event) => onDayChange(Number(event.target.value))}>
          {days.map((day) => (
            <option key={day} value={day}>
              {recurrenceDayLabel(mode, day)}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start">
        <div className="sm:flex-none">
          <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">
            {t('create.startsAt.label')}
            <RequiredMark />
          </span>
          <ClockSelect value={time.start} onChange={time.setStart} field={t('create.startsAt.label')} i18nOverridePrefix={i18nOverridePrefix} />
        </div>
        <div className="sm:w-32 sm:flex-none">
          <Label htmlFor={`${idPrefix}-duration`}>{t('create.duration.label')}</Label>
          <DigitsOnlyInput
            id={`${idPrefix}-duration`}
            min={1}
            value={time.duration}
            onChange={(event) => time.setDuration(event.target.value)}
            placeholder={t('create.duration.placeholder')}
          />
        </div>
        <div className="sm:flex-none">
          <span className="mb-1.5 block text-xs font-medium text-text-secondary select-none">{t('create.endsAt.label')}</span>
          <ClockSelect value={time.end} onChange={time.setEnd} field={t('create.endsAt.label')} i18nOverridePrefix={i18nOverridePrefix} />
        </div>
      </div>
      {time.isEndInvalid && <p className="text-2xs text-text-danger">{tg('settings.sessions.form.endInvalid')}</p>}
    </div>
  );
}
