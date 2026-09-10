import { useEffect, type ReactNode } from 'react';
import type {
  ResolvedSportAttributeDefinition,
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeGroup,
  ResolvedSportAttributeSchema,
} from '@/shared/types/sport';
import { isRefAttribute } from '@/shared/types/sport';
import { assertNever } from '@/shared/lib/assertNever';
import { cn } from '@/shared/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { BooleanField } from './attributeFields/BooleanField';
import { DefinitionField } from './attributeFields/DefinitionField';
import { DefinitionListField } from './attributeFields/DefinitionListField';
import { EnumField } from './attributeFields/EnumField';
import { renderHeadingLabel } from './attributeFields/headingIcons';
import { normalizeLayout, pickLayoutId } from './attributeFields/layout';
import { ListField } from './attributeFields/ListField';
import { NumberField } from './attributeFields/NumberField';
import { RefField } from './attributeFields/RefField';
import { findAttributeByPath } from './attributeFields/refFieldLayouts';
import { StringField } from './attributeFields/StringField';

const GROUP_LAYOUTS = ['section', 'grid-2', 'grid-3', 'inline', 'flat'] as const;

/** SPORT-14: the inner attribute-wrapper for each `group` layout. `section` (default) and `grid-2`
 * are the same string SPORT-7 hardcoded — the default output is byte-identical. */
const GROUP_ATTR_WRAPPER: Record<(typeof GROUP_LAYOUTS)[number], string> = {
  section: 'grid grid-cols-1 gap-3.5 sm:grid-cols-2',
  'grid-2': 'grid grid-cols-1 gap-3.5 sm:grid-cols-2',
  'grid-3': 'grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3',
  inline: 'flex flex-col gap-1',
  flat: 'flex flex-col gap-3.5',
};

/** SPORT-14: per-child wrapper for the `inline` group layout. `display:contents` on the
 * `AttributeField` cell and a scalar arm's own root `<div>` lifts its `<Label>` + control into
 * this 2-col grid without touching the arm; `<fieldset>`-rooted arms (`LIST` / `DEFINITION`) span
 * both columns and keep their stacked layout. Known limitation (SPORT-14 impl notes): `BOOLEAN` /
 * radio / segmented arms have internal flex, so they render label-left with looser alignment. */
const GROUP_INLINE_ROW =
  'grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 [&>.min-w-0]:contents [&>.min-w-0>div]:contents [&>.min-w-0>fieldset]:col-span-2';

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
  /**
   * CLIENT-SESSION-17 Part B — the creator's own `profile.attributes` for this sport. Enables
   * `#ref` (`prefillable`) node rendering: a `#ref` node's choices are the value(s) stored here at
   * its `prefillKey`. Only the session-create context passes it; the profile editor leaves it
   * `undefined` (its schema has no `#ref` nodes), and a `#ref` node encountered without a choice
   * source renders nothing.
   */
  refChoiceSource?: Record<string, unknown> | null;
  /** CLIENT-SESSION-17 Part B — accumulated "Other…" draft values per `#ref` node path. */
  refDraftOptions?: Record<string, unknown[]>;
  /** CLIENT-SESSION-17 Part B — records a new "Other…" draft value for a `#ref` node path. */
  onAddRefDraftOption?: (path: string, value: unknown) => void;
  /**
   * SPORT-16 — the resolved *profile* schema for this sport (`useSportAttributeSchema`). Only the
   * session-create context passes it. A `#ref` node with no own `layout` inherits the base
   * attribute's (`node.layout ?? baseAttr.layout` at `node.prefillKey`) — `common` C11's
   * client-side resolution of the `#ref`→base inheritance decision.
   */
  refBaseSchema?: ResolvedSportAttributeSchema | null;
}

function isGroupAvailable(group: ResolvedSportAttributeGroup): boolean {
  // SPORT-15: `hidden` suppresses the whole subtree in the editor, the same as a soft delete —
  // the stored values under it are untouched (a `hidden` group is code-managed data).
  return group.isAvailable !== false && group.hidden !== true;
}

