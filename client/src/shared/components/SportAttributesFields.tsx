import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useId } from 'react';
import type {
  ResolvedSportAttributeDefinition,
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeField,
  ResolvedSportAttributeGroup,
  ResolvedSportAttributeOption,
  ResolvedSportAttributeSchema,
} from '@/shared/types/sport';
import { MAX_LIST_ITEMS } from '@/shared/types/sport';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';

export interface SportAttributesFieldsProps {
  /** A9/v2's resolved schema document for this sport, already fetched by the caller
   * (`useSportAttributeSchema`). */
  schema: ResolvedSportAttributeSchema;
  /** Flat key -> value map, matching `UserSportProfile.attributes`. A `DEFINITION` value is a
   * plain object; a `DEFINITION_LIST`/`LIST` value is an array. */
  values: Record<string, unknown>;
  /** Fires with a top-level attribute key and its whole new value — never a nested field path.
   * A nested edit inside a `DEFINITION`/`DEFINITION_LIST` is composed locally and reported as one
   * call with the enclosing attribute's key. */
  onChange: (key: string, value: unknown) => void;
}

function isGroupVisible(group: ResolvedSportAttributeGroup): boolean {
  return group.isAvailable !== false;
}

function isAttributeVisible(attribute: ResolvedSportAttributeDefinition): boolean {
  return attribute.isAvailable !== false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * SPORT-2: renders a user's per-sport attribute fields from A9/v2's server-driven schema.
 * Presentational and controlled — see `SportAttributesFieldsProps`. No page hosts this yet
 * (PROFILE-4 will); verified standalone via Storybook/Vitest.
 *
 * Rules honoured here (from `SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md`, not re-derived elsewhere):
 * `isAvailable: false` hides a node and its whole subtree (parent wins); an unknown `type` is
 * skipped, not crashed on; an empty/all-unavailable schema renders nothing; `defaultValue` seeds
 * a field with no stored value, once, as a real controlled value (not just a display illusion);
 * `LIST`/`DEFINITION_LIST` are capped at `MAX_LIST_ITEMS` client-side, since the server silently
 * drops the whole value over the cap instead of erroring.
 */
export function SportAttributesFields({ schema, values, onChange }: SportAttributesFieldsProps) {
  useEffect(() => {
    for (const group of schema.groups) {
      if (!isGroupVisible(group)) continue;
      for (const attribute of group.attributes) {
        if (!isAttributeVisible(attribute)) continue;
        if (attribute.defaultValue === undefined || attribute.defaultValue === null) continue;
        if (values[attribute.key] !== undefined) continue;
        onChange(attribute.key, attribute.defaultValue);
      }
    }
    // Seed defaults once per fetched schema, not on every `values`/`onChange` identity change —
    // `values[attribute.key] !== undefined` above is what actually stops this from re-firing
    // once the caller's state reflects the seeded value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const definitionsByName = new Map<string, ResolvedSportAttributeDefinitionType>(
    (schema.definitions ?? []).map((definitionType) => [definitionType.name, definitionType]),
  );

  const visibleGroups = schema.groups.filter(
    (group) => isGroupVisible(group) && group.attributes.some(isAttributeVisible),
  );

  if (visibleGroups.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {visibleGroups.map((group) => (
        <div key={group.key} className="flex flex-col gap-3.5">
          <h3 className="text-sm font-semibold text-text-primary">{group.label}</h3>
          <div className="flex flex-col gap-3.5">
            {group.attributes.filter(isAttributeVisible).map((attribute) => (
              <AttributeField
                key={attribute.key}
                attribute={attribute}
                value={values[attribute.key]}
                onChange={(value) => onChange(attribute.key, value)}
                definitionsByName={definitionsByName}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface AttributeFieldProps {
  attribute: ResolvedSportAttributeDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

function AttributeField({ attribute, value, onChange, definitionsByName }: AttributeFieldProps) {
  const fieldId = `sport-attribute-${attribute.key}`;

  switch (attribute.type) {
    case 'STRING':
      return (
        <div>
          <Label htmlFor={fieldId}>{attribute.label}</Label>
          <Input
            id={fieldId}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      );

    case 'ENUM':
      return (
        <div>
          <Label htmlFor={fieldId}>{attribute.label}</Label>
          <Select
            id={fieldId}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="" disabled>
              Select…
            </option>
            {(attribute.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      );

    case 'LIST':
      return (
        <ListField
          fieldId={fieldId}
          label={attribute.label}
          options={attribute.options ?? []}
          selected={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
        />
      );

    case 'DEFINITION': {
      const definitionType =
        attribute.definitionRef != null ? definitionsByName.get(attribute.definitionRef) : undefined;
      if (definitionType === undefined) return null;
      return (
        <fieldset className="border-hairline flex flex-col gap-3 rounded-lg border-border p-3">
          <legend className="px-1 text-2sm font-medium text-text-secondary">{attribute.label}</legend>
          <DefinitionFields
            definitionType={definitionType}
            record={isRecord(value) ? value : {}}
            onChange={onChange}
            definitionsByName={definitionsByName}
          />
        </fieldset>
      );
    }

    case 'DEFINITION_LIST': {
      const definitionType =
        attribute.definitionRef != null ? definitionsByName.get(attribute.definitionRef) : undefined;
      if (definitionType === undefined) return null;
      return (
        <DefinitionListField
          label={attribute.label}
          definitionType={definitionType}
          rows={Array.isArray(value) ? (value as Record<string, unknown>[]) : []}
          onChange={onChange}
          definitionsByName={definitionsByName}
        />
      );
    }

    // A schema-declared type this client doesn't yet know — degrade, don't crash. The schema is
    // admin-authored data driving client rendering; a client older than a newly-added type must
    // skip it silently.
    default:
      return null;
  }
}

interface ListFieldProps {
  fieldId: string;
  label: string;
  options: ResolvedSportAttributeOption[];
  selected: string[];
  onChange: (value: string[]) => void;
}

function ListField({ fieldId, label, options, selected, onChange }: ListFieldProps) {
  const atCap = selected.length >= MAX_LIST_ITEMS;
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-text-secondary">{label}</legend>
      <div id={fieldId} className="flex flex-col gap-1.5">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          const disabled = !checked && atCap;
          return (
            <label
              key={option.value}
              className="flex items-center gap-2 text-sm text-text-primary has-disabled:text-text-muted"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => {
                  onChange(
                    event.target.checked
                      ? [...selected, option.value]
                      : selected.filter((value) => value !== option.value),
                  );
                }}
              />
              {option.label}
            </label>
          );
        })}
      </div>
      {atCap && (
        <p className="mt-1 text-2xs text-text-muted">
          {MAX_LIST_ITEMS} selected (maximum)
        </p>
      )}
    </fieldset>
  );
}

interface DefinitionFieldsProps {
  definitionType: ResolvedSportAttributeDefinitionType;
  record: Record<string, unknown>;
  onChange: (record: Record<string, unknown>) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

function DefinitionFields({
  definitionType,
  record,
  onChange,
  definitionsByName,
}: DefinitionFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      {definitionType.fields.map((field) => (
        <DefinitionField
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

interface DefinitionFieldProps {
  field: ResolvedSportAttributeField;
  value: unknown;
  onChange: (value: unknown) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

/** One field inside a `DEFINITION`/`DEFINITION_LIST` record. `useId()` for every id here (not a
 * key-derived id like the top-level `AttributeField`) — a `DEFINITION_LIST` repeats this
 * component once per row, and a key-derived id would collide across rows. */
function DefinitionField({ field, value, onChange, definitionsByName }: DefinitionFieldProps) {
  const fieldId = useId();
  const isRequired = field.isRequired === true;
  const showRequiredHint = isRequired && isEmptyValue(value);
  const label = isRequired ? `${field.label} *` : field.label;

  switch (field.type) {
    case 'STRING':
      return (
        <div>
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            aria-required={isRequired}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
          {showRequiredHint && <p className="mt-1 text-2xs text-text-danger">Required</p>}
        </div>
      );

    case 'ENUM':
      return (
        <div>
          <Label htmlFor={fieldId}>{label}</Label>
          <Select
            id={fieldId}
            aria-required={isRequired}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="" disabled>
              Select…
            </option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {showRequiredHint && <p className="mt-1 text-2xs text-text-danger">Required</p>}
        </div>
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

    // A definition field is never `DEFINITION_LIST` (depth-2 rule) and never an unrecognized
    // type by contract — but degrade rather than crash if either ever slips through.
    default:
      return null;
  }
}

interface DefinitionListFieldProps {
  label: string;
  definitionType: ResolvedSportAttributeDefinitionType;
  rows: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

function DefinitionListField({
  label,
  definitionType,
  rows,
  onChange,
  definitionsByName,
}: DefinitionListFieldProps) {
  const atCap = rows.length >= MAX_LIST_ITEMS;
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* Rows have no element identity (v2 design §9.1 — a write replaces the whole list),
              so the array index is the only available React key, which is correct here rather
              than a workaround. */}
          {rows.map((row, index) => (
            <div
              key={index}
              className="border-hairline flex flex-col gap-3 rounded-lg border-border p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-2xs font-medium text-text-secondary">Item {index + 1}</span>
                <button
                  type="button"
                  aria-label={`Remove item ${index + 1}`}
                  onClick={() => onChange(rows.filter((_row, rowIndex) => rowIndex !== index))}
                  className="cursor-pointer rounded p-0.5 text-text-secondary hover:text-text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                >
                  <IconTrash className="size-4" aria-hidden="true" />
                </button>
              </div>
              <DefinitionFields
                definitionType={definitionType}
                record={row}
                onChange={(next) =>
                  onChange(rows.map((existingRow, rowIndex) => (rowIndex === index ? next : existingRow)))
                }
                definitionsByName={definitionsByName}
              />
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={atCap}
        onClick={() => onChange([...rows, {}])}
        className="self-start"
      >
        <IconPlus className="size-4" aria-hidden="true" />
        Add
      </Button>
      {atCap && <p className="text-2xs text-text-muted">{MAX_LIST_ITEMS} items (maximum)</p>}
    </div>
  );
}
