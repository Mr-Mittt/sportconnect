import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { SessionAttributesSummary } from './SessionAttributesSummary';

const referenceDefinition = {
  name: 'Reference',
  fields: [
    { key: 'id', label: 'Item', type: 'STRING' as const },
    { key: 'value', label: 'Name', type: 'STRING' as const },
  ],
};

const schema: ResolvedSportAttributeSchema = {
  definitions: [referenceDefinition],
  groups: [
    {
      key: 'match',
      label: 'Match details',
      isAvailable: true,
      attributes: [
        { key: 'format', label: 'Format', type: 'STRING', isAvailable: true },
        { key: 'competitive', label: 'Competitive', type: 'BOOLEAN', isAvailable: true },
        { key: 'court', label: 'Court', type: 'NUMBER', isAvailable: true },
        {
          key: 'level',
          label: 'Level',
          type: 'ENUM',
          isAvailable: true,
          options: [
            { value: 'beginner', label: 'Beginner' },
            { value: 'advanced', label: 'Advanced' },
          ],
        },
        {
          key: 'surfaces',
          label: 'Surfaces',
          type: 'LIST',
          isAvailable: true,
          options: [
            { value: 'wood', label: 'Wood' },
            { value: 'synthetic', label: 'Synthetic' },
          ],
        },
        {
          key: 'ballBrand',
          label: 'Ball brand',
          type: 'DEFINITION',
          isAvailable: true,
          definitionRef: 'Reference',
        },
      ],
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          attributes: [{ key: 'racket', label: 'Racket', type: 'STRING', isAvailable: true }],
        },
      ],
    },
  ],
};

const fullValues: Record<string, unknown> = {
  'match/format': 'Doubles',
  'match/competitive': true,
  'match/court': 3,
  'match/level': 'advanced',
  'match/surfaces': ['wood', 'synthetic'],
  'match/ballBrand': { id: 'yonex-as50', value: 'Yonex AS-50' },
  'match/gear/racket': 'Astrox 99',
};

function row(term: string): HTMLElement {
  // <dt>term</dt> is followed by its <dd> — assert on the whole <dl> row wrapper.
  return screen.getByText(term).closest('.contents') as HTMLElement;
}

