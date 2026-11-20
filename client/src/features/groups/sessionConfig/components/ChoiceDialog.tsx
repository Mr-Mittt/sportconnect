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
  /** In reading order; a dialog with more than two choices stacks them so long labels stay readable at 375px. */
  choices: DialogChoice[];
  /** Escape, the close X and a click outside: always the safe way out (nothing changes). */
  onClose: () => void;
  /** A failure of the action just chosen, kept in the dialog so the user can try again. */
  errorText?: string;
}

/**
 * CLIENT-GROUP-SESSION-4: a titled question with a few buttons, the shape of the group settings' confirmations (turn regular sessions on or
 * off, switch the recurrence, delete a configuration, leave the group). Presentational: the caller owns what each choice does. Like
 * `SettingsUnsavedChangesDialog`: the header bar with its close X, the body, the buttons on the right (stacked when there are more than two).
 */
export function ChoiceDialog({ isOpen, title, body, choices, onClose, errorText }: ChoiceDialogProps) {
  const isStacked = choices.length > 2;
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-4">
        <DialogHeader title={title} className="mb-3" />
        <p className="mb-3 text-2sm text-text-secondary">{body}</p>
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
