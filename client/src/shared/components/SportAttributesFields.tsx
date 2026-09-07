import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useId, type ReactNode } from 'react';
import type {
  ResolvedSportAttributeDefinition,
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeField,
  ResolvedSportAttributeGroup,
  ResolvedSportAttributeOption,
  ResolvedSportAttributeSchema,
} from '@/shared/types/sport';
import { MAX_LIST_ITEMS } from '@/shared/types/sport';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';

export interface SportAttributesFieldsProps {
  /** A9/v2's resolved schema document for this sport, already fetched by the caller
   * (`useSportAttributeSchema`). v3/A19: `groups` is a tree — each group may carry nested
   * `groups` alongside its `attributes`. */
  schema: ResolvedSportAttributeSchema;
  /** Flat path -> value map, matching `UserSportProfile.attributes`. v3/A19: the key is each
   * attribute's **full `/`-separated path** from the schema root (`gear/rackets`,
   * `general/handedness`) — not the bare leaf key. A `DEFINITION` value is a plain object; a
   * `DEFINITION_LIST`/`LIST` value is an array. Nested record fields inside a `DEFINITION` value
   * keep their bare keys — only the top-level attribute key is a path. */
  values: Record<string, unknown>;
  /** Fires with an attribute's **full `/`-separated path** and its whole new value — never a
   * nested field path inside a `DEFINITION`/`DEFINITION_LIST`, which is composed locally and
   * reported as one call with the enclosing attribute's path. */
  onChange: (key: string, value: unknown) => void;
}

function isGroupAvailable(group: ResolvedSportAttributeGroup): boolean {
  return group.isAvailable !== false;
}

function isAttributeVisible(attribute: ResolvedSportAttributeDefinition): boolean {
  return attribute.isAvailable !== false;
}

/**
 * Whether a group contributes anything to render: it must be available (v3/A19 — parent-wins at
 * every depth, so an unavailable group is empty regardless of its subtree) *and* have either a
 * visible direct attribute or a descendant sub-group that itself has visible content.
 */
function groupHasVisibleContent(group: ResolvedSportAttributeGroup): boolean {
  if (!isGroupAvailable(group)) return false;
  if (group.attributes.some(isAttributeVisible)) return true;
  return (group.groups ?? []).some(groupHasVisibleContent);
}

