import type {
  ResolvedDefinitionAttribute,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { DefinitionFields } from './DefinitionFields';

interface DefinitionFieldProps {
  attribute: Pick<ResolvedDefinitionAttribute, 'label' | 'definitionRef'>;
  value: unknown;
  onChange: (value: unknown) => void;
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Top-level `DEFINITION` attribute arm (CLIENT-SESSION-17 Part A) — verbatim from
 * `SportAttributesFields`. Renders nothing when the `definitionRef` doesn't resolve. */
export function DefinitionField({
  attribute,
  value,
  onChange,
  definitionsByName,
}: DefinitionFieldProps) {
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
