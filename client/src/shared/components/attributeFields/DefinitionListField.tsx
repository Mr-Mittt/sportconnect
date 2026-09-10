import { IconPlus, IconTrash } from '@tabler/icons-react';
import type {
  ResolvedAttributeLayout,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { MAX_LIST_ITEMS } from '@/shared/types/sport';
import { devWarn } from '@/shared/lib/devWarn';
import { Button } from '@/shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/ui/collapsible';
import { DefinitionFields, RecordField } from './DefinitionFields';
import { renderHeadingLabel } from './headingIcons';
import { normalizeLayout, pickLayoutId } from './layout';

interface DefinitionListFieldProps {
  label: string;
  definitionType: ResolvedSportAttributeDefinitionType;
  rows: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
  /** SPORT-14: presentation for the repeating records — `cards` (default, unchanged), `table`
   * (one row per record, a column per field; **degrades to `cards` + a dev warning** when a field
   * is `LIST` or nested `DEFINITION`, which don't fit a cell), `accordion` (each record a
   * collapsible section). Absent/unknown → `cards`. */
  layout?: ResolvedAttributeLayout | null;
}

/** Top-level `DEFINITION_LIST` attribute arm (CLIENT-SESSION-17 Part A). Repeating records capped
 * at `MAX_LIST_ITEMS` (the server silently drops a whole over-cap value). SPORT-14 adds the
 * `layout` variants; `cards` is byte-identical to the pre-SPORT-14 markup. Every variant stores and
 * emits `Record<string, unknown>[]` with unchanged keys. */
export function DefinitionListField({
  label,
  definitionType,
  rows,
  onChange,
  definitionsByName,
  layout,
}: DefinitionListFieldProps) {
  const normalized = normalizeLayout(layout, label);
  let kind = pickLayoutId(
    normalized.id,
    ['cards', 'table', 'accordion'] as const,
    'cards',
    label,
  );
  const hasComplexField = definitionType.fields.some(
    (field) => field.type === 'LIST' || field.type === 'DEFINITION',
  );
  if (kind === 'table' && hasComplexField) {
    devWarn(
      `layout-degrade-table:${label}`,
      `"${label}" \`layout.id\` "table" needs all-scalar record fields — "${definitionType.name}" has a LIST/DEFINITION field, falling back to "cards"`,
    );
    kind = 'cards';
  }

  const atCap = rows.length >= MAX_LIST_ITEMS;
  const heading = renderHeadingLabel(label, normalized.icon, label);
  const removeRow = (index: number) => onChange(rows.filter((_row, i) => i !== index));
  const updateRow = (index: number, next: Record<string, unknown>) =>
    onChange(rows.map((row, i) => (i === index ? next : row)));

  const addButton = (
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
  );
  const capNote = atCap ? (
    <p className="text-2xs text-text-muted">{MAX_LIST_ITEMS} items (maximum)</p>
  ) : null;

  if (kind === 'table') {
    return (
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-medium text-text-secondary">{heading}</span>
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-hairline-b border-border">
                  {definitionType.fields.map((field) => (
                    <th
                      key={field.key}
                      scope="col"
                      className="p-2 text-2xs font-medium text-text-secondary"
                    >
                      {field.label}
                    </th>
                  ))}
                  <th className="p-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={index}
                    className="border-hairline-b border-border align-top [&_label]:sr-only"
                  >
                    {definitionType.fields.map((field) => (
                      <td key={field.key} className="p-2">
                        <RecordField
                          field={field}
                          value={row[field.key]}
                          onChange={(value) => updateRow(index, { ...row, [field.key]: value })}
                          definitionsByName={definitionsByName}
                        />
                      </td>
                    ))}
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => removeRow(index)}
                        className="cursor-pointer rounded p-0.5 text-text-secondary hover:text-text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                      >
                        <IconTrash className="size-4" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {addButton}
        {capNote}
      </div>
    );
  }

  if (kind === 'accordion') {
    return (
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-medium text-text-secondary">{heading}</span>
        {rows.length > 0 && (
          <div className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <Collapsible
                key={index}
                defaultOpen
                className="border-hairline rounded-lg border-border"
              >
                <div className="flex items-center justify-between gap-2 p-2">
                  <CollapsibleTrigger className="flex-1 text-2sm font-medium text-text-secondary">
                    {accordionSummary(definitionType, row, index)}
                  </CollapsibleTrigger>
                  <button
                    type="button"
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() => removeRow(index)}
                    className="cursor-pointer rounded p-0.5 text-text-secondary hover:text-text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                  >
                    <IconTrash className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <CollapsibleContent className="border-hairline-t border-border p-3">
                  <DefinitionFields
                    definitionType={definitionType}
                    record={row}
                    onChange={(next) => updateRow(index, next)}
                    definitionsByName={definitionsByName}
                  />
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
        {addButton}
        {capNote}
      </div>
    );
  }

  // `cards` — byte-identical to pre-SPORT-14 (only the heading text node can now carry an icon).
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-xs font-medium text-text-secondary">{heading}</span>
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
                  onClick={() => removeRow(index)}
                  className="cursor-pointer rounded p-0.5 text-text-secondary hover:text-text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                >
                  <IconTrash className="size-4" aria-hidden="true" />
                </button>
              </div>
              <DefinitionFields
                definitionType={definitionType}
                record={row}
                onChange={(next) => updateRow(index, next)}
                definitionsByName={definitionsByName}
              />
            </div>
          ))}
        </div>
      )}
      {addButton}
      {capNote}
    </div>
  );
}

/** Accordion trigger text: `Item N`, plus the first non-empty scalar field value as a hint so a
 * collapsed row is still identifiable. */
function accordionSummary(
  definitionType: ResolvedSportAttributeDefinitionType,
  row: Record<string, unknown>,
  index: number,
): string {
  for (const field of definitionType.fields) {
    if (field.type !== 'STRING' && field.type !== 'NUMBER') continue;
    const value = row[field.key];
    if (typeof value === 'string' && value.trim() !== '') return `Item ${index + 1} · ${value}`;
    if (typeof value === 'number' && Number.isFinite(value)) return `Item ${index + 1} · ${value}`;
  }
  return `Item ${index + 1}`;
}
