import { useId } from 'react';
import type {
  ResolvedAttributeLayout,
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeField,
} from '@/shared/types/sport';
import { BooleanField } from './BooleanField';
import { EnumField } from './EnumField';
import { renderHeadingLabel } from './headingIcons';
import { normalizeLayout, pickLayoutId } from './layout';
import { ListField } from './ListField';
import { NumberField } from './NumberField';
import { StringField } from './StringField';

interface DefinitionFieldsProps {
  definitionType: ResolvedSportAttributeDefinitionType;
  record: Record<string, unknown>;
  onChange: (record: Record<string, unknown>) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
  /** SPORT-14: record-body arrangement for a `DEFINITION` node — `stacked` (default, unchanged),
   * `inline` (label-left rows, CSS-only — scalar fields split via `display:contents`; `LIST` /
   * nested `DEFINITION` fields span both columns and stay stacked), `grid-2` (fields in a
   * responsive 2-col grid). Absent/unknown → `stacked`. Not read by the `DEFINITION_LIST` rows or
   * the `#ref` "Other…" modal, which always pass `stacked`. */
  layout?: ResolvedAttributeLayout | null;
}

/** SPORT-14: per-child wrapper for the `inline` record layout. `display:contents` on a scalar
 * field's own root `<div>` lifts its `<Label>` + control into this 2-col grid without the arm
 * needing to know; a `<fieldset>`-rooted field (`LIST`, nested `DEFINITION`) spans both columns. */
const INLINE_ROW =
  'grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 [&>div]:contents [&>div>fieldset]:col-span-2 [&>fieldset]:col-span-2';

/** The body of a `DEFINITION`/`DEFINITION_LIST` record — one `RecordField` per declared field.
 * Moved from `SportAttributesFields` (CLIENT-SESSION-17 Part A); SPORT-14 adds `layout`. The
 * `stacked` default is byte-identical to the pre-SPORT-14 markup. */
export function DefinitionFields({
  definitionType,
  record,
  onChange,
  definitionsByName,
  layout,
}: DefinitionFieldsProps) {
  const kind = pickLayoutId(
    normalizeLayout(layout, definitionType.name).id,
    ['stacked', 'inline', 'grid-2'] as const,
    'stacked',
    definitionType.name,
  );

  const rows = definitionType.fields.map((field) => {
    const row = (
      <RecordField
        key={field.key}
        field={field}
        value={record[field.key]}
        onChange={(value) => onChange({ ...record, [field.key]: value })}
        definitionsByName={definitionsByName}
      />
    );
    // `inline` needs a per-row grid wrapper; `stacked`/`grid-2` render the `RecordField` directly
    // so the `stacked` default DOM stays byte-identical to pre-SPORT-14.
    return kind === 'inline' ? (
      <div key={field.key} className={INLINE_ROW}>
        {row}
      </div>
    ) : (
      row
    );
  });

  if (kind === 'grid-2') {
    return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{rows}</div>;
  }
  if (kind === 'inline') {
    return <div className="flex flex-col gap-1">{rows}</div>;
  }
  return <div className="flex flex-col gap-3">{rows}</div>;
}

export interface RecordFieldProps {
  field: ResolvedSportAttributeField;
  value: unknown;
  onChange: (value: unknown) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * One field inside a `DEFINITION`/`DEFINITION_LIST` record — the record-context per-type dispatch
 * (CLIENT-SESSION-17 Part A). `useId()` for every id (not a key-derived id) — a `DEFINITION_LIST`
 * repeats this once per row and a key-derived id would collide. Delegates to the same per-arm
 * control components the top-level dispatcher uses, in `variant="record"` (adds the required hint
 * + `aria-required`). Rendered output is byte-identical to the prior inline `switch`. SPORT-14
 * exports it so `DefinitionListField`'s `table` layout can render one field per cell.
 */
export function RecordField({ field, value, onChange, definitionsByName }: RecordFieldProps) {
  const fieldId = useId();
  const isRequired = field.isRequired === true;
  const showRequiredHint = isRequired && isEmptyValue(value);
  const label = isRequired ? `${field.label} *` : field.label;
  const hint = showRequiredHint ? (
    <p className="mt-1 text-2xs text-text-danger">Required</p>
  ) : undefined;

  switch (field.type) {
    case 'STRING':
      return (
        <StringField
          variant="record"
          fieldId={fieldId}
          label={label}
          value={value}
          onChange={onChange}
          ariaRequired={isRequired}
          requiredHint={hint}
          layout={field.layout ?? undefined}
        />
      );

    case 'NUMBER':
      return (
        <NumberField
          variant="record"
          attribute={field}
          fieldId={fieldId}
          label={label}
          value={value}
          onChange={onChange}
          ariaRequired={isRequired}
          requiredHint={hint}
          layout={field.layout ?? undefined}
        />
      );

    case 'BOOLEAN':
      return (
        <BooleanField
          variant="record"
          fieldId={fieldId}
          label={label}
          value={value}
          onChange={onChange}
          ariaRequired={isRequired}
          requiredHint={hint}
          layout={field.layout ?? undefined}
        />
      );

    case 'ENUM':
      return (
        <EnumField
          variant="record"
          attribute={field}
          fieldId={fieldId}
          label={label}
          value={value}
          onChange={onChange}
          ariaRequired={isRequired}
          requiredHint={hint}
          layout={field.layout ?? undefined}
        />
      );

    case 'LIST':
      return (
        <div>
          <ListField
            fieldId={fieldId}
            label={label}
            options={field.options ?? []}
            selected={Array.isArray(value) ? (value as string[]) : []}
            onChange={onChange}
          />
          {showRequiredHint && <p className="mt-1 text-2xs text-text-danger">Required</p>}
        </div>
      );

    case 'DEFINITION': {
      const definitionType =
        field.definitionRef != null ? definitionsByName.get(field.definitionRef) : undefined;
      if (definitionType === undefined) return null;
      return (
        <fieldset className="border-hairline flex flex-col gap-3 rounded-lg border-border p-3">
          <legend className="px-1 text-2sm font-medium text-text-secondary">
            {renderHeadingLabel(label, normalizeLayout(field.layout, field.key).icon, field.key)}
          </legend>
          <DefinitionFields
            definitionType={definitionType}
            record={isRecord(value) ? value : {}}
            onChange={onChange}
            definitionsByName={definitionsByName}
            layout={field.layout ?? undefined}
          />
          {showRequiredHint && <p className="text-2xs text-text-danger">Required</p>}
        </fieldset>
      );
    }

    // A definition field is never `DEFINITION_LIST` (depth-2 rule) and never an unrecognized type
    // by contract — degrade rather than crash if either ever slips through, while the `never`
    // binding keeps the switch compile-time exhaustive over the field union.
    default: {
      const unhandled: never = field;
      void unhandled;
      return null;
    }
  }
}
