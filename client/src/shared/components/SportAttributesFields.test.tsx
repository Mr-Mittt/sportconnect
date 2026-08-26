import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { SportAttributesFields } from './SportAttributesFields';

/** Stateful wrapper — `SportAttributesFields` is fully controlled, so interaction tests need
 * something to actually hold `values` between renders, same pattern any controlled-component
 * test needs. `onChangeSpy` observes every call before it's folded into local state. */
function Harness({
  schema,
  initialValues = {},
  onChangeSpy,
}: {
  schema: ResolvedSportAttributeSchema;
  initialValues?: Record<string, unknown>;
  onChangeSpy?: (key: string, value: unknown) => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  return (
    <SportAttributesFields
      schema={schema}
      values={values}
      onChange={(key, value) => {
        onChangeSpy?.(key, value);
        setValues((previous) => ({ ...previous, [key]: value }));
      }}
    />
  );
}

// Mirrors A15's real Badminton v2 content (design doc §4) closely enough to exercise groups,
// isAvailable at both levels, ENUM, and DEFINITION_LIST-over-Reference/Shoe.
const badmintonSchema: ResolvedSportAttributeSchema = {
  definitions: [
    {
      name: 'Reference',
      fields: [
        { key: 'id', label: 'Item', type: 'STRING', isRequired: false, order: 1 },
        { key: 'value', label: 'Name', type: 'STRING', isRequired: true, order: 2 },
      ],
    },
  ],
  groups: [
    {
      key: 'general',
      label: 'General',
      isAvailable: true,
      order: 1,
      attributes: [
        {
          key: 'handedness',
          label: 'Hand',
          type: 'ENUM',
          isAvailable: true,
          order: 1,
          options: [
            { value: 'LEFT', label: 'Left hand' },
            { value: 'RIGHT', label: 'Right hand' },
          ],
        },
        {
          key: 'playstyle',
          label: 'Playstyle',
          type: 'ENUM',
          isAvailable: true,
          order: 2,
          options: [
            { value: 'ATTACK', label: 'Attack' },
            { value: 'BALANCE', label: 'Balance' },
          ],
        },
      ],
    },
    {
      key: 'gear',
      label: 'Gear',
      isAvailable: true,
      order: 2,
      attributes: [
        {
          key: 'rackets',
          label: 'Rackets',
          type: 'DEFINITION_LIST',
          definitionRef: 'Reference',
          isAvailable: true,
          order: 1,
        },
        {
          key: 'footwear',
          label: 'Footwear',
          type: 'DEFINITION_LIST',
          definitionRef: 'Reference',
          isAvailable: true,
          order: 2,
        },
      ],
    },
  ],
};

// One of each top-level type, for focused per-type interaction tests.
const simpleSchema: ResolvedSportAttributeSchema = {
  definitions: [
    {
      name: 'Reference',
      fields: [
        { key: 'id', label: 'Item', type: 'STRING', isRequired: false, order: 1 },
        { key: 'value', label: 'Name', type: 'STRING', isRequired: true, order: 2 },
      ],
    },
  ],
  groups: [
    {
      key: 'g',
      label: 'Group',
      isAvailable: true,
      order: 1,
      attributes: [
        { key: 'note', label: 'Note', type: 'STRING', isAvailable: true, order: 1 },
        {
          key: 'level',
          label: 'Level',
          type: 'ENUM',
          isAvailable: true,
          order: 2,
          options: [
            { value: 'A', label: 'Alpha' },
            { value: 'B', label: 'Beta' },
          ],
        },
        {
          key: 'tags',
          label: 'Tags',
          type: 'LIST',
          isAvailable: true,
          order: 3,
          options: [
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
          ],
        },
        {
          key: 'primary',
          label: 'Primary item',
          type: 'DEFINITION',
          definitionRef: 'Reference',
          isAvailable: true,
          order: 4,
        },
        {
          key: 'items',
          label: 'Items',
          type: 'DEFINITION_LIST',
          definitionRef: 'Reference',
          isAvailable: true,
          order: 5,
        },
      ],
    },
  ],
};

describe('SportAttributesFields', () => {
  it('renders groups and fields from the schema', () => {
    render(<Harness schema={badmintonSchema} />);
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Gear')).toBeInTheDocument();
    expect(screen.getByLabelText('Hand')).toBeInTheDocument();
    expect(screen.getByLabelText('Playstyle')).toBeInTheDocument();
    expect(screen.getByText('Rackets')).toBeInTheDocument();
    expect(screen.getByText('Footwear')).toBeInTheDocument();
  });

  it('hides a whole group (and its children) when the group isAvailable is false', () => {
    const schema: ResolvedSportAttributeSchema = {
      ...badmintonSchema,
      groups: [{ ...badmintonSchema.groups[0], isAvailable: false }, badmintonSchema.groups[1]],
    };
    render(<Harness schema={schema} />);
    expect(screen.queryByText('General')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hand')).not.toBeInTheDocument();
    expect(screen.getByText('Gear')).toBeInTheDocument();
  });

  it("hides just the attribute when its own isAvailable is false, parent's other children unaffected", () => {
    const schema: ResolvedSportAttributeSchema = {
      ...badmintonSchema,
      groups: [
        {
          ...badmintonSchema.groups[0],
          attributes: [
            { ...badmintonSchema.groups[0].attributes[0], isAvailable: false },
            badmintonSchema.groups[0].attributes[1],
          ],
        },
        badmintonSchema.groups[1],
      ],
    };
    render(<Harness schema={schema} />);
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.queryByLabelText('Hand')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Playstyle')).toBeInTheDocument();
  });

  it('skips an attribute with an unknown type instead of crashing', () => {
    const schema: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          order: 1,
          attributes: [
            {
              key: 'mystery',
              label: 'Mystery',
              // A schema-declared type this client build doesn't know about yet.
              type: 'FUTURE_TYPE' as ResolvedSportAttributeSchema['groups'][number]['attributes'][number]['type'],
              isAvailable: true,
              order: 1,
            },
            {
              key: 'handedness',
              label: 'Hand',
              type: 'ENUM',
              isAvailable: true,
              order: 2,
              options: [{ value: 'LEFT', label: 'Left' }],
            },
          ],
        },
      ],
    };
    render(<Harness schema={schema} />);
    expect(screen.queryByText('Mystery')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Hand')).toBeInTheDocument();
  });

  it('renders nothing for an empty schema', () => {
    const { container } = render(<Harness schema={{ groups: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every group is unavailable', () => {
    const schema: ResolvedSportAttributeSchema = {
      groups: badmintonSchema.groups.map((group) => ({ ...group, isAvailable: false })),
    };
    const { container } = render(<Harness schema={schema} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fires onChange(key, value) for a STRING field', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.type(screen.getByLabelText('Note'), 'hi');
    expect(onChangeSpy).toHaveBeenLastCalledWith('note', 'hi');
  });

  it('fires onChange(key, value) for an ENUM field', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.selectOptions(screen.getByLabelText('Level'), 'B');
    expect(onChangeSpy).toHaveBeenCalledWith('level', 'B');
  });

  it('fires onChange(key, value[]) for a LIST checkbox toggle', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.click(screen.getByRole('checkbox', { name: 'X' }));
    expect(onChangeSpy).toHaveBeenCalledWith('tags', ['x']);
  });

  it('fires onChange(key, record) for a DEFINITION nested field edit', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.type(screen.getByLabelText('Name *'), 'A');
    expect(onChangeSpy).toHaveBeenLastCalledWith('primary', { value: 'A' });
  });

  it('adds a row for a DEFINITION_LIST field via Add', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChangeSpy).toHaveBeenCalledWith('items', [{}]);
  });

  it('removes a row for a DEFINITION_LIST field via its remove button', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(
      <Harness
        schema={simpleSchema}
        initialValues={{ items: [{ value: 'A' }, { value: 'B' }] }}
        onChangeSpy={onChangeSpy}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove item 1' }));
    expect(onChangeSpy).toHaveBeenCalledWith('items', [{ value: 'B' }]);
  });

  it('disables unselected LIST checkboxes once MAX_LIST_ITEMS is reached', () => {
    const manyOptionsSchema: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'g',
          label: 'Group',
          isAvailable: true,
          order: 1,
          attributes: [
            {
              key: 'tags',
              label: 'Tags',
              type: 'LIST',
              isAvailable: true,
              order: 1,
              options: Array.from({ length: 11 }, (_unused, index) => ({
                value: `v${index}`,
                label: `V${index}`,
              })),
            },
          ],
        },
      ],
    };
    const tenSelected = Array.from({ length: 10 }, (_unused, index) => `v${index}`);
    render(<Harness schema={manyOptionsSchema} initialValues={{ tags: tenSelected }} />);
    expect(screen.getByRole('checkbox', { name: 'V10' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'V0' })).not.toBeDisabled();
  });

  it('disables Add once a DEFINITION_LIST reaches MAX_LIST_ITEMS rows', () => {
    const tenRows = Array.from({ length: 10 }, () => ({ value: 'x' }));
    render(<Harness schema={simpleSchema} initialValues={{ items: tenRows }} />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('seeds a defaultValue as a real controlled value on mount', () => {
    const schemaWithDefault: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'g',
          label: 'Group',
          isAvailable: true,
          order: 1,
          attributes: [
            {
              key: 'level',
              label: 'Level',
              type: 'ENUM',
              isAvailable: true,
              order: 1,
              defaultValue: 'B',
              options: [
                { value: 'A', label: 'Alpha' },
                { value: 'B', label: 'Beta' },
              ],
            },
          ],
        },
      ],
    };
    const onChangeSpy = vi.fn();
    render(<Harness schema={schemaWithDefault} onChangeSpy={onChangeSpy} />);
    expect(onChangeSpy).toHaveBeenCalledWith('level', 'B');
  });

  it('does not re-seed a defaultValue once the caller already has a value for that key', () => {
    const schemaWithDefault: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'g',
          label: 'Group',
          isAvailable: true,
          order: 1,
          attributes: [
            {
              key: 'level',
              label: 'Level',
              type: 'ENUM',
              isAvailable: true,
              order: 1,
              defaultValue: 'B',
              options: [
                { value: 'A', label: 'Alpha' },
                { value: 'B', label: 'Beta' },
              ],
            },
          ],
        },
      ],
    };
    const onChangeSpy = vi.fn();
    render(<Harness schema={schemaWithDefault} initialValues={{ level: 'A' }} onChangeSpy={onChangeSpy} />);
    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Level')).toHaveValue('A');
  });
});
