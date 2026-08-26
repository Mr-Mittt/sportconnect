import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { SportAttributesFields } from './SportAttributesFields';

const referenceDefinition = {
  name: 'Reference',
  fields: [
    { key: 'id', label: 'Item', type: 'STRING' as const, isRequired: false, order: 1 },
    { key: 'value', label: 'Name', type: 'STRING' as const, isRequired: true, order: 2 },
  ],
};

const allFieldTypesSchema: ResolvedSportAttributeSchema = {
  definitions: [referenceDefinition],
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
          type: 'STRING',
          isAvailable: true,
          order: 1,
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
            { value: 'DEFENSE', label: 'Defense' },
          ],
        },
        {
          key: 'strengths',
          label: 'Strengths',
          type: 'LIST',
          isAvailable: true,
          order: 3,
          options: [
            { value: 'SERVE', label: 'Serve' },
            { value: 'NET', label: 'Net play' },
            { value: 'FOOTWORK', label: 'Footwork' },
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
          key: 'primaryRacket',
          label: 'Primary racket',
          type: 'DEFINITION',
          definitionRef: 'Reference',
          isAvailable: true,
          order: 1,
        },
        {
          key: 'rackets',
          label: 'Rackets',
          type: 'DEFINITION_LIST',
          definitionRef: 'Reference',
          isAvailable: true,
          order: 2,
        },
      ],
    },
  ],
};

const meta = {
  title: 'Shared/SportAttributesFields',
  component: SportAttributesFields,
  args: {
    onChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-xl border-hairline border-border bg-surface-2 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SportAttributesFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One of every node type in one document — the realistic "a sport's whole schema" view. */
export const AllFieldTypes: Story = {
  args: {
    schema: allFieldTypesSchema,
    values: {
      handedness: 'Right',
      playstyle: 'BALANCE',
      strengths: ['SERVE', 'NET'],
      primaryRacket: { id: null, value: 'Yonex Astrox 88D Pro' },
      rackets: [
        { id: null, value: 'Yonex Astrox 88D Pro' },
        { id: 'eq_123', value: 'Yonex Astrox 99 Pro' },
      ],
    },
  },
};

export const StringField: Story = {
  args: {
    schema: {
      groups: [
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          order: 1,
          attributes: [{ key: 'note', label: 'Note', type: 'STRING', isAvailable: true, order: 1 }],
        },
      ],
    },
    values: { note: 'Left-handed, plays doubles mostly.' },
  },
};

export const EnumField: Story = {
  args: {
    schema: {
      groups: [
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          order: 1,
          attributes: [
            {
              key: 'playstyle',
              label: 'Playstyle',
              type: 'ENUM',
              isAvailable: true,
              order: 1,
              options: [
                { value: 'ATTACK', label: 'Attack' },
                { value: 'BALANCE', label: 'Balance' },
                { value: 'DEFENSE', label: 'Defense' },
              ],
            },
          ],
        },
      ],
    },
    values: { playstyle: 'ATTACK' },
  },
};

/** Ten selected, the cap `SportAttributeValues.MAX_LIST_ITEMS` — every unselected option
 * disables itself rather than letting the user pick an 11th and find out on save. */
export const ListFieldAtCap: Story = {
  args: {
    schema: {
      groups: [
        {
          key: 'general',
          label: 'General',
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
                value: `tag${index}`,
                label: `Tag ${index + 1}`,
              })),
            },
          ],
        },
      ],
    },
    values: { tags: Array.from({ length: 10 }, (_unused, index) => `tag${index}`) },
  },
};

/** A `DEFINITION` renders inline as an indented sub-section — never a sub-modal (design decision,
 * v2 design §16). */
export const DefinitionField: Story = {
  args: {
    schema: {
      definitions: [referenceDefinition],
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          order: 1,
          attributes: [
            {
              key: 'primaryRacket',
              label: 'Primary racket',
              type: 'DEFINITION',
              definitionRef: 'Reference',
              isAvailable: true,
              order: 1,
            },
          ],
        },
      ],
    },
    values: { primaryRacket: { id: null, value: 'Yonex Astrox 88D Pro' } },
  },
};

/** A required field with no value shows an inline hint — visual only, no Save action exists in
 * this ticket to block (SPORT-2's own scope note). */
export const DefinitionFieldMissingRequired: Story = {
  args: {
    schema: {
      definitions: [referenceDefinition],
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          order: 1,
          attributes: [
            {
              key: 'primaryRacket',
              label: 'Primary racket',
              type: 'DEFINITION',
              definitionRef: 'Reference',
              isAvailable: true,
              order: 1,
            },
          ],
        },
      ],
    },
    values: { primaryRacket: {} },
  },
};

/** Repeating rows with add/remove, capped at `MAX_LIST_ITEMS`. */
export const DefinitionListField: Story = {
  args: {
    schema: {
      definitions: [referenceDefinition],
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          order: 1,
          attributes: [
            {
              key: 'rackets',
              label: 'Rackets',
              type: 'DEFINITION_LIST',
              definitionRef: 'Reference',
              isAvailable: true,
              order: 1,
            },
          ],
        },
      ],
    },
    values: {
      rackets: [
        { id: null, value: 'Yonex Astrox 88D Pro' },
        { id: 'eq_123', value: 'Yonex Astrox 99 Pro' },
      ],
    },
  },
};

/** A group with `isAvailable: false` hides its whole subtree, even though one child's own
 * `isAvailable` is `true` — parent wins (v2 design, unchanged from v1 §5). */
export const UnavailableSubtree: Story = {
  args: {
    schema: {
      groups: [
        {
          key: 'retired',
          label: 'Retired group',
          isAvailable: false,
          order: 1,
          attributes: [
            { key: 'note', label: 'Note', type: 'STRING', isAvailable: true, order: 1 },
          ],
        },
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          order: 2,
          attributes: [
            { key: 'handedness', label: 'Hand', type: 'STRING', isAvailable: true, order: 1 },
          ],
        },
      ],
    },
    values: {},
  },
};

/** A schema-declared type this client build doesn't know about — skipped, not crashed on. */
export const UnknownTypeDegradation: Story = {
  args: {
    schema: {
      groups: [
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          order: 1,
          attributes: [
            {
              key: 'mystery',
              label: 'Mystery (future type)',
              type: 'FUTURE_TYPE' as ResolvedSportAttributeSchema['groups'][number]['attributes'][number]['type'],
              isAvailable: true,
              order: 1,
            },
            { key: 'handedness', label: 'Hand', type: 'STRING', isAvailable: true, order: 2 },
          ],
        },
      ],
    },
    values: {},
  },
};

/** No available groups/attributes — no empty section header, no dangling heading. */
export const Empty: Story = {
  args: {
    schema: { groups: [] },
    values: {},
  },
};
