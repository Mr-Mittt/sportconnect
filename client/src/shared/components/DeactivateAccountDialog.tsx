import { useState } from 'react';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

interface DeactivateAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Receives the password the user typed; the parent fires `POST /users/me/deactivate`. */
  onConfirm: (currentPassword: string) => void;
  isSubmitting: boolean;
  /** Localized line for a failed deactivation (wrong password…); the dialog stays open. */
  errorMessage: string | null;
  /** `"namespace:key.path"` override for the copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
}

/**
 * ACCOUNT-4: confirms deactivating the caller's own account. The password field is the
 * confirmation (it is verified server-side); Deactivate stays disabled until something is typed.
 * `AppShell` mounts this only while open, so the typed password is dropped on every close.
 *
 * The field must start empty: this is a re-confirmation, so a browser filling in the saved password
 * would let the user confirm without typing anything. Chrome ignores `autocomplete="off"`/`new-password`
 * on a lone password field when the site has a saved login, so the input is also `readOnly` until it is
 * first focused (Chrome does not autofill read-only inputs).
 */
export function DeactivateAccountDialog({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  errorMessage,
  i18nOverridePrefix,
}: DeactivateAccountDialogProps) {
  const t = useOverridableText('accountSettings', i18nOverridePrefix);
  const [password, setPassword] = useState('');
  const [isFieldUnlocked, setIsFieldUnlocked] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent centered className="p-4">
        <DialogTitle>{t('deactivateDialog.title')}</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (password !== '') onConfirm(password);
          }}
        >
          <p className="mt-1 mb-3 text-2sm text-text-secondary">{t('deactivateDialog.body')}</p>
          <Label htmlFor="deactivate-account-password">{t('deactivateDialog.passwordLabel')}</Label>
          <Input
            id="deactivate-account-password"
            type="password"
            autoComplete="new-password"
            readOnly={!isFieldUnlocked}
            onFocus={() => setIsFieldUnlocked(true)}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {errorMessage !== null && (
            <p role="alert" className="mt-2 text-2sm text-text-danger">
              {errorMessage}
            </p>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={password === '' || isSubmitting}
              className="border-text-danger text-text-danger hover:bg-bg-accent"
            >
              {isSubmitting ? t('deactivateDialog.submitting') : t('deactivateDialog.submit')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              {t('deactivateDialog.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
