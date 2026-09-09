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
