import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { ResolvedSportAttributeDefinitionType } from '@/shared/types/sport';
import { MAX_LIST_ITEMS } from '@/shared/types/sport';
import { Button } from '@/shared/ui/button';
import { DefinitionFields } from './DefinitionFields';

interface DefinitionListFieldProps {
  label: string;
  definitionType: ResolvedSportAttributeDefinitionType;
  rows: Record<string, unknown>[];
  onChange: (rows: Record<string, unknown>[]) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

/** Top-level `DEFINITION_LIST` attribute arm (CLIENT-SESSION-17 Part A) — verbatim from
 * `SportAttributesFields`. Repeating bordered records, capped at `MAX_LIST_ITEMS`. */
export function DefinitionListField({
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
                  onChange(
                    rows.map((existingRow, rowIndex) => (rowIndex === index ? next : existingRow)),
                  )
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
