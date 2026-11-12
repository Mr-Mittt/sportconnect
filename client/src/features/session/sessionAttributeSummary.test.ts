import { describe, expect, it } from 'vitest';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { buildAttributeSummary } from './sessionAttributeSummary';

const schema = {
  groups: [
    {
      key: 'match',
      label: 'Match',
      isAvailable: true,
      attributes: [
        { key: 'format', label: 'Format', type: 'STRING', isAvailable: true },
        {
          key: 'level',
          label: 'Level',
          type: 'ENUM',
          isAvailable: true,
          options: [{ value: 'int', label: 'Intermediate' }],
        },
        { key: 'indoor', label: 'Indoor', type: 'BOOLEAN', isAvailable: true },
        { key: 'secret', label: 'Secret', type: 'STRING', isAvailable: true, hidden: true },
      ],
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          attributes: [{ key: 'balls', label: 'Balls', type: 'LIST', isAvailable: true, options: [] }],
        },
      ],
    },
  ],
} as unknown as ResolvedSportAttributeSchema;

describe('buildAttributeSummary', () => {
  it('lists every available attribute in schema order, with null text where nothing is stored', () => {
    expect(buildAttributeSummary(schema, {})).toEqual([
      { label: 'Format', text: null },
      { label: 'Level', text: null },
      { label: 'Indoor', text: null },
      { label: 'Balls', text: null },
    ]);
  });

  it('shows scalars, option labels, Yes/No and lists of scalars as text, reading nested groups by path', () => {
    expect(
      buildAttributeSummary(schema, {
        'match/format': 'Doubles',
        'match/level': 'int',
        'match/indoor': true,
        'match/gear/balls': ['a', 'b'],
      }),
    ).toEqual([
      { label: 'Format', text: 'Doubles' },
      { label: 'Level', text: 'Intermediate' },
      { label: 'Indoor', text: 'Yes' },
      { label: 'Balls', text: 'a, b' },
    ]);
  });

  it('skips hidden attributes and reads a record-shaped value as missing', () => {
    const out = buildAttributeSummary(schema, { 'match/secret': 'x', 'match/format': { a: 1 } });
    expect(out.find((entry) => entry.label === 'Secret')).toBeUndefined();
    expect(out.find((entry) => entry.label === 'Format')?.text).toBeNull();
  });
});
