import type { ReactNode } from 'react';
import type { ResolvedSportAttributeDefinitionType } from '@/shared/types/sport';

/**
 * Common shape every per-type attribute control component takes (CLIENT-SESSION-17 Part A). The
 * caller (the top-level attribute dispatcher or the record-field dispatcher) resolves the label,
 * required state, and hint, so each arm component only renders its own control markup.
 *
 * `variant` distinguishes the two hosting contexts whose wrapper markup genuinely differs
 * (`LIST`, `DEFINITION`): `standalone` = a top-level `AttributeField` grid cell; `record` = a
 * field inside a `DEFINITION`/`DEFINITION_LIST` record, which also shows a required hint.
 */
export interface AttributeControlBaseProps {
  fieldId: string;
  /** Final display label — already suffixed with ` *` by the caller when the field is required. */
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
  variant?: 'standalone' | 'record';
  /** `record` variant only — reflected onto the control; omitted (so absent from the DOM) otherwise. */
  ariaRequired?: boolean;
  /** `record` variant only — rendered after the control when the required field is still empty. */
  requiredHint?: ReactNode;
}

export interface DefinitionControlProps extends AttributeControlBaseProps {
  definitionsByName: Map<string, ResolvedSportAttributeDefinitionType>;
}
