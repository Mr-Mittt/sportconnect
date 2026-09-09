import { useMemo, useState } from 'react';
import type {
  ResolvedRefAttribute,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { MAX_LIST_ITEMS } from '@/shared/types/sport';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { DefinitionFields } from './DefinitionFields';
import { deriveRefChoices, draftToChoice, refValueKey, type RefChoice } from './refChoices';

export interface RefFieldProps {
  node: ResolvedRefAttribute;
  /** Full `/`-separated path — collision-free element ids. */
  fieldId: string;
  /** `SINGLE` → a scalar or record; `LIST` → an array of them. */
  value: unknown;
  onChange: (value: unknown) => void;
  /** The creator's own `profile.attributes` — the choice list is sourced from `node.prefillKey`. */
  choiceSource: Record<string, unknown> | null;
  /** Values the user has added through the "Other…" modal for this node — accumulate, never
   * written to the profile. */
  draftOptions: unknown[];
  onAddDraftOption: (value: unknown) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

const OTHER = '__other__';

/**
 * CLIENT-SESSION-17 Part B — a `#ref` session attribute. Its choices are the creator's own profile
 * value(s) at `node.prefillKey` (`deriveRefChoices`) plus any "Other…" drafts. `cardinality`
 * decides the control: `SINGLE` → a single-select (a `<select>` for a scalar base, a radio list
 * for a record base), `LIST` → a multi-select checkbox list. Both end in an "Other…" affordance
 * that opens a nested modal for a value not on the profile — free text (scalar base) or the
 * definition's fields (record base). The suggested-results typeahead for that modal is
 * CLIENT-SESSION-18 (backend A14); writing a draft back to the profile is CLIENT-SESSION-19.
 */
export function RefField({
  node,
  fieldId,
  value,
  onChange,
  choiceSource,
  draftOptions,
  onAddDraftOption,
  definitionsByName,
}: RefFieldProps) {
  const isList = node.cardinality === 'LIST';
  const recordBase = node.type === 'DEFINITION' || node.type === 'DEFINITION_LIST';
  const definitionType =
    recordBase && node.definitionRef != null ? definitionsByName.get(node.definitionRef) : undefined;

  const choices = useMemo(() => {
    const derived = deriveRefChoices(node, choiceSource, definitionsByName);
    const drafts = draftOptions.map((draft) => draftToChoice(node, draft, definitionsByName));
    const merged: RefChoice[] = [];
    const seen = new Set<string>();
    // Also surface any already-selected value that isn't in either list (e.g. a stale draft),
    // so the control never hides a value it is actually submitting.
    const selectedValues = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
    for (const choice of [
      ...derived,
      ...drafts,
      ...selectedValues.map((v) => draftToChoice(node, v, definitionsByName)),
    ]) {
      if (seen.has(choice.key)) continue;
      seen.add(choice.key);
      merged.push(choice);
    }
    return merged;
  }, [node, choiceSource, draftOptions, value, definitionsByName]);

  const noProfileValues =
    deriveRefChoices(node, choiceSource, definitionsByName).length === 0 && draftOptions.length === 0;

  const [modalOpen, setModalOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftRecord, setDraftRecord] = useState<Record<string, unknown>>({});

  const openModal = () => {
    setDraftText('');
    setDraftRecord({});
    setModalOpen(true);
  };

  const commitDraft = () => {
    const entered: unknown = recordBase ? draftRecord : draftText.trim();
    if (recordBase ? Object.keys(draftRecord).length === 0 : draftText.trim() === '') return;
    onAddDraftOption(entered);
    if (isList) {
      const current = Array.isArray(value) ? value : [];
      onChange([...current, entered]);
    } else {
      onChange(entered);
    }
    setModalOpen(false);
  };

  const selectedKeys = (Array.isArray(value) ? value : value == null || value === '' ? [] : [value]).map(
    refValueKey,
  );
  const atCap = isList && selectedKeys.length >= MAX_LIST_ITEMS;

  const toggle = (choice: RefChoice, checked: boolean) => {
    const current = Array.isArray(value) ? value : [];
    onChange(
      checked
        ? [...current, choice.value]
        : current.filter((v) => refValueKey(v) !== choice.key),
    );
  };

  const modal = (
    <Dialog open={modalOpen} onOpenChange={setModalOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader title={`Add — ${node.label}`} onCloseClick={() => setModalOpen(false)} />
        <div className="flex flex-col gap-4 p-4">
          {recordBase && definitionType !== undefined ? (
            <DefinitionFields
              definitionType={definitionType}
              record={draftRecord}
              onChange={(next) => setDraftRecord(next)}
              definitionsByName={definitionsByName}
            />
          ) : (
            <div>
              <Label htmlFor={`${fieldId}-other`}>Value</Label>
              <Input
                id={`${fieldId}-other`}
                value={draftText}
                onChange={(event) => setDraftText(event.target.value)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={commitDraft}>
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  // SINGLE (any base) → native <select> of every derived/draft option + "Other…". A record-base
  // option shows its one-line summary text; the full nested record is shown read-only in the
  // session detail view.
  if (!isList) {
    const selectedKey = selectedKeys[0] ?? '';
    return (
      <div>
        <Label htmlFor={fieldId}>{node.label}</Label>
        <Select
          id={fieldId}
          value={choices.some((choice) => choice.key === selectedKey) ? selectedKey : ''}
          onChange={(event) => {
            if (event.target.value === OTHER) {
              openModal();
              return;
            }
            const picked = choices.find((choice) => choice.key === event.target.value);
            onChange(picked ? picked.value : '');
          }}
        >
          <option value="" disabled>
            Select…
          </option>
          {choices.map((choice) => (
            <option key={choice.key} value={choice.key}>
              {choice.text}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </Select>
        {noProfileValues && (
          <p className="mt-1 text-2xs text-text-muted">
            Nothing on your profile to pick from — use “Other…”.
          </p>
        )}
        {modal}
      </div>
    );
  }

  // LIST → checkbox list (a record-base entry renders its nested-record block inline).
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-text-secondary">{node.label}</legend>
      <div id={fieldId} className="flex flex-col gap-1.5">
        {choices.map((choice) => {
          const checked = selectedKeys.includes(choice.key);
          const disabled = !checked && atCap;
          return (
            <label
              key={choice.key}
              className="flex items-start gap-2 text-sm text-text-primary has-disabled:text-text-muted"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => toggle(choice, event.target.checked)}
              />
              <span className="min-w-0">{choice.node ?? choice.text}</span>
            </label>
          );
        })}
        {choices.length === 0 && (
          <p className="text-2xs text-text-muted">
            Nothing on your profile to pick from — use “Other…”.
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 self-start"
        disabled={atCap}
        onClick={openModal}
      >
        Other…
      </Button>
      {atCap && <p className="mt-1 text-2xs text-text-muted">{MAX_LIST_ITEMS} selected (maximum)</p>}
      {modal}
    </fieldset>
  );
}
