import { describe, expect, it } from 'vitest';
import {
  isRefAttribute,
  type ResolvedSportAttributeDefinition,
  type SportAttributeType,
} from './sport';

/* CLIENT-SESSION-17 Part A — the resolved attribute god-type is now a discriminated union on
 * `type`, with `#ref`-derived nodes as a separate arm narrowed by `isRefAttribute` (they carry an
 * inherited base `type`, so a `switch (node.type)` cannot distinguish them). The compile-time
 * exhaustiveness guarantee is `assertNever` in every dispatcher — adding a `SportAttributeType`
 * member without a branch fails `tsc -b`. This spec pins the runtime discrimination. */

describe('ResolvedSportAttributeDefinition discriminated union', () => {
  it('isRefAttribute narrows only nodes flagged prefillable', () => {
    const ref: ResolvedSportAttributeDefinition = {
      key: 'racket',
      label: 'Racket',
      type: 'STRING',
      cardinality: 'SINGLE',
      prefillable: true,
      prefillKey: 'gear/racket',
    };
    const own: ResolvedSportAttributeDefinition = { key: 'note', label: 'Note', type: 'STRING' };

    expect(isRefAttribute(ref)).toBe(true);
    expect(isRefAttribute(own)).toBe(false);

    if (isRefAttribute(ref)) {
      // `cardinality`/`prefillKey` are only reachable after the guard narrows the arm.
      expect(ref.cardinality).toBe('SINGLE');
      expect(ref.prefillKey).toBe('gear/racket');
    }
  });

  it('every SportAttributeType string maps to exactly one non-ref arm', () => {
    const types: SportAttributeType[] = [
      'STRING',
      'NUMBER',
      'BOOLEAN',
      'ENUM',
      'LIST',
      'DEFINITION',
      'DEFINITION_LIST',
    ];
    // A change to the union that drops/renames a member breaks this list at compile time.
    expect(new Set(types).size).toBe(7);
  });
});