describe('SessionAttributesSummary', () => {
  it('renders each field type read-only — no inputs, ENUM/label resolved, BOOLEAN as Yes/No', () => {
    render(<SessionAttributesSummary schema={schema} values={fullValues} />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    expect(within(row('Format')).getByText('Doubles')).toBeInTheDocument();
    expect(within(row('Competitive')).getByText('Yes')).toBeInTheDocument();
    expect(within(row('Court')).getByText('3')).toBeInTheDocument();
    // ENUM shows the option's label, not its stored value.
    expect(within(row('Level')).getByText('Advanced')).toBeInTheDocument();
    expect(screen.queryByText('advanced')).not.toBeInTheDocument();
  });

  it('renders LIST values as chips (option labels)', () => {
    render(<SessionAttributesSummary schema={schema} values={fullValues} />);
    const surfaces = row('Surfaces');
    expect(within(surfaces).getByText('Wood')).toBeInTheDocument();
    expect(within(surfaces).getByText('Synthetic')).toBeInTheDocument();
    expect(within(surfaces).getAllByRole('listitem')).toHaveLength(2);
  });

  it('renders a DEFINITION value as a nested term/value list', () => {
    render(<SessionAttributesSummary schema={schema} values={fullValues} />);
    const ballBrand = row('Ball brand');
    expect(within(ballBrand).getByText('Item')).toBeInTheDocument();
    expect(within(ballBrand).getByText('yonex-as50')).toBeInTheDocument();
    expect(within(ballBrand).getByText('Name')).toBeInTheDocument();
    expect(within(ballBrand).getByText('Yonex AS-50')).toBeInTheDocument();
  });

  it('renders nested sub-group attributes under the sub-group label', () => {
    render(<SessionAttributesSummary schema={schema} values={fullValues} />);
    expect(screen.getByText('Gear')).toBeInTheDocument();
    expect(within(row('Racket')).getByText('Astrox 99')).toBeInTheDocument();
  });

  it('omits a field whose stored value is empty, and a group with nothing to show', () => {
    render(
      <SessionAttributesSummary
        schema={schema}
        values={{ 'match/format': 'Doubles', 'match/competitive': '', 'match/surfaces': [] }}
      />,
    );
    expect(screen.getByText('Format')).toBeInTheDocument();
    expect(screen.queryByText('Competitive')).not.toBeInTheDocument();
    expect(screen.queryByText('Surfaces')).not.toBeInTheDocument();
    // Sub-group "gear" has no stored value here.
    expect(screen.queryByText('Gear')).not.toBeInTheDocument();
    expect(screen.queryByText('Racket')).not.toBeInTheDocument();
  });

  it('renders nothing when no attribute has a stored value', () => {
    const { container } = render(<SessionAttributesSummary schema={schema} values={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the schema has no groups', () => {
    const { container } = render(
      <SessionAttributesSummary schema={{ groups: [] }} values={fullValues} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('skips an isAvailable:false attribute even when a stale value is stored for it', () => {
    const withRetired: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'match',
          label: 'Match details',
          isAvailable: true,
          attributes: [
            { key: 'format', label: 'Format', type: 'STRING', isAvailable: true },
            { key: 'oldField', label: 'Retired field', type: 'STRING', isAvailable: false },
          ],
        },
      ],
    };
    render(
      <SessionAttributesSummary
        schema={withRetired}
        values={{ 'match/format': 'Singles', 'match/oldField': 'still here' }}
      />,
    );
    expect(screen.getByText('Singles')).toBeInTheDocument();
    expect(screen.queryByText('Retired field')).not.toBeInTheDocument();
    expect(screen.queryByText('still here')).not.toBeInTheDocument();
  });

  it('skips an unknown attribute type rather than crashing', () => {
    const withUnknown = {
      groups: [
        {
          key: 'match',
          label: 'Match details',
          isAvailable: true,
          attributes: [
            { key: 'format', label: 'Format', type: 'STRING', isAvailable: true },
            // A type a newer backend added that this client doesn't know.
            { key: 'weird', label: 'Weird', type: 'GEOPOINT', isAvailable: true },
          ],
        },
      ],
    } as unknown as ResolvedSportAttributeSchema;
    render(
      <SessionAttributesSummary
        schema={withUnknown}
        values={{ 'match/format': 'Singles', 'match/weird': { lat: 1, lng: 2 } }}
      />,
    );
    expect(screen.getByText('Singles')).toBeInTheDocument();
    expect(screen.queryByText('Weird')).not.toBeInTheDocument();
  });

  // CLIENT-SESSION-17: a `#ref` node's value shape follows `cardinality`, not the inherited
  // scalar `type` — the summary maps it onto the matching own-node render type.
  it('renders a SINGLE #ref (scalar base) as a plain value and a LIST #ref as chips', () => {
    const refSchema = {
      groups: [
        {
          key: 'match',
          label: 'Match details',
          isAvailable: true,
          attributes: [
            {
              key: 'mainRacket',
              label: 'Main racket',
              type: 'STRING',
              isAvailable: true,
              cardinality: 'SINGLE',
              prefillable: true,
              prefillKey: 'gear/mainRacket',
            },
            {
              key: 'racketModels',
              label: 'Racket models',
              type: 'STRING',
              isAvailable: true,
              cardinality: 'LIST',
              prefillable: true,
              prefillKey: 'gear/racketModels',
            },
          ],
        },
      ],
    } as unknown as ResolvedSportAttributeSchema;
    render(
      <SessionAttributesSummary
        schema={refSchema}
        values={{
          'match/mainRacket': 'Yonex Astrox 99',
          'match/racketModels': ['Yonex Astrox 99', 'Li-Ning Axforce 90'],
        }}
      />,
    );
    expect(within(row('Main racket')).getByText('Yonex Astrox 99')).toBeInTheDocument();
    const models = row('Racket models');
    expect(within(models).getAllByRole('listitem')).toHaveLength(2);
    expect(within(models).getByText('Li-Ning Axforce 90')).toBeInTheDocument();
  });

  it('renders a SINGLE #ref off a DEFINITION_LIST base as a nested record', () => {
    const refSchema = {
      definitions: [referenceDefinition],
      groups: [
        {
          key: 'match',
          label: 'Match details',
          isAvailable: true,
          attributes: [
            {
              key: 'racket',
              label: 'Racket',
              type: 'DEFINITION_LIST',
              isAvailable: true,
              cardinality: 'SINGLE',
              prefillable: true,
              prefillKey: 'gear/rackets',
              definitionRef: 'Reference',
            },
          ],
        },
      ],
    } as unknown as ResolvedSportAttributeSchema;
    render(
      <SessionAttributesSummary
        schema={refSchema}
        values={{ 'match/racket': { id: 'yonex-as99', value: 'Yonex Astrox 99' } }}
      />,
    );
    const racket = row('Racket');
    expect(within(racket).getByText('yonex-as99')).toBeInTheDocument();
    expect(within(racket).getByText('Yonex Astrox 99')).toBeInTheDocument();
  });
});
