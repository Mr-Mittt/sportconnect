import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { resetDevWarnCache } from '@/shared/lib/devWarn';
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

describe('SessionAttributesSummary — SPORT-15 read-only layout parity', () => {
  beforeEach(() => {
    resetDevWarnCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const oneGroup = (attrs: unknown[], groupLayout?: unknown): ResolvedSportAttributeSchema =>
    ({
      definitions: [
        {
          name: 'Reference',
          fields: [
            { key: 'value', label: 'Name', type: 'STRING' },
            { key: 'grams', label: 'Weight', type: 'NUMBER' },
          ],
        },
      ],
      groups: [
        { key: 'match', label: 'Match', isAvailable: true, layout: groupLayout, attributes: attrs },
      ],
    }) as ResolvedSportAttributeSchema;

  it('LIST display: comma joins the option labels', () => {
    render(
      <SessionAttributesSummary
        schema={oneGroup([
          {
            key: 'kit',
            label: 'Kit',
            type: 'LIST',
            isAvailable: true,
            layout: { id: 'comma' },
            options: [
              { value: 'a', label: 'Shuttles' },
              { value: 'b', label: 'Water' },
            ],
          },
        ])}
        values={{ 'match/kit': ['a', 'b'] }}
      />,
    );
    expect(within(row('Kit')).getByText('Shuttles, Water')).toBeInTheDocument();
    expect(within(row('Kit')).queryByRole('list')).not.toBeInTheDocument();
  });

  it('LIST display: bullets renders a list-disc <ul>', () => {
    render(
      <SessionAttributesSummary
        schema={oneGroup([
          {
            key: 'kit',
            label: 'Kit',
            type: 'LIST',
            isAvailable: true,
            layout: { id: 'bullets' },
            options: [{ value: 'a', label: 'Shuttles' }],
          },
        ])}
        values={{ 'match/kit': ['a'] }}
      />,
    );
    expect(within(row('Kit')).getByRole('list').className).toContain('list-disc');
  });

  it('LIST display: an editable-only id (multiselect) falls back to chips, no warning', () => {
    render(
      <SessionAttributesSummary
        schema={oneGroup([
          {
            key: 'kit',
            label: 'Kit',
            type: 'LIST',
            isAvailable: true,
            layout: { id: 'multiselect' },
            options: [{ value: 'a', label: 'Shuttles' }],
          },
        ])}
        values={{ 'match/kit': ['a'] }}
      />,
    );
    expect(within(row('Kit')).getAllByRole('listitem')).toHaveLength(1);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('format: a NUMBER pattern is applied to the displayed value', () => {
    render(
      <SessionAttributesSummary
        schema={oneGroup([
          {
            key: 'rate',
            label: 'Win rate',
            type: 'NUMBER',
            isAvailable: true,
            layout: { id: 'readonly-text', format: '0%' },
          },
        ])}
        values={{ 'match/rate': 0.62 }}
      />,
    );
    expect(within(row('Win rate')).getByText('62%')).toBeInTheDocument();
  });

  it('group grid-2: term-over-value cells in a 2-col dl', () => {
    const { container } = render(
      <SessionAttributesSummary
        schema={oneGroup(
          [
            { key: 'a', label: 'Format', type: 'STRING', isAvailable: true },
            { key: 'b', label: 'Court', type: 'NUMBER', isAvailable: true },
          ],
          { id: 'grid-2' },
        )}
        values={{ 'match/a': 'Doubles', 'match/b': 4 }}
      />,
    );
    expect(container.querySelector('dl')?.className).toContain('sm:grid-cols-2');
    expect(screen.getByText('Doubles')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('group flat: drops the group heading', () => {
    render(
      <SessionAttributesSummary
        schema={oneGroup([{ key: 'a', label: 'Format', type: 'STRING', isAvailable: true }], {
          id: 'flat',
        })}
        values={{ 'match/a': 'Doubles' }}
      />,
    );
    expect(screen.queryByText('Match')).not.toBeInTheDocument();
    expect(screen.getByText('Doubles')).toBeInTheDocument();
  });

  it('group icon: an aria-hidden glyph before the heading label', () => {
    const { container } = render(
      <SessionAttributesSummary
        schema={oneGroup([{ key: 'a', label: 'Format', type: 'STRING', isAvailable: true }], {
          id: 'section',
          icon: 'racket',
        })}
        values={{ 'match/a': 'Doubles' }}
      />,
    );
    expect(container.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });

  it('DEFINITION_LIST table: a real table, one row per record', () => {
    render(
      <SessionAttributesSummary
        schema={oneGroup([
          {
            key: 'rackets',
            label: 'Rackets',
            type: 'DEFINITION_LIST',
            isAvailable: true,
            definitionRef: 'Reference',
            layout: { id: 'table' },
          },
        ])}
        values={{
          'match/rackets': [
            { value: 'Astrox 99', grams: 90 },
            { value: 'Nanoflare', grams: 88 },
          ],
        }}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('DEFINITION_LIST accordion: a collapsible section with a summary trigger', () => {
    render(
      <SessionAttributesSummary
        schema={oneGroup([
          {
            key: 'rackets',
            label: 'Rackets',
            type: 'DEFINITION_LIST',
            isAvailable: true,
            definitionRef: 'Reference',
            layout: { id: 'accordion' },
          },
        ])}
        values={{ 'match/rackets': [{ value: 'Astrox 99', grams: 90 }] }}
      />,
    );
    expect(screen.getByRole('button', { name: /Item 1 . Astrox 99/ })).toBeInTheDocument();
  });

  it('unknown group layout id → section default + one warning', () => {
    render(
      <SessionAttributesSummary
        schema={oneGroup([{ key: 'a', label: 'Format', type: 'STRING', isAvailable: true }], {
          id: 'mosaic',
        })}
        values={{ 'match/a': 'Doubles' }}
      />,
    );
    expect(screen.getByText('Match')).toBeInTheDocument();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('absent layout → chips list, no warnings', () => {
    render(
      <SessionAttributesSummary
        schema={oneGroup([
          {
            key: 'kit',
            label: 'Kit',
            type: 'LIST',
            isAvailable: true,
            options: [{ value: 'a', label: 'Shuttles' }],
          },
        ])}
        values={{ 'match/kit': ['a'] }}
      />,
    );
    expect(within(row('Kit')).getByRole('list').className).not.toContain('list-disc');
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('SessionAttributesSummary — hidden (SPORT-15)', () => {
  it('renders no row for a hidden attribute, hidden record field, or hidden group', () => {
    const schema = {
      definitions: [
        {
          name: 'Reference',
          fields: [
            { key: 'value', label: 'Name', type: 'STRING' },
            { key: 'url', label: 'URL', type: 'STRING', hidden: true },
          ],
        },
      ],
      groups: [
        {
          key: 'match',
          label: 'Match',
          isAvailable: true,
          attributes: [
            { key: 'shown', label: 'Format', type: 'STRING', isAvailable: true },
            { key: 'secret', label: 'Secret', type: 'STRING', isAvailable: true, hidden: true },
            {
              key: 'ref',
              label: 'Racket',
              type: 'DEFINITION',
              isAvailable: true,
              definitionRef: 'Reference',
            },
          ],
        },
        {
          key: 'gone',
          label: 'Hidden group',
          isAvailable: true,
          hidden: true,
          attributes: [{ key: 'x', label: 'X', type: 'STRING', isAvailable: true }],
        },
      ],
    } as unknown as ResolvedSportAttributeSchema;
    render(
      <SessionAttributesSummary
        schema={schema}
        values={{
          'match/shown': 'Doubles',
          'match/secret': 'do-not-show',
          'match/ref': { value: 'Astrox 99', url: 'https://example.com/astrox' },
          'gone/x': 'nope',
        }}
      />,
    );
    expect(screen.getByText('Doubles')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
    expect(screen.queryByText('do-not-show')).not.toBeInTheDocument();
    expect(screen.queryByText('URL')).not.toBeInTheDocument();
    expect(screen.queryByText('https://example.com/astrox')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden group')).not.toBeInTheDocument();
    expect(screen.getByText('Astrox 99')).toBeInTheDocument();
  });

  it('a hidden + required record field still renders nothing (no crash)', () => {
    const schema = {
      definitions: [
        {
          name: 'R',
          fields: [
            { key: 'value', label: 'Name', type: 'STRING' },
            { key: 'sku', label: 'SKU', type: 'STRING', hidden: true, isRequired: true },
          ],
        },
      ],
      groups: [
        {
          key: 'g',
          label: 'G',
          isAvailable: true,
          attributes: [
            { key: 'r', label: 'Item', type: 'DEFINITION', isAvailable: true, definitionRef: 'R' },
          ],
        },
      ],
    } as unknown as ResolvedSportAttributeSchema;
    render(<SessionAttributesSummary schema={schema} values={{ 'g/r': { value: 'A', sku: 'X1' } }} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('SKU')).not.toBeInTheDocument();
  });
});