/** Full `/`-separated path of a child node — `''` prefix (a root group) yields the bare key. */
function joinPath(prefix: string, key: string): string {
  return prefix === '' ? key : `${prefix}/${key}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * SPORT-2/SPORT-7: renders a user's per-sport attribute fields from A9's server-driven schema.
 * Presentational and controlled — see `SportAttributesFieldsProps`. Hosted by PROFILE-4's
 * `SportProfileSettingsTab`; verified standalone via Storybook/Vitest.
 *
 * Rules honoured here (from the v2/v3 schema design docs, not re-derived elsewhere):
 * `isAvailable: false` hides a node and its whole subtree at every depth (parent wins); an unknown
 * `type` is skipped, not crashed on; an empty/all-unavailable schema renders nothing; `defaultValue`
 * seeds a field with no stored value, once, as a real controlled value (not just a display
 * illusion); `LIST`/`DEFINITION_LIST` are capped at `MAX_LIST_ITEMS` client-side, since the server
 * silently drops the whole value over the cap instead of erroring.
 *
 * SPORT-7/A19 (v3):
 * - **Array-position order** — groups and attributes render in declared array order; the removed
 *   `order` field is not consulted.
 * - **Nested groups** — `schema.groups` is a tree; each (sub-)group renders as a collapsible
 *   section (default expanded), one indent level deeper per depth. `groupHasVisibleContent`
 *   recurses so a group with no direct attributes but a visible sub-group still shows.
 * - **Responsive layout** — a group's own primitive fields flow in a 1-col -> 2-col grid at `sm`;
 *   `DEFINITION`/`DEFINITION_LIST` stay full-width. Sub-groups always stack below the grid.
 * - **Path-keyed I/O** — `values` and `onChange` key by each attribute's full `/`-separated path
 *   from the schema root, built while walking the tree.
 *
 * SPORT-9/A16: `NUMBER` stores a real `number` (never `''`/`NaN` — an empty/cleared field reports
 * `undefined`) with `min`/`max` mirrored as `<input>` bounds when present; `BOOLEAN` stores a real
 * `boolean` via the shared `Switch`. Both a UX affordance only — the server silently drops an
 * out-of-range/wrong-type value on save (A3 merge semantics keep the field's previous value)
 * rather than erroring, so neither type produces a client-side hard error.
 */
export function SportAttributesFields({ schema, values, onChange }: SportAttributesFieldsProps) {
  useEffect(() => {
    const seedDefaults = (groups: ResolvedSportAttributeGroup[], prefix: string) => {
      for (const group of groups) {
        if (!isGroupAvailable(group)) continue;
        const groupPath = joinPath(prefix, group.key);
        for (const attribute of group.attributes) {
          if (!isAttributeVisible(attribute)) continue;
          if (attribute.defaultValue === undefined || attribute.defaultValue === null) continue;
          const attributePath = joinPath(groupPath, attribute.key);
          if (values[attributePath] !== undefined) continue;
          onChange(attributePath, attribute.defaultValue);
        }
        seedDefaults(group.groups ?? [], groupPath);
      }
    };
    seedDefaults(schema.groups, '');
    // Seed defaults once per fetched schema, not on every `values`/`onChange` identity change —
    // `values[attributePath] !== undefined` above is what actually stops this from re-firing
    // once the caller's state reflects the seeded value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema]);

  const definitionsByName = new Map<string, ResolvedSportAttributeDefinitionType>(
    (schema.definitions ?? []).map((definitionType) => [definitionType.name, definitionType]),
  );

  const visibleGroups = schema.groups.filter(groupHasVisibleContent);

  if (visibleGroups.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {visibleGroups.map((group) => (
        <GroupSection
          key={group.key}
          group={group}
          path={group.key}
          depth={0}
          values={values}
          onChange={onChange}
          definitionsByName={definitionsByName}
        />
      ))}
    </div>
  );
}

interface GroupSectionProps {
  group: ResolvedSportAttributeGroup;
  /** Full `/`-separated path of this group from the schema root. */
  path: string;
  depth: number;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

/** One (sub-)group as a collapsible section. Own attributes render first in a responsive grid,
 * then visible sub-groups stack below, each one indent level deeper. Default expanded; collapsed
 * state is local (Radix-owned) and not persisted. */
function GroupSection({
  group,
  path,
  depth,
  values,
  onChange,
  definitionsByName,
}: GroupSectionProps) {
  const visibleAttributes = group.attributes.filter(isAttributeVisible);
  const visibleSubGroups = (group.groups ?? []).filter(groupHasVisibleContent);
  const Heading = depth === 0 ? 'h3' : 'h4';

  return (
    <Collapsible
      defaultOpen
      className={cn('flex flex-col gap-3.5', depth > 0 && 'border-l border-border pl-3')}
    >
      {/* Heading wraps the trigger (WAI-ARIA accordion pattern) so screen-reader heading
          navigation still works while the whole row stays the collapse toggle. */}
      <Heading className="text-sm font-semibold text-text-primary">
        <CollapsibleTrigger className="py-0.5">{group.label}</CollapsibleTrigger>
      </Heading>
      <CollapsibleContent className="flex flex-col gap-4">
        {visibleAttributes.length > 0 && (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {visibleAttributes.map((attribute) => {
              const attributePath = joinPath(path, attribute.key);
              return (
                <AttributeField
                  key={attribute.key}
                  attribute={attribute}
                  path={attributePath}
                  value={values[attributePath]}
                  onChange={(value) => onChange(attributePath, value)}
                  definitionsByName={definitionsByName}
                />
              );
            })}
          </div>
        )}
        {visibleSubGroups.map((subGroup) => (
          <GroupSection
            key={subGroup.key}
            group={subGroup}
            path={joinPath(path, subGroup.key)}
            depth={depth + 1}
            values={values}
            onChange={onChange}
            definitionsByName={definitionsByName}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

interface AttributeFieldProps {
  attribute: ResolvedSportAttributeDefinition;
  /** Full `/`-separated path — used for a collision-free field id across nested groups. */
  path: string;
  value: unknown;
  onChange: (value: unknown) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

function AttributeField({ attribute, path, value, onChange, definitionsByName }: AttributeFieldProps) {
  const fieldId = `sport-attribute-${path}`;
  // DEFINITION/DEFINITION_LIST render as indented sub-sections — never squeezed into a grid
  // column half.
  const fullWidth = attribute.type === 'DEFINITION' || attribute.type === 'DEFINITION_LIST';

  const control = ((): ReactNode => {
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

      case 'NUMBER':
        return (
          <div>
            <Label htmlFor={fieldId}>{attribute.label}</Label>
            <Input
              id={fieldId}
              type="number"
              step="any"
              min={attribute.min ?? undefined}
              max={attribute.max ?? undefined}
              value={typeof value === 'number' ? value : ''}
              onChange={(event) => {
                const parsed = event.target.valueAsNumber;
                onChange(Number.isNaN(parsed) ? undefined : parsed);
              }}
            />
          </div>
        );

      case 'BOOLEAN':
        return (
          <div className="flex items-center justify-between gap-3">
            <Label className="mb-0">{attribute.label}</Label>
            <Switch
              aria-label={attribute.label}
              checked={typeof value === 'boolean' ? value : false}
              onCheckedChange={onChange}
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
          attribute.definitionRef != null
            ? definitionsByName.get(attribute.definitionRef)
            : undefined;
        if (definitionType === undefined) return null;
        return (
          <fieldset className="border-hairline flex flex-col gap-3 rounded-lg border-border p-3">
            <legend className="px-1 text-2sm font-medium text-text-secondary">
              {attribute.label}
            </legend>
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
          attribute.definitionRef != null
            ? definitionsByName.get(attribute.definitionRef)
            : undefined;
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
  })();

  // An unknown type (or a malformed DEFINITION with no resolvable ref) renders no grid cell at
  // all, rather than an empty column.
  if (control === null) return null;

  return <div className={cn('min-w-0', fullWidth && 'sm:col-span-2')}>{control}</div>;
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

    case 'NUMBER':
      return (
        <div>
          <Label htmlFor={fieldId}>{label}</Label>
          <Input
            id={fieldId}
            type="number"
            step="any"
            min={field.min ?? undefined}
            max={field.max ?? undefined}
            aria-required={isRequired}
            value={typeof value === 'number' ? value : ''}
            onChange={(event) => {
              const parsed = event.target.valueAsNumber;
              onChange(Number.isNaN(parsed) ? undefined : parsed);
            }}
          />
          {showRequiredHint && <p className="mt-1 text-2xs text-text-danger">Required</p>}
        </div>
      );

    case 'BOOLEAN':
      return (
        <div className="flex items-center justify-between gap-3">
          <Label className="mb-0">{label}</Label>
          <Switch
            aria-label={label}
            checked={typeof value === 'boolean' ? value : false}
            onCheckedChange={onChange}
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
