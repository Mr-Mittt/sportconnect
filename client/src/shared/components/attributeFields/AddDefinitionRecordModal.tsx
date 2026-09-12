import { useState } from 'react';
import type { ResolvedSportAttributeDefinitionType } from '@/shared/types/sport';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { DefinitionFields } from './DefinitionFields';

export interface AddDefinitionRecordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title, e.g. `` `Add — ${label}` `` — same convention as the modal this was extracted from. */
  title: string;
  definitionType: ResolvedSportAttributeDefinitionType;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
  /** Fires once with the filled-in record when the caller confirms a non-empty draft; the modal
   * closes itself right after. Never fires for an empty draft (Cancel or the dialog's own close
   * button close it with no callback either way). */
  onSubmit: (record: Record<string, unknown>) => void;
}

/**
 * Shared "Add" modal for entering one `DEFINITION`-shaped record via `DefinitionFields` — a small
 * dialog with Cancel/Add actions. Extracted from the record branch of `RefField`'s "Other…" modal
 * (CLIENT-SESSION-17) so `DefinitionListField`'s own "Add" path (CLIENT-SESSION-19) can reuse the
 * exact same shape instead of duplicating it; `RefField` now renders this component for its own
 * record-base case too, so there is one implementation of this modal, not two.
 *
 * Owns its own draft-record state — reset to `{}` every time `open` transitions to `true`, so a
 * prior draft never leaks into the next time the modal opens. `onSubmit` only fires for a
 * non-empty record (mirrors the guard the original inline modal had).
 */
export function AddDefinitionRecordModal({
  open,
  onOpenChange,
  title,
  definitionType,
  definitionsByName,
  onSubmit,
}: AddDefinitionRecordModalProps) {
  const [draftRecord, setDraftRecord] = useState<Record<string, unknown>>({});
  // Reset the draft the moment `open` flips to `true` — adjusted during render (React's
  // documented pattern for "reset state when a prop changes"), not in an effect, so there is no
  // extra commit/cascading render.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setDraftRecord({});
  }

  const commit = () => {
    if (Object.keys(draftRecord).length === 0) return;
    onSubmit(draftRecord);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader title={title} onCloseClick={() => onOpenChange(false)} />
        <div className="flex flex-col gap-4 p-4">
          <DefinitionFields
            definitionType={definitionType}
            record={draftRecord}
            onChange={setDraftRecord}
            definitionsByName={definitionsByName}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={commit}>
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
