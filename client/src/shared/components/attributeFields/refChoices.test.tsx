import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  ResolvedRefAttribute,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { deriveRefChoices, draftToChoice, refValueKey } from './refChoices';

const noDefs = new Map<string, ResolvedSportAttributeDefinitionType>();

function refNode(overrides: Partial<ResolvedRefAttribute> = {}): ResolvedRefAttribute {
  return {
    key: 'racket',
    label: 'Racket',
    type: 'STRING',
    cardinality: 'LIST',
    prefillable: true,
    prefillKey: 'gear/racketBrand',
    ...overrides,
  };
}

describe('deriveRefChoices', () => {
  it('turns an array profile value into one choice per entry', () => {
    const choices = deriveRefChoices(refNode(), { 'gear/racketBrand': ['Yonex', 'Li-Ning'] }, noDefs);
    expect(choices.map((c) => c.text)).toEqual(['Yonex', 'Li-Ning']);
    expect(choices.map((c) => c.value)).toEqual(['Yonex', 'Li-Ning']);
  });

  it('turns a scalar profile value into a single choice', () => {
    const choices = deriveRefChoices(
      refNode({ cardinality: 'SINGLE', prefillKey: 'gear/mainRacket' }),
      { 'gear/mainRacket': 'Yonex Astrox 99' },
      noDefs,
    );
    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({ text: 'Yonex Astrox 99', value: 'Yonex Astrox 99' });
  });

  it('returns an empty list when the profile has nothing at the prefill path', () => {
    expect(deriveRefChoices(refNode(), { other: 'x' }, noDefs)).toEqual([]);
    expect(deriveRefChoices(refNode(), null, noDefs)).toEqual([]);
    expect(deriveRefChoices(refNode(), { 'gear/racketBrand': '' }, noDefs)).toEqual([]);
  });

  it('drops empty / null entries inside an array and de-duplicates', () => {
    const choices = deriveRefChoices(
      refNode(),
      { 'gear/racketBrand': ['Yonex', '', null, 'Yonex'] },
      noDefs,
    );
    expect(choices.map((c) => c.text)).toEqual(['Yonex']);
  });

  it('resolves the display label through the inherited options for an ENUM/LIST base', () => {
    const choices = deriveRefChoices(
      refNode({
        type: 'ENUM',
        options: [
          { value: 'yonex', label: 'Yonex' },
          { value: 'liNing', label: 'Li-Ning' },
        ],
      }),
      { 'gear/racketBrand': ['yonex', 'liNing'] },
      noDefs,
    );
    expect(choices.map((c) => c.text)).toEqual(['Yonex', 'Li-Ning']);
    // the stored value round-trips as the raw option value, not the label
    expect(choices.map((c) => c.value)).toEqual(['yonex', 'liNing']);
  });

  it('renders a record-shaped entry with the nested-record formatter and round-trips it whole', () => {
    const definition: ResolvedSportAttributeDefinitionType = {
      name: 'Racket',
      fields: [
        { key: 'brand', label: 'Brand', type: 'STRING' },
        { key: 'weight', label: 'Weight', type: 'STRING' },
      ],
    };
    const defs = new Map([['Racket', definition]]);
    const record = { brand: 'Yonex', weight: '4U' };
    const choices = deriveRefChoices(
      refNode({ type: 'DEFINITION_LIST', definitionRef: 'Racket' }),
      { 'gear/racketBrand': [record] },
      defs,
    );
    expect(choices).toHaveLength(1);
    expect(choices[0].value).toEqual(record);
    const { container } = render(<>{choices[0].node}</>);
    expect(container.textContent).toContain('Yonex');
    expect(container.textContent).toContain('4U');
  });
});

describe('refValueKey / draftToChoice', () => {
  it('keys a scalar by its string form and a record canonically (key-order independent)', () => {
    expect(refValueKey('Yonex')).toBe('Yonex');
    expect(refValueKey({ a: 1, b: 2 })).toBe(refValueKey({ b: 2, a: 1 }));
  });

  it('draftToChoice shapes a free-text draft like a scalar choice', () => {
    const choice = draftToChoice(refNode(), 'Custom brand', noDefs);
    expect(choice).toMatchObject({ key: 'Custom brand', value: 'Custom brand', text: 'Custom brand' });
  });
});
