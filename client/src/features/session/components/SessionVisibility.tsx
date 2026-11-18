import { useOverridableText } from '@/shared/lib/useOverridableText';
import { cn } from '@/shared/lib/utils';
import { Switch } from '@/shared/ui/switch';

interface SessionVisibilitySwitchProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  id: string;
  /** On = public (the default): everyone can find the session and ask to join. */
  isPublic: boolean;
  onChange: (next: boolean) => void;
  className?: string;
}

/**
 * CLIENT-SESSION-52: the public / private switch of a standalone session and its one-line hint, which says what the
 * current state means ("Everyone can see and ask to join your session" / "Except for your invitee, everyone cannot find
 * and ask to join your session"). Used in the create form's footer and in the Who section's editor. The whole row is the
 * label, so a click on the hint toggles too; the switch itself has its own `aria-label`.
 */
export function SessionVisibilitySwitch({ i18nOverridePrefix, id, isPublic, onChange, className }: SessionVisibilitySwitchProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  return (
    <label className={cn('flex min-w-0 cursor-pointer items-center gap-2 select-none', className)}>
      <Switch id={id} checked={isPublic} onCheckedChange={onChange} aria-label={t('create.visibility.switchLabel')} />
      <span className="min-w-0 text-2xs text-text-secondary">
        {isPublic ? t('create.visibility.hintPublic') : t('create.visibility.hintPrivate')}
      </span>
    </label>
  );
}

/**
 * The warning shown while the switch is off: only the host and the invited friends can see the session. Amber tokens and
 * words, so the meaning never rests on the colour (the same treatment as the share dialog's limit warning).
 */
export function SessionVisibilityWarning({ i18nOverridePrefix }: { i18nOverridePrefix?: string }) {
  const t = useOverridableText('session', i18nOverridePrefix);
  return (
    <p role="status" className="rounded-lg bg-amber-50 px-2 py-1 text-2xs font-medium text-amber-800">
      {t('create.visibility.warning')}
    </p>
  );
}
