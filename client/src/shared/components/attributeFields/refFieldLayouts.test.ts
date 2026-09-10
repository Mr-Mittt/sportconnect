import { describe, expect, it } from 'vitest';
import type {
  ResolvedRefAttribute,
  ResolvedSportAttributeDefinitionType,
  ResolvedSportAttributeSchema,
} from '@/shared/types/sport';
import { applyRefFieldLayouts, findAttributeByPath } from './refFieldLayouts';

const reference: ResolvedSportAttributeDefinitionType = {
  name: 'Reference',
  fields: [
    { key: 'id', label: 'Item', type: 'STRING', hidden: true },
    { key: 'value', label: 'Name', type: 'STRING', isRequired: true, layout: { id: 'input' } },
  ],
};

function defsMap() {
  return new Map<string, ResolvedSportAttributeDefinitionType>([['Reference', reference]]);
}

function refNode(fieldLayouts?: ResolvedRefAttribute['fieldLayouts']): ResolvedRefAttribute {
  return {
    key: 'rackets',
    label: 'Rackets',
    type: 'DEFINITION_LIST',
    prefillable: true,
    cardinality: 'LIST',
    prefillKey: 'gear/rackets',
    definitionRef: 'Reference',
    fieldLayouts,
  } as ResolvedRefAttribute;
}

describe('applyRefFieldLayouts', () => {
  it('returns the same map reference when the node has no fieldLayouts', () => {
    const map = defsMap();
    expect(applyRefFieldLayouts(map, refNode(undefined))).toBe(map);
  });

  it('returns the same map when the definition is not present', () => {
    const map = defsMap();
    expect(
      applyRefFieldLayouts(map, { definitionRef: 'Missing', fieldLayouts: { a: { id: 'x' } } }),
    ).toBe(map);
  });

  it('replaces a field layout whole (not a deep merge) and leaves type/options/isRequired', () => {
    const out = applyRefFieldLayouts(defsMap(), refNode({ value: { id: 'textarea', icon: 'note' } }));
    const value = out.get('Reference')!.fields.find((f) => f.key === 'value')!;
    expect(value.layout).toEqual({ id: 'textarea', icon: 'note', format: null });
    expect(value.type).toBe('STRING');
    expect(value.isRequired).toBe(true);
  });

  it('a { hidden } -only override keeps the field own layout and flips hidden', () => {
    const out = applyRefFieldLayouts(defsMap(), refNode({ value: { hidden: true }, id: { hidden: false } }));
    const fields = out.get('Reference')!.fields;
    expect(fields.find((f) => f.key === 'value')!.layout).toEqual({ id: 'input' }); // unchanged
    expect(fields.find((f) => f.key === 'value')!.hidden).toBe(true);
    expect(fields.find((f) => f.key === 'id')!.hidden).toBe(false); // override wins over field.hidden:true
  });

  it('an unknown fieldLayouts key is ignored', () => {
    const out = applyRefFieldLayouts(defsMap(), refNode({ nope: { id: 'x' } }));
    expect(out.get('Reference')!.fields).toEqual(reference.fields);
  });

  it('does not mutate the input map', () => {
    const map = defsMap();
    applyRefFieldLayouts(map, refNode({ value: { id: 'textarea' } }));
    expect(map.get('Reference')!.fields.find((f) => f.key === 'value')!.layout).toEqual({ id: 'input' });
  });
});

const schema: ResolvedSportAttributeSchema = {
  groups: [
    {
      key: 'general',
      label: 'General',
      attributes: [{ key: 'handedness', label: 'Hand', type: 'ENUM', options: [], layout: { id: 'radio' } }],
    },
    {
      key: 'gear',
      label: 'Gear',
      attributes: [],
      groups: [
        {
          key: 'rackets',
          label: 'Rackets',
          attributes: [{ key: 'tension', label: 'Tension', type: 'NUMBER', layout: { id: 'slider' } }],
        },
      ],
    },
  ],
};

describe('findAttributeByPath', () => {
  it('finds a top-level-group attribute', () => {
    expect(findAttributeByPath(schema, 'general/handedness')?.key).toBe('handedness');
  });

  it('finds a nested-group attribute', () => {
    expect(findAttributeByPath(schema, 'gear/rackets/tension')?.layout).toEqual({ id: 'slider' });
  });

  it('undefined for an unknown path, a bare key, a null schema, or an empty path', () => {
    expect(findAttributeByPath(schema, 'gear/rackets/missing')).toBeUndefined();
    expect(findAttributeByPath(schema, 'gear/missing/tension')).toBeUndefined();
    expect(findAttributeByPath(schema, 'handedness')).toBeUndefined();
    expect(findAttributeByPath(null, 'general/handedness')).toBeUndefined();
    expect(findAttributeByPath(schema, '')).toBeUndefined();
  });
});
