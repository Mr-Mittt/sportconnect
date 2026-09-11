import { useMemo, useState, type ReactNode } from 'react';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import type {
  ResolvedAttributeLayout,
  ResolvedRefAttribute,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { MAX_LIST_ITEMS } from '@/shared/types/sport';
import { cn } from '@/shared/lib/utils';
import { devWarn } from '@/shared/lib/devWarn';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { RadioGroup } from '@/shared/ui/radio-group';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { Select } from '@/shared/ui/select';
import { DefinitionFields } from './DefinitionFields';
import { normalizeLayout, pickLayoutId } from './layout';
import { applyRefFieldLayouts } from './refFieldLayouts';
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
  /** SPORT-16: the effective `layout` for this `#ref` node — `node.layout` with `#ref`→base
   * inheritance already applied by the caller (`node.layout ?? baseAttr.layout`). Defaults to
   * `node.layout` when omitted, so existing callers/tests need no change. */
  layout?: ResolvedAttributeLayout | null;
}

const OTHER = '__other__';
const SINGLE_LAYOUTS = ['dropdown', 'radio', 'segmented'] as const;
const LIST_LAYOUTS = ['checkboxes', 'chips', 'multiselect', 'ordered'] as const;
const SEGMENTED_MAX = 5;

/**
 * CLIENT-SESSION-17 Part B — a `#ref` session attribute. Its choices are the creator's own profile
 * value(s) at `node.prefillKey` (`deriveRefChoices`) plus any "Other…" drafts. `cardinality`
 * decides the base control: `SINGLE` → single-select, `LIST` → multi-select. Both end in an
 * "Other…" affordance that opens a nested modal for a value not on the profile.
 *
 * SPORT-15: `node.layout.id` **composes** with cardinality — `SINGLE` picks from the `ENUM` layout
 * set (`dropdown` / `radio` / `segmented`), `LIST` from the `LIST` container set
 * (`checkboxes` / `chips` / `multiselect` / `ordered`). Absent / unknown id → the default
 * (`dropdown` / `checkboxes`), byte-identical to pre-SPORT-15. The `#ref` data source and the
 * "Other…" typeahead are unchanged (CLIENT-SESSION-18 / SPORT-6).
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
  layout,
}: RefFieldProps) {
  const isList = node.cardinality === 'LIST';
  const effectiveLayout = layout === undefined ? node.layout : layout;
  const recordBase = node.type === 'DEFINITION' || node.type === 'DEFINITION_LIST';
  // SPORT-16: fold this node's `fieldLayouts` overrides into the definition it renders — every
  // record renderer below resolves the definition by name from this map. Returns the same map
  // reference when the node has no `fieldLayouts`, so the `choices` memo below stays stable.
  const effectiveDefinitions = useMemo(
    () => applyRefFieldLayouts(definitionsByName, node),
    [definitionsByName, node],
  );
  const definitionType =
    recordBase && node.definitionRef != null
      ? effectiveDefinitions.get(node.definitionRef)
      : undefined;

  const choices = useMemo(() => {
    const derived = deriveRefChoices(node, choiceSource, effectiveDefinitions);
    const drafts = draftOptions.map((draft) => draftToChoice(node, draft, effectiveDefinitions));
    const merged: RefChoice[] = [];
    const seen = new Set<string>();
    // Also surface any already-selected value that isn't in either list (e.g. a stale draft),
    // so the control never hides a value it is actually submitting.
    const selectedValues = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
    for (const choice of [
      ...derived,
      ...drafts,
      ...selectedValues.map((v) => draftToChoice(node, v, effectiveDefinitions)),
    ]) {
      if (seen.has(choice.key)) continue;
      seen.add(choice.key);
      merged.push(choice);
    }
    return merged;
  }, [node, choiceSource, draftOptions, value, effectiveDefinitions]);

  const noProfileValues =
    deriveRefChoices(node, choiceSource, effectiveDefinitions).length === 0 && draftOptions.length === 0;

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
              definitionsByName={effectiveDefinitions}
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

  const otherButton = (
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
  );

  // ── SINGLE ──────────────────────────────────────────────────────────────────────────────────
  if (!isList) {
    const selectedKey = selectedKeys[0] ?? '';
    const inChoices = choices.some((choice) => choice.key === selectedKey);
    let singleId = pickLayoutId(
      normalizeLayout(effectiveLayout, node.label).id,
      SINGLE_LAYOUTS,
      'dropdown',
      node.label,
    );
    if (singleId === 'segmented' && choices.length > SEGMENTED_MAX) {
      devWarn(
        `layout-id-degrade:${node.label}:segmented`,
        `"${node.label}" \`layout.id\` "segmented" has ${choices.length} choices (> ${SEGMENTED_MAX}) — using "dropdown"`,
      );
      singleId = 'dropdown';
    }

    if (singleId === 'dropdown') {
      return (
        <div>
          <Label htmlFor={fieldId}>{node.label}</Label>
          <Select
            id={fieldId}
            value={inChoices ? selectedKey : ''}
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

    const options = choices.map((choice) => ({ value: choice.key, label: choice.text }));
    const pick = (key: string) => {
      const picked = choices.find((choice) => choice.key === key);
      onChange(picked ? picked.value : '');
    };
    return (
      <div>
        <Label className="mb-1.5 block">{node.label}</Label>
        {singleId === 'segmented' ? (
          <SegmentedControl
            name={fieldId}
            aria-label={node.label}
            value={inChoices ? selectedKey : ''}
            onValueChange={pick}
            options={options}
          />
        ) : (
          <RadioGroup
            name={fieldId}
            aria-label={node.label}
            value={inChoices ? selectedKey : ''}
            onValueChange={pick}
            options={options}
          />
        )}
        {otherButton}
        {noProfileValues && (
          <p className="mt-1 text-2xs text-text-muted">
            Nothing on your profile to pick from — use “Other…”.
          </p>
        )}
        {modal}
      </div>
    );
  }

  // ── LIST ────────────────────────────────────────────────────────────────────────────────────
  const listId = pickLayoutId(
    normalizeLayout(effectiveLayout, node.label).id,
    LIST_LAYOUTS,
    'checkboxes',
    node.label,
  );

  const emptyHint = choices.length === 0 && (
    <p className="text-2xs text-text-muted">
      Nothing on your profile to pick from — use “Other…”.
    </p>
  );

  let control: ReactNode;
  if (listId === 'chips') {
    control = (
      <div id={fieldId} className="flex flex-wrap gap-1.5">
        {choices.map((choice) => {
          const checked = selectedKeys.includes(choice.key);
          const disabled = !checked && atCap;
          return (
            <button
              key={choice.key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => toggle(choice, !checked)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border-hairline px-2.5 py-1 text-2sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-not-allowed disabled:opacity-50',
                checked
                  ? 'border-border-accent bg-accent-solid text-white'
                  : 'border-border bg-surface-1 text-text-secondary hover:text-text-primary',
              )}
            >
              {checked && <span aria-hidden="true">✓</span>}
              {choice.text}
            </button>
          );
        })}
        {emptyHint}
      </div>
    );
  } else if (listId === 'multiselect') {
    control = (
      <select
        id={fieldId}
        multiple
        value={selectedKeys}
        size={Math.min(Math.max(choices.length, 3), 6)}
        onChange={(event) => {
          const keys = new Set(Array.from(event.target.selectedOptions, (o) => o.value));
          const next = choices.filter((choice) => keys.has(choice.key)).map((choice) => choice.value);
          onChange(next.length > MAX_LIST_ITEMS ? next.slice(0, MAX_LIST_ITEMS) : next);
        }}
        className="w-full rounded-lg border-hairline border-border bg-surface-2 p-1.5 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
      >
        {choices.map((choice) => (
          <option key={choice.key} value={choice.key}>
            {choice.text}
          </option>
        ))}
      </select>
    );
  } else if (listId === 'ordered') {
    const current = Array.isArray(value) ? value : [];
    const move = (index: number, delta: number) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    };
    const choiceByKey = new Map(choices.map((choice) => [choice.key, choice]));
    const unselected = choices.filter((choice) => !selectedKeys.includes(choice.key));
    control = (
      <div id={fieldId} className="flex flex-col gap-1.5">
        {current.map((rawValue, index) => {
          const key = refValueKey(rawValue);
          const choice = choiceByKey.get(key);
          const label = choice?.text ?? String(key);
          return (
            <div key={key} className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked
                onChange={() => onChange(current.filter((_v, i) => i !== index))}
                aria-label={`${label} (selected, position ${index + 1})`}
              />
              <span className="min-w-0 flex-1">{choice?.node ?? label}</span>
              <button
                type="button"
                aria-label={`Move ${label} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
                className="cursor-pointer rounded p-0.5 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconChevronUp className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Move ${label} down`}
                disabled={index === current.length - 1}
                onClick={() => move(index, 1)}
                className="cursor-pointer rounded p-0.5 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-not-allowed disabled:opacity-30"
              >
                <IconChevronDown className="size-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
        {unselected.map((choice) => (
          <label
            key={choice.key}
            className="flex items-start gap-2 text-sm text-text-primary has-disabled:text-text-muted"
          >
            <input
              type="checkbox"
              checked={false}
              disabled={atCap}
              onChange={(event) => toggle(choice, event.target.checked)}
            />
            <span className="min-w-0">{choice.node ?? choice.text}</span>
          </label>
        ))}
        {emptyHint}
      </div>
    );
  } else {
    control = (
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
        {emptyHint}
      </div>
    );
  }

  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-text-secondary">{node.label}</legend>
      {control}
      {otherButton}
      {atCap && <p className="mt-1 text-2xs text-text-muted">{MAX_LIST_ITEMS} selected (maximum)</p>}
      {modal}
    </fieldset>
  );
}
