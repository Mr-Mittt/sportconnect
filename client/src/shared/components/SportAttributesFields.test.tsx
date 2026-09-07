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

// Mirrors A15's real Badminton content closely enough to exercise groups, isAvailable at both
// levels, ENUM, and DEFINITION_LIST-over-Reference. v3/A19: no `order`, attribute I/O is
// path-keyed (`general/handedness`, `gear/rackets`).
const badmintonSchema: ResolvedSportAttributeSchema = {
  definitions: [
    {
      name: 'Reference',
      fields: [
        { key: 'id', label: 'Item', type: 'STRING', isRequired: false },
        { key: 'value', label: 'Name', type: 'STRING', isRequired: true },
      ],
    },
  ],
  groups: [
    {
      key: 'general',
      label: 'General',
      isAvailable: true,
      attributes: [
        {
          key: 'handedness',
          label: 'Hand',
          type: 'ENUM',
          isAvailable: true,
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
      attributes: [
        {
          key: 'rackets',
          label: 'Rackets',
          type: 'DEFINITION_LIST',
          definitionRef: 'Reference',
          isAvailable: true,
        },
        {
          key: 'footwear',
          label: 'Footwear',
          type: 'DEFINITION_LIST',
          definitionRef: 'Reference',
          isAvailable: true,
        },
      ],
    },
  ],
};

// One of each top-level type, for focused per-type interaction tests. `weight`/`strung` and the
// Reference definition's `gramWeight`/`inStock` (SPORT-9) exercise NUMBER/BOOLEAN both top-level
// and as definition fields (incl. inner-position via `primary`/`items`). Group key `g` ⇒ every
// attribute path below is `g/<key>`.
const simpleSchema: ResolvedSportAttributeSchema = {
  definitions: [
    {
      name: 'Reference',
      fields: [
        { key: 'id', label: 'Item', type: 'STRING', isRequired: false },
        { key: 'value', label: 'Name', type: 'STRING', isRequired: true },
        { key: 'gramWeight', label: 'Weight (g)', type: 'NUMBER', isRequired: false, min: 0, max: 500 },
        { key: 'inStock', label: 'In stock', type: 'BOOLEAN', isRequired: false },
      ],
    },
  ],
  groups: [
    {
      key: 'g',
      label: 'Group',
      isAvailable: true,
      attributes: [
        { key: 'note', label: 'Note', type: 'STRING', isAvailable: true },
        {
          key: 'level',
          label: 'Level',
          type: 'ENUM',
          isAvailable: true,
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
        },
        {
          key: 'items',
          label: 'Items',
          type: 'DEFINITION_LIST',
          definitionRef: 'Reference',
          isAvailable: true,
        },
        {
          key: 'weight',
          label: 'Weight (kg)',
          type: 'NUMBER',
          isAvailable: true,
          min: 0,
          max: 200,
        },
        { key: 'strung', label: 'Strung', type: 'BOOLEAN', isAvailable: true },
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

  it('renders groups and attributes in declared array order (v3/A19 — no order field)', () => {
    const schema: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'zeta',
          label: 'Zeta group',
          isAvailable: true,
          attributes: [
            { key: 'second', label: 'Second field', type: 'STRING', isAvailable: true },
            { key: 'first', label: 'First field', type: 'STRING', isAvailable: true },
          ],
        },
        {
          key: 'alpha',
          label: 'Alpha group',
          isAvailable: true,
          attributes: [{ key: 'only', label: 'Only field', type: 'STRING', isAvailable: true }],
        },
      ],
    };
    render(<Harness schema={schema} />);
    const text = document.body.textContent ?? '';
    expect(text.indexOf('Zeta group')).toBeLessThan(text.indexOf('Alpha group'));
    expect(text.indexOf('Second field')).toBeLessThan(text.indexOf('First field'));
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

  describe('nested sub-groups (v3/A19)', () => {
    const nestedSchema: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          attributes: [{ key: 'bagBrand', label: 'Bag brand', type: 'STRING', isAvailable: true }],
          groups: [
            {
              key: 'rackets',
              label: 'Rackets',
              isAvailable: true,
              attributes: [
                { key: 'tension', label: 'Tension', type: 'STRING', isAvailable: true },
              ],
              groups: [
                {
                  key: 'grip',
                  label: 'Grip',
                  isAvailable: true,
                  attributes: [
                    { key: 'size', label: 'Grip size', type: 'STRING', isAvailable: true },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    it('renders a sub-group section and its fields', () => {
      render(<Harness schema={nestedSchema} />);
      expect(screen.getByText('Gear')).toBeInTheDocument();
      expect(screen.getByText('Rackets')).toBeInTheDocument();
      expect(screen.getByText('Grip')).toBeInTheDocument();
      expect(screen.getByLabelText('Bag brand')).toBeInTheDocument();
      expect(screen.getByLabelText('Tension')).toBeInTheDocument();
      expect(screen.getByLabelText('Grip size')).toBeInTheDocument();
    });

    it('fires onChange with the full /-separated path for a nested field', async () => {
      const user = userEvent.setup();
      const onChangeSpy = vi.fn();
      render(<Harness schema={nestedSchema} onChangeSpy={onChangeSpy} />);
      await user.type(screen.getByLabelText('Grip size'), 'G5');
      expect(onChangeSpy).toHaveBeenLastCalledWith('gear/rackets/grip/size', 'G5');
      await user.type(screen.getByLabelText('Bag brand'), 'V');
      expect(onChangeSpy).toHaveBeenLastCalledWith('gear/bagBrand', 'V');
    });

    it('seeds a value from the caller at the full nested path', () => {
      render(<Harness schema={nestedSchema} initialValues={{ 'gear/rackets/grip/size': 'G4' }} />);
      expect(screen.getByLabelText('Grip size')).toHaveValue('G4');
    });

    it('an isAvailable:false ancestor group hides the entire subtree at every depth', () => {
      const schema: ResolvedSportAttributeSchema = {
        groups: [
          {
            ...nestedSchema.groups[0],
            groups: [{ ...nestedSchema.groups[0].groups![0], isAvailable: false }],
          },
        ],
      };
      render(<Harness schema={schema} />);
      expect(screen.getByText('Gear')).toBeInTheDocument();
      expect(screen.getByLabelText('Bag brand')).toBeInTheDocument();
      expect(screen.queryByText('Rackets')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Tension')).not.toBeInTheDocument();
      expect(screen.queryByText('Grip')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Grip size')).not.toBeInTheDocument();
    });

    it('still renders a group whose only visible content is a sub-group', () => {
      const schema: ResolvedSportAttributeSchema = {
        groups: [
          {
            key: 'gear',
            label: 'Gear',
            isAvailable: true,
            attributes: [],
            groups: [
              {
                key: 'rackets',
                label: 'Rackets',
                isAvailable: true,
                attributes: [
                  { key: 'tension', label: 'Tension', type: 'STRING', isAvailable: true },
                ],
              },
            ],
          },
        ],
      };
      render(<Harness schema={schema} />);
      expect(screen.getByText('Gear')).toBeInTheDocument();
      expect(screen.getByLabelText('Tension')).toBeInTheDocument();
    });
  });

  it('collapses and re-expands a group section on trigger click', async () => {
    const user = userEvent.setup();
    render(<Harness schema={badmintonSchema} />);
    expect(screen.getByLabelText('Hand')).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'General' });
    await user.click(trigger);
    expect(screen.queryByLabelText('Hand')).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByLabelText('Hand')).toBeInTheDocument();
  });

  it('skips an attribute with an unknown type instead of crashing', () => {
    const schema: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          attributes: [
            {
              key: 'mystery',
              label: 'Mystery',
              // A schema-declared type this client build doesn't know about yet.
              type: 'FUTURE_TYPE' as ResolvedSportAttributeSchema['groups'][number]['attributes'][number]['type'],
              isAvailable: true,
            },
            {
              key: 'handedness',
              label: 'Hand',
              type: 'ENUM',
              isAvailable: true,
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

  it('fires onChange(path, value) for a STRING field', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.type(screen.getByLabelText('Note'), 'hi');
    expect(onChangeSpy).toHaveBeenLastCalledWith('g/note', 'hi');
  });

  it('fires onChange(path, value) for an ENUM field', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.selectOptions(screen.getByLabelText('Level'), 'B');
    expect(onChangeSpy).toHaveBeenCalledWith('g/level', 'B');
  });

  it('fires onChange(path, value[]) for a LIST checkbox toggle', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.click(screen.getByRole('checkbox', { name: 'X' }));
    expect(onChangeSpy).toHaveBeenCalledWith('g/tags', ['x']);
  });

  it('renders a NUMBER field as a number input honoring min/max', () => {
    render(<Harness schema={simpleSchema} />);
    const input = screen.getByLabelText('Weight (kg)');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '200');
  });

  it('fires onChange(path, number) for a NUMBER field, never a string', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.type(screen.getByLabelText('Weight (kg)'), '25');
    expect(onChangeSpy).toHaveBeenLastCalledWith('g/weight', 25);
  });

  it('an emptied NUMBER field reports undefined, never NaN or an empty string', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(
      <Harness schema={simpleSchema} initialValues={{ 'g/weight': 25 }} onChangeSpy={onChangeSpy} />,
    );
    await user.clear(screen.getByLabelText('Weight (kg)'));
    expect(onChangeSpy).toHaveBeenLastCalledWith('g/weight', undefined);
  });

  it('fires onChange(path, boolean) for a BOOLEAN field toggle', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.click(screen.getByRole('switch', { name: 'Strung' }));
    expect(onChangeSpy).toHaveBeenCalledWith('g/strung', true);
  });

  it('fires onChange(path, record) for a DEFINITION nested field edit', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.type(screen.getByLabelText('Name *'), 'A');
    expect(onChangeSpy).toHaveBeenLastCalledWith('g/primary', { value: 'A' });
  });

  it('NUMBER and BOOLEAN definition fields round-trip inside a DEFINITION record', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);

    await user.type(screen.getByLabelText('Weight (g)'), '50');
    expect(onChangeSpy).toHaveBeenLastCalledWith('g/primary', { gramWeight: 50 });

    await user.click(screen.getByRole('switch', { name: 'In stock' }));
    expect(onChangeSpy).toHaveBeenLastCalledWith('g/primary', { gramWeight: 50, inStock: true });
  });

  it('adds a row for a DEFINITION_LIST field via Add', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness schema={simpleSchema} onChangeSpy={onChangeSpy} />);
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChangeSpy).toHaveBeenCalledWith('g/items', [{}]);
  });

  it('removes a row for a DEFINITION_LIST field via its remove button', async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(
      <Harness
        schema={simpleSchema}
        initialValues={{ 'g/items': [{ value: 'A' }, { value: 'B' }] }}
        onChangeSpy={onChangeSpy}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove item 1' }));
    expect(onChangeSpy).toHaveBeenCalledWith('g/items', [{ value: 'B' }]);
  });

  it('disables unselected LIST checkboxes once MAX_LIST_ITEMS is reached', () => {
    const manyOptionsSchema: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'g',
          label: 'Group',
          isAvailable: true,
          attributes: [
            {
              key: 'tags',
              label: 'Tags',
              type: 'LIST',
              isAvailable: true,
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
    render(<Harness schema={manyOptionsSchema} initialValues={{ 'g/tags': tenSelected }} />);
    expect(screen.getByRole('checkbox', { name: 'V10' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'V0' })).not.toBeDisabled();
  });

  it('disables Add once a DEFINITION_LIST reaches MAX_LIST_ITEMS rows', () => {
    const tenRows = Array.from({ length: 10 }, () => ({ value: 'x' }));
    render(<Harness schema={simpleSchema} initialValues={{ 'g/items': tenRows }} />);
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('seeds a defaultValue as a real controlled value on mount, keyed by the full path', () => {
    const schemaWithDefault: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'g',
          label: 'Group',
          isAvailable: true,
          attributes: [
            {
              key: 'level',
              label: 'Level',
              type: 'ENUM',
              isAvailable: true,
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
    expect(onChangeSpy).toHaveBeenCalledWith('g/level', 'B');
  });

  it('does not re-seed a defaultValue once the caller already has a value for that path', () => {
    const schemaWithDefault: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'g',
          label: 'Group',
          isAvailable: true,
          attributes: [
            {
              key: 'level',
              label: 'Level',
              type: 'ENUM',
              isAvailable: true,
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
    render(
      <Harness
        schema={schemaWithDefault}
        initialValues={{ 'g/level': 'A' }}
        onChangeSpy={onChangeSpy}
      />,
    );
    expect(onChangeSpy).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Level')).toHaveValue('A');
  });

  it('seeds a nested sub-group defaultValue at its full path', () => {
    const schema: ResolvedSportAttributeSchema = {
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          attributes: [],
          groups: [
            {
              key: 'rackets',
              label: 'Rackets',
              isAvailable: true,
              attributes: [
                {
                  key: 'tension',
                  label: 'Tension',
                  type: 'STRING',
                  isAvailable: true,
                  defaultValue: '27',
                },
              ],
            },
          ],
        },
      ],
    };
    const onChangeSpy = vi.fn();
    render(<Harness schema={schema} onChangeSpy={onChangeSpy} />);
    expect(onChangeSpy).toHaveBeenCalledWith('gear/rackets/tension', '27');
  });
});
