import { describe, expect, it } from 'vitest';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { collectDefaultValues, hasEditedAttributeValues } from './defaults';

const schema: ResolvedSportAttributeSchema = {
  groups: [
    {
      key: 'match',
      label: 'Match details',
      isAvailable: true,
      attributes: [
        { key: 'format', label: 'Format', type: 'STRING', isAvailable: true, defaultValue: 'Doubles' },
        { key: 'brand', label: 'Brand', type: 'STRING', isAvailable: true },
        { key: 'secret', label: 'Secret', type: 'STRING', isAvailable: true, hidden: true, defaultValue: 'x' },
      ],
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          attributes: [{ key: 'tags', label: 'Tags', type: 'LIST', isAvailable: true, options: [], defaultValue: ['a'] }],
        },
        {
          key: 'gone',
          label: 'Gone',
          isAvailable: false,
          attributes: [{ key: 'n', label: 'N', type: 'STRING', isAvailable: true, defaultValue: 'y' }],
        },
      ],
    },
  ],
};

describe('collectDefaultValues', () => {
  it('lists the defaults of visible nodes in available groups, by full path', () => {
    expect(collectDefaultValues(schema)).toEqual({ 'match/format': 'Doubles', 'match/gear/tags': ['a'] });
  });
});

describe('hasEditedAttributeValues', () => {
  it('an empty map and a map holding only the seeded defaults are not edits', () => {
    expect(hasEditedAttributeValues(schema, {})).toBe(false);
    expect(hasEditedAttributeValues(schema, { 'match/format': 'Doubles', 'match/gear/tags': ['a'] })).toBe(false);
  });

  it('a changed default, or a value with no default, is an edit', () => {
    expect(hasEditedAttributeValues(schema, { 'match/format': 'Singles' })).toBe(true);
    expect(hasEditedAttributeValues(schema, { 'match/gear/tags': ['a', 'b'] })).toBe(true);
    expect(hasEditedAttributeValues(schema, { 'match/brand': 'Yonex' })).toBe(true);
  });

  it('a default of a hidden or unavailable node is not seeded, so a value there is an edit', () => {
    expect(hasEditedAttributeValues(schema, { 'match/secret': 'x' })).toBe(true);
    expect(hasEditedAttributeValues(schema, { 'match/gone/n': 'y' })).toBe(true);
  });

  it('without a schema every value is an edit', () => {
    expect(hasEditedAttributeValues(null, {})).toBe(false);
    expect(hasEditedAttributeValues(null, { 'match/format': 'Doubles' })).toBe(true);
  });
});
