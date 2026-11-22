import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';

export interface DialogChoice {
  key: string;
  label: string;
  onSelect: () => void;
  /** `primary` = the action the dialog is about; `danger` = a destructive one; `outline` = the safe way out. */
  variant: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
}

interface ChoiceDialogProps {
  isOpen: boolean;
  title: string;
  body: string;
  /** A short list shown under the body (what is missing, for example). */
  items?: string[];
  /** In reading order; a dialog with more than two choices stacks them so long labels stay readable at 375px. */
  choices: DialogChoice[];
  /** Escape, the close X and a click outside: always the safe way out (nothing changes). */
  onClose: () => void;
  /** A failure of the action just chosen, kept in the dialog so the user can try again. */
  errorText?: string;
  /** Radix's `onCloseAutoFocus`: runs once the dialog is gone and its focus trap released, the moment to move the focus somewhere (CLIENT-GROUP-UI-1: the recurrence form's first missing field). */
  onCloseAutoFocus?: (event: Event) => void;
  /**
   * Centre the dialog in the viewport instead of under the page's modal anchor. A dialog that opens over another one (the
   * regular-session form's warnings) is centred, like the session create form's own popups (CLIENT-GROUP-UI-1); the settings
   * confirmations, opened from the page itself, keep the anchored position.
   */
  centered?: boolean;
}

/**
 * CLIENT-GROUP-SESSION-4: a titled question with a few buttons, the shape of the group settings' confirmations (turn regular sessions on or
 * off, switch the recurrence, delete a configuration, leave the group). Presentational: the caller owns what each choice does. Like
 * `SettingsUnsavedChangesDialog`: the header bar with its close X, the body, the buttons on the right (stacked when there are more than two).
 */
export function ChoiceDialog({ isOpen, title, body, items, choices, onClose, errorText, onCloseAutoFocus, centered = false }: ChoiceDialogProps) {
  const isStacked = choices.length > 2;
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent centered={centered} className="p-4" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader title={title} className="mb-3" />
        <p className="mb-3 text-2sm text-text-secondary">{body}</p>
        {items !== undefined && items.length > 0 && (
          <ul className="mb-3 list-disc pl-5 text-2sm text-text-primary">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {errorText !== undefined && (
          <p role="alert" className="mb-2 text-2sm text-text-danger">
            {errorText}
          </p>
        )}
        <div className={isStacked ? 'flex flex-col gap-2' : 'flex justify-end gap-2'}>
          {choices.map((choice) => (
            <Button
              key={choice.key}
              variant={choice.variant === 'primary' ? 'primary' : 'outline'}
              size="sm"
              onClick={choice.onSelect}
              disabled={choice.disabled}
              className={choice.variant === 'danger' ? 'border-text-danger text-text-danger hover:bg-bg-accent' : undefined}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
