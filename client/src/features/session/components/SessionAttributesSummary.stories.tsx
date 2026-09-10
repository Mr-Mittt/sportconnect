import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { SessionAttributesSummary } from './SessionAttributesSummary';

const schema: ResolvedSportAttributeSchema = {
  definitions: [
    {
      name: 'Reference',
      fields: [
        { key: 'id', label: 'Item', type: 'STRING' },
        { key: 'value', label: 'Name', type: 'STRING' },
      ],
    },
  ],
  groups: [
    {
      key: 'match',
      label: 'Match details',
      isAvailable: true,
      attributes: [
        { key: 'format', label: 'Format', type: 'STRING', isAvailable: true },
        { key: 'competitive', label: 'Competitive', type: 'BOOLEAN', isAvailable: true },
        { key: 'courtNumber', label: 'Court number', type: 'NUMBER', isAvailable: true },
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
          key: 'equipmentProvided',
          label: 'Equipment provided',
          type: 'LIST',
          isAvailable: true,
          options: [
            { value: 'shuttles', label: 'Shuttles' },
            { value: 'water', label: 'Water' },
            { value: 'bibs', label: 'Bibs' },
          ],
        },
        {
          key: 'shuttlecock',
          label: 'Shuttlecock',
          type: 'DEFINITION',
          isAvailable: true,
          definitionRef: 'Reference',
        },
      ],
      groups: [
        {
          key: 'venue',
          label: 'Venue',
          isAvailable: true,
          attributes: [{ key: 'indoor', label: 'Indoor', type: 'BOOLEAN', isAvailable: true }],
        },
      ],
    },
  ],
};

const meta = {
  title: 'Session/SessionAttributesSummary',
  component: SessionAttributesSummary,
  decorators: [
    (Story) => (
      <div className="max-w-[24rem] rounded-xl border-hairline border-border bg-surface-2 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionAttributesSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every field type populated — the shape a fully-filled session detail modal shows. */
export const AllTypes: Story = {
  args: {
    schema,
    values: {
      'match/format': 'Doubles',
      'match/competitive': true,
      'match/courtNumber': 4,
      'match/level': 'advanced',
      'match/equipmentProvided': ['shuttles', 'water'],
      'match/shuttlecock': { id: 'yonex-aerosensa-30', value: 'Yonex Aerosensa 30' },
      'match/venue/indoor': true,
    },
  },
};

/** Only some fields filled — the rest (and any empty sub-group) are omitted entirely. */
export const Partial: Story = {
  args: {
    schema,
    values: {
      'match/format': 'Singles',
      'match/level': 'beginner',
    },
  },
};

/** No stored values at all — the component renders nothing (the modal shows no section). */
export const Empty: Story = {
  args: { schema, values: {} },
};

/** CLIENT-SESSION-17: a `#ref` node's stored value shape follows its `cardinality`, not its
 * inherited scalar `type` — a `SINGLE` `#ref` stores one value (shown plain), a `LIST` `#ref`
 * stores an array (shown as chips). `SessionAttributesSummary` maps the `#ref` node onto the
 * matching own-node render type. */
export const RefValues: Story = {
  args: {
    schema: {
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
    } as unknown as ResolvedSportAttributeSchema,
    values: {
      'match/mainRacket': 'Yonex Astrox 99',
      'match/racketModels': ['Yonex Astrox 99', 'Li-Ning Axforce 90', 'Victor Thruster'],
    },
  },
};

/* SPORT-15 — read-only `layout` parity. No MSW schema seed sets `layout`, so these stories are the
 * human-review surface for the read variants (the composite Vitest covers behaviour). */

const layoutSchema = {
  definitions: [
    {
      name: 'Reference',
      fields: [
        { key: 'value', label: 'Model', type: 'STRING' },
        { key: 'grams', label: 'Weight (g)', type: 'NUMBER' },
      ],
    },
  ],
  groups: [
    {
      key: 'match',
      label: 'Match details',
      isAvailable: true,
      layout: { id: 'grid-2', icon: 'shuttlecock' },
      attributes: [
        { key: 'format', label: 'Format', type: 'STRING', isAvailable: true },
        {
          key: 'winRate',
          label: 'Win rate',
          type: 'NUMBER',
          isAvailable: true,
          layout: { id: 'readonly-text', format: { en: '0%' } },
        },
        {
          key: 'kitComma',
          label: 'Kit (comma)',
          type: 'LIST',
          isAvailable: true,
          layout: { id: 'comma' },
          options: [
            { value: 's', label: 'Shuttles' },
            { value: 'w', label: 'Water' },
          ],
        },
        {
          key: 'kitBullets',
          label: 'Kit (bullets)',
          type: 'LIST',
          isAvailable: true,
          layout: { id: 'bullets' },
          options: [
            { value: 's', label: 'Shuttles' },
            { value: 'w', label: 'Water' },
          ],
        },
        {
          key: 'racketsTable',
          label: 'Rackets (table)',
          type: 'DEFINITION_LIST',
          isAvailable: true,
          definitionRef: 'Reference',
          layout: { id: 'table', icon: 'racket' },
        },
        {
          key: 'racketsAccordion',
          label: 'Rackets (accordion)',
          type: 'DEFINITION_LIST',
          isAvailable: true,
          definitionRef: 'Reference',
          layout: { id: 'accordion' },
        },
      ],
    },
  ],
} as unknown as ResolvedSportAttributeSchema;

/** One document exercising every read `layout.id`: a `grid-2` group with a heading icon, a
 * `format`ted NUMBER, `comma` / `bullets` LIST display, and `table` / `accordion` DEFINITION_LIST. */
export const ReadOnlyLayouts: Story = {
  args: {
    schema: layoutSchema,
    values: {
      'match/format': 'Doubles',
      'match/winRate': 0.62,
      'match/kitComma': ['s', 'w'],
      'match/kitBullets': ['s', 'w'],
      'match/racketsTable': [
        { value: 'Astrox 99 Pro', grams: 90 },
        { value: 'Nanoflare 800', grams: 88 },
      ],
      'match/racketsAccordion': [
        { value: 'Astrox 99 Pro', grams: 90 },
        { value: 'Nanoflare 800', grams: 88 },
      ],
    },
  },
};

/** A `hidden` field (`url`) holds a stored value but renders no row — only `Model` shows. */
export const HiddenField: Story = {
  args: {
    schema: {
      definitions: [
        {
          name: 'Reference',
          fields: [
            { key: 'value', label: 'Model', type: 'STRING' },
            { key: 'url', label: 'URL', type: 'STRING', hidden: true },
          ],
        },
      ],
      groups: [
        {
          key: 'match',
          label: 'Match details',
          isAvailable: true,
          attributes: [
            {
              key: 'racket',
              label: 'Racket',
              type: 'DEFINITION',
              isAvailable: true,
              definitionRef: 'Reference',
            },
          ],
        },
      ],
    } as unknown as ResolvedSportAttributeSchema,
    values: {
      'match/racket': { value: 'Yonex Astrox 99 Pro', url: 'https://example.com/astrox-99-pro' },
    },
  },
};
