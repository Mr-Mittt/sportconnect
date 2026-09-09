import { describe, expect, it } from 'vitest';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { collectSchemaPaths, pickPaths } from './sessionAttributePaths';

const schema: ResolvedSportAttributeSchema = {
  groups: [
    {
      key: 'match',
      label: 'Match details',
      isAvailable: true,
      attributes: [
        { key: 'racketBrand', label: 'Racket brand', type: 'STRING', isAvailable: true },
        { key: 'tension', label: 'String tension', type: 'NUMBER', isAvailable: true },
        {
          key: 'format',
          label: 'Format',
          type: 'STRING',
          isAvailable: true,
          defaultValue: 'Doubles',
        },
      ],
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          attributes: [{ key: 'handedness', label: 'Hand', type: 'STRING', isAvailable: true }],
        },
      ],
    },
    {
      key: 'hidden',
      label: 'Hidden',
      isAvailable: false,
      attributes: [{ key: 'secret', label: 'Secret', type: 'STRING', isAvailable: true }],
    },
  ],
};

describe('collectSchemaPaths / pickPaths', () => {
  it('collects every available attribute path, including nested groups; skips unavailable subtrees', () => {
    expect(collectSchemaPaths(schema)).toEqual(
      new Set(['match/racketBrand', 'match/tension', 'match/format', 'match/gear/handedness']),
    );
  });

  it('pickPaths keeps only allowed keys', () => {
    const allowed = collectSchemaPaths(schema);
    expect(
      pickPaths({ 'match/format': 'Doubles', 'stale/from-other-sport': 'x' }, allowed),
    ).toEqual({ 'match/format': 'Doubles' });
  });
});
