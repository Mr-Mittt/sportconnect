import { useId } from 'react';
import type {
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeField,
} from '@/shared/types/sport';
import { BooleanField } from './BooleanField';
import { EnumField } from './EnumField';
import { ListField } from './ListField';
import { NumberField } from './NumberField';
import { StringField } from './StringField';

interface DefinitionFieldsProps {
  definitionType: ResolvedSportAttributeDefinitionType;
  record: Record<string, unknown>;
  onChange: (record: Record<string, unknown>) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

/** The body of a `DEFINITION`/`DEFINITION_LIST` record — one `RecordField` per declared field.
 * Moved verbatim from `SportAttributesFields` (CLIENT-SESSION-17 Part A). */
export function DefinitionFields({
  definitionType,
  record,
  onChange,
  definitionsByName,
}: DefinitionFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      {definitionType.fields.map((field) => (
        <RecordField
          key={field.key}
          field={field}
          value={record[field.key]}
          onChange={(value) => onChange({ ...record, [field.key]: value })}
          definitionsByName={definitionsByName}
        />
      ))}
    </div>
  );
}

interface RecordFieldProps {
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
 * + `aria-required`). Rendered output is byte-identical to the prior inline `switch`.
 */
function RecordField({ field, value, onChange, definitionsByName }: RecordFieldProps) {
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
          <legend className="px-1 text-2sm font-medium text-text-secondary">{label}</legend>
          <DefinitionFields
            definitionType={definitionType}
            record={isRecord(value) ? value : {}}
            onChange={onChange}
            definitionsByName={definitionsByName}
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
