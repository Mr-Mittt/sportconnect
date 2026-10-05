import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';

interface ReactivateSportNudgeDialogProps {
  isOpen: boolean;
  /** `sport-pill` — the user picked a deactivated sport in the switcher. `group` — the user
   * opened a group linked to a deactivated sport (`sportName` is used in the copy). */
  mode: 'sport-pill' | 'group';
  sportName: string;
  onLater: () => void;
  onReactivate: () => void;
  isReactivating: boolean;
  isError: boolean;
  /** CLIENT-ERR-4: a code-specific message (`getCodedErrorMessage`) shown instead of the static error line; unset keeps the static line. */
  errorText?: string;
  /** CLIENT-I18N-3: i18next `"namespace:key.path"` prefix overriding this dialog's default copy
   * (`sharedDialogs.reactivateSportNudge.*`) for a specific caller. No current caller passes this. */
  i18nOverridePrefix?: string;
}

/**
 * SPORT-10 §2e: the "your {sport} profile is deactivated — want to bring it back?" nudge shown on
 * every page except `/profile` (which routes a deactivated pill to its Settings-tab toggle
 * instead). `Later` lets the current action through and suppresses the nudge for the session
 * (`inactiveSportNudgeStore`); `Yes` reactivates via `POST /api/sports/profiles {isResume:true}`.
 * Chrome-light / `centered` / no auto-focused button, same shape as `UnfriendConfirmDialog`.
 */
export function ReactivateSportNudgeDialog({
  isOpen,
  mode,
  sportName,
  onLater,
  onReactivate,
  isReactivating,
  isError,
  errorText,
  i18nOverridePrefix,
}: ReactivateSportNudgeDialogProps) {
  const t = useOverridableText('sharedDialogs', i18nOverridePrefix);
  const prompt =
    mode === 'group'
      ? t('reactivateSportNudge.promptGroup', { sportName })
      : t('reactivateSportNudge.promptSportPill');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onLater()}>
      <DialogContent centered className="p-4" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle className="sr-only">
          {t('reactivateSportNudge.dialogTitle', { sportName })}
        </DialogTitle>
        <p className="mb-3 text-sm font-medium text-text-primary">{prompt}</p>
        {isError && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            {errorText ?? t('reactivateSportNudge.error', { sportName })}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onLater}
            disabled={isReactivating}
            className="min-w-20"
          >
            {t('reactivateSportNudge.later')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onReactivate}
            disabled={isReactivating}
            className="min-w-20"
          >
            {isReactivating ? t('reactivateSportNudge.reactivating') : t('reactivateSportNudge.yes')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
