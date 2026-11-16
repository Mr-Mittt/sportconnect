import { useRef } from 'react';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

interface UnsavedPostConfirmDialogProps {
  isOpen: boolean;
  onStay: () => void;
  onLeave: () => void;
  /** Runs once the question has closed on "Keep editing" (or Esc): the caller puts the focus back on the unsent text. */
  onStayFocus?: () => void;
  /** CLIENT-I18N-3: i18next `"namespace:key.path"` prefix overriding this dialog's default copy
   * (`sharedDialogs.unsavedPost.*`) for a specific caller. No current caller passes this. */
  i18nOverridePrefix?: string;
}

/**
 * PROFILE-10: confirms leaving a page with unsubmitted `CreatePostForm` text — triggered by an
 * in-app navigation blocked by `useUnsavedChangesGuard`'s `useBlocker`. Unlike Settings'
 * `SettingsUnsavedChangesDialog`, there is no Save option — a post draft has nothing to persist,
 * so the only choice is stay and keep editing, or leave and lose it. Does NOT cover the browser
 * close/refresh case — that can only ever show the browser's own generic native prompt.
 */
export function UnsavedPostConfirmDialog({
  isOpen,
  onStay,
  onLeave,
  onStayFocus,
  i18nOverridePrefix,
}: UnsavedPostConfirmDialogProps) {
  const t = useOverridableText('sharedDialogs', i18nOverridePrefix);
  // Radix hands the focus back to whatever had it before the question; "Keep editing" wants it on the unsent text.
  const stayed = useRef(false);
  const stay = () => {
    stayed.current = true;
    onStay();
  };
  const leave = () => {
    stayed.current = false;
    onLeave();
  };
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && stay()}>
      <DialogContent
        className="p-4"
        onCloseAutoFocus={(event) => {
          if (stayed.current && onStayFocus !== undefined) {
            event.preventDefault();
            onStayFocus();
          }
          stayed.current = false;
        }}
      >
        <DialogHeader title={t('unsavedPost.title')} className="mb-3" onCloseClick={stay} />
        <p className="mb-3 text-2sm text-text-secondary">{t('unsavedPost.body')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={stay}>
            {t('unsavedPost.keepEditing')}
          </Button>
          <Button variant="primary" size="sm" onClick={leave}>
            {t('unsavedPost.leave')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
