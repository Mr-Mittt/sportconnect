import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface NoSportsToAddDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * `true` when the catalogue could not be re-read and the cached list was empty too, so
   * we genuinely do not know whether anything is available. Drives the error copy instead
   * of the completeness copy — see the component doc for why that distinction matters.
   */
  isCatalogUnavailable: boolean;
  /** Retries the catalogue read. Only rendered in the unavailable state. */
  onRetry: () => void;
  isRetrying: boolean;
  /** CLIENT-I18N-3: i18next `"namespace:key.path"` prefix overriding this dialog's default copy
   * (`sharedDialogs.noSportsToAdd.*`) for a specific caller. No current caller passes this. */
  i18nOverridePrefix?: string;
}

/**
 * SPORT-5 — what "Add sport" opens when there is nothing left to add.
 *
 * Replaces silence. The pill used to render `aria-disabled` once the user held every
 * catalogue sport, so clicking it did nothing at all except show a `title` tooltip —
 * invisible to touch users and to keyboard users who never hover. A disabled control
 * cannot explain itself, which was the bug.
 *
 * **The two states are not "at the cap" versus "catalogue exhausted".** Those are the same
 * state: every page passes `maxSports={sportCatalog.data.length}`, so the cap *is* the
 * catalogue size and `atCap` is equivalent to `availableSports.length === 0`. The real
 * split is whether we know the catalogue at all:
 *
 * - **Everything held** — an honest, final answer.
 * - **Catalogue unavailable** — the refetch failed and the cache was empty. Saying "you
 *   have every sport" here would be *false*, not merely stale, so it offers a retry
 *   instead. `AddSportFields`' existing "you already have a profile for every sport"
 *   message had exactly this flaw: it was unreachable in the normal path (the pill was
 *   disabled first) and only ever appeared when the catalogue had failed to load.
 *
 * Same shape as `AddSportIntroDialog` — plain copy plus a single dismiss — rather than a
 * new dialog idiom.
 */
export function NoSportsToAddDialog({
  isOpen,
  onClose,
  isCatalogUnavailable,
  onRetry,
  isRetrying,
  i18nOverridePrefix,
}: NoSportsToAddDialogProps) {
  const t = useOverridableText(i18nOverridePrefix);
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader
          title={
            isCatalogUnavailable
              ? t('noSportsToAdd.unavailableTitle')
              : t('noSportsToAdd.completeTitle')
          }
          className="mb-3"
          onCloseClick={onClose}
        />
        <p className="mb-3 text-2sm text-text-secondary">
          {isCatalogUnavailable
            ? t('noSportsToAdd.unavailableBody')
            : t('noSportsToAdd.completeBody')}
        </p>
        <div className="flex justify-end gap-2">
          {isCatalogUnavailable ? (
            <>
              <Button variant="outline" size="sm" onClick={onClose}>
                {t('noSportsToAdd.close')}
              </Button>
              <Button variant="primary" size="sm" onClick={onRetry} disabled={isRetrying}>
                {isRetrying ? t('noSportsToAdd.retrying') : t('noSportsToAdd.retry')}
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" onClick={onClose}>
              {t('noSportsToAdd.ok')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