function isAttributeVisible(attribute: ResolvedSportAttributeDefinition): boolean {
  // SPORT-15: `hidden` ⇒ no input (value is code-written, e.g. a `Reference.url`). `hidden` wins
  // over any required flag (C11 rejects both upstream; this must not crash on a bad schema).
  return attribute.isAvailable !== false && attribute.hidden !== true;
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

const KNOWN_TYPES = new Set<string>([
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'ENUM',
  'LIST',
  'DEFINITION',
  'DEFINITION_LIST',
]);

/**
 * SPORT-2/SPORT-7: renders a user's per-sport attribute fields from A9's server-driven schema.
 * Presentational and controlled — see `SportAttributesFieldsProps`. Hosted by PROFILE-4's
 * `SportProfileSettingsTab` (profile schema) and CLIENT-SESSION-15's `CreateSessionModal`
 * "Session detail" section (session schema).
 *
 * Rules honoured here (from the v2/v3 schema design docs, not re-derived elsewhere):
 * `isAvailable: false` hides a node and its whole subtree at every depth (parent wins); an unknown
 * `type` is skipped, not crashed on; an empty/all-unavailable schema renders nothing; `defaultValue`
 * seeds a field with no stored value, once, as a real controlled value (not just a display
 * illusion); `LIST`/`DEFINITION_LIST` are capped at `MAX_LIST_ITEMS` client-side, since the server
 * silently drops the whole value over the cap instead of erroring.
 *
 * CLIENT-SESSION-17 Part A: the per-type `switch` here is now a dispatch to one component per
 * `SportAttributeType` arm (`attributeFields/`), with `assertNever` for compile-time exhaustiveness
 * and a runtime `KNOWN_TYPES` guard preserving the "unknown type → skip" behaviour. Part B: a
 * `#ref` (`prefillable`) node renders through `RefField` (single-/multi-select sourced from
 * `refChoiceSource`) instead of switching on its inherited `type`.
 *
 * SPORT-7/A19 (v3): array-position order; nested groups as collapsible sections; responsive
 * 1→2-col grid for a group's own primitive fields (`DEFINITION`/`DEFINITION_LIST` full-width);
 * path-keyed `values`/`onChange`.
 *
 * SPORT-9/A16: `NUMBER` stores a real `number` (empty → `undefined`) with `min`/`max` mirrored as
 * `<input>` bounds; `BOOLEAN` stores a real `boolean` via the shared `Switch`.
 */
export function SportAttributesFields({
  schema,
  values,
  onChange,
  refChoiceSource,
  refDraftOptions,
  onAddRefDraftOption,
  refBaseSchema,
}: SportAttributesFieldsProps) {
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
          refChoiceSource={refChoiceSource}
          refDraftOptions={refDraftOptions}
          onAddRefDraftOption={onAddRefDraftOption}
          refBaseSchema={refBaseSchema}
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
  refChoiceSource?: Record<string, unknown> | null;
  refDraftOptions?: Record<string, unknown[]>;
  onAddRefDraftOption?: (path: string, value: unknown) => void;
  refBaseSchema?: ResolvedSportAttributeSchema | null;
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
  refChoiceSource,
  refDraftOptions,
  onAddRefDraftOption,
  refBaseSchema,
}: GroupSectionProps) {
  const visibleAttributes = group.attributes.filter(isAttributeVisible);
  const visibleSubGroups = (group.groups ?? []).filter(groupHasVisibleContent);
  const Heading = depth === 0 ? 'h3' : 'h4';
  const { id: rawLayoutId, icon } = normalizeLayout(group.layout, path);
  const layoutId = pickLayoutId(rawLayoutId, GROUP_LAYOUTS, 'section', path);

  return (
    <Collapsible
      defaultOpen
      className={cn('flex flex-col gap-3.5', depth > 0 && 'border-l border-border pl-3')}
    >
      {/* Heading wraps the trigger (WAI-ARIA accordion pattern) so screen-reader heading
          navigation still works while the whole row stays the collapse toggle. */}
      <Heading className="text-sm font-semibold text-text-primary">
        <CollapsibleTrigger className="py-0.5">
          {renderHeadingLabel(group.label, icon, path)}
        </CollapsibleTrigger>
      </Heading>
      <CollapsibleContent className="flex flex-col gap-4">
        {visibleAttributes.length > 0 && (
          <div className={GROUP_ATTR_WRAPPER[layoutId]}>
            {visibleAttributes.map((attribute) => {
              const attributePath = joinPath(path, attribute.key);
              const cell = (
                <AttributeField
                  key={attribute.key}
                  attribute={attribute}
                  path={attributePath}
                  value={values[attributePath]}
                  onChange={(value) => onChange(attributePath, value)}
                  definitionsByName={definitionsByName}
                  refChoiceSource={refChoiceSource}
                  refDraftOptions={refDraftOptions}
                  onAddRefDraftOption={onAddRefDraftOption}
                  refBaseSchema={refBaseSchema}
                />
              );
              return layoutId === 'inline' ? (
                <div key={attribute.key} className={GROUP_INLINE_ROW}>
                  {cell}
                </div>
              ) : (
                cell
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
            refChoiceSource={refChoiceSource}
            refDraftOptions={refDraftOptions}
            onAddRefDraftOption={onAddRefDraftOption}
            refBaseSchema={refBaseSchema}
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
  refChoiceSource?: Record<string, unknown> | null;
  refDraftOptions?: Record<string, unknown[]>;
  onAddRefDraftOption?: (path: string, value: unknown) => void;
  refBaseSchema?: ResolvedSportAttributeSchema | null;
}

function AttributeField({
  attribute,
  path,
  value,
  onChange,
  definitionsByName,
  refChoiceSource,
  refDraftOptions,
  onAddRefDraftOption,
  refBaseSchema,
}: AttributeFieldProps) {
  const fieldId = `sport-attribute-${path}`;
  // DEFINITION/DEFINITION_LIST render as indented sub-sections — never squeezed into a grid
  // column half.
  const fullWidth = attribute.type === 'DEFINITION' || attribute.type === 'DEFINITION_LIST';

  const control = ((): ReactNode => {
    // A schema-declared type this client build doesn't know — degrade, don't crash. Checked
    // before the union is trusted (the wire is cast, not validated, at the hook boundary).
    if (!KNOWN_TYPES.has(attribute.type as string)) return null;

    if (isRefAttribute(attribute)) {
      // `#ref` needs the creator's profile as its choice source — only the session-create context
      // wires it. Absent → skip the node (the profile editor's schema has none anyway).
      if (refChoiceSource === undefined) return null;
      // SPORT-16: a `#ref` with no own `layout` inherits the base attribute's, read from the
      // profile schema at `prefillKey` (undefined until that query settles → no inheritance yet).
      const inheritedLayout =
        attribute.layout ?? findAttributeByPath(refBaseSchema, attribute.prefillKey)?.layout ?? null;
      return (
        <RefField
          node={attribute}
          fieldId={fieldId}
          value={value}
          onChange={onChange}
          choiceSource={refChoiceSource}
          draftOptions={refDraftOptions?.[path] ?? []}
          onAddDraftOption={(draft) => onAddRefDraftOption?.(path, draft)}
          definitionsByName={definitionsByName}
          layout={inheritedLayout}
        />
      );
    }

    switch (attribute.type) {
      case 'STRING':
        return (
          <StringField
            fieldId={fieldId}
            label={attribute.label}
            value={value}
            onChange={onChange}
            layout={attribute.layout ?? undefined}
          />
        );
      case 'NUMBER':
        return (
          <NumberField
            attribute={attribute}
            fieldId={fieldId}
            label={attribute.label}
            value={value}
            onChange={onChange}
            layout={attribute.layout ?? undefined}
          />
        );
      case 'BOOLEAN':
        return (
          <BooleanField
            fieldId={fieldId}
            label={attribute.label}
            value={value}
            onChange={onChange}
            layout={attribute.layout ?? undefined}
          />
        );
      case 'ENUM':
        return (
          <EnumField
            attribute={attribute}
            fieldId={fieldId}
            label={attribute.label}
            value={value}
            onChange={onChange}
            layout={attribute.layout ?? undefined}
          />
        );
      case 'LIST':
        return (
          <ListField
            fieldId={fieldId}
            label={attribute.label}
            options={attribute.options ?? []}
            selected={Array.isArray(value) ? (value as string[]) : []}
            onChange={onChange}
            layout={attribute.layout ?? undefined}
          />
        );
      case 'DEFINITION':
        return (
          <DefinitionField
            attribute={attribute}
            value={value}
            onChange={onChange}
            definitionsByName={definitionsByName}
          />
        );
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
            layout={attribute.layout ?? undefined}
          />
        );
      }
      default:
        return assertNever(attribute);
    }
  })();

  // An unknown type (or a malformed DEFINITION with no resolvable ref) renders no grid cell at
  // all, rather than an empty column.
  if (control === null) return null;

  return <div className={cn('min-w-0', fullWidth && 'sm:col-span-2')}>{control}</div>;
}
