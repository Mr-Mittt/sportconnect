import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ResolvedSportAttributeSchema } from '@/shared/types/sport';
import { SportAttributesFields } from './SportAttributesFields';

// SPORT-9: gramWeight/inStock give every DEFINITION-hosting story below a NUMBER + BOOLEAN
// definition field (incl. inner-position) for free, without a separate one-off story.
const referenceDefinition = {
  name: 'Reference',
  fields: [
    { key: 'id', label: 'Item', type: 'STRING' as const, isRequired: false },
    { key: 'value', label: 'Name', type: 'STRING' as const, isRequired: true },
    {
      key: 'gramWeight',
      label: 'Weight (g)',
      type: 'NUMBER' as const,
      isRequired: false,
      min: 0,
      max: 500,
    },
    { key: 'inStock', label: 'In stock', type: 'BOOLEAN' as const, isRequired: false },
  ],
};

const allFieldTypesSchema: ResolvedSportAttributeSchema = {
  definitions: [referenceDefinition],
  groups: [
    {
      key: 'general',
      label: 'General',
      isAvailable: true,
      attributes: [
        {
          key: 'handedness',
          label: 'Hand',
          type: 'STRING',
          isAvailable: true,
        },
        {
          key: 'playstyle',
          label: 'Playstyle',
          type: 'ENUM',
          isAvailable: true,
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
          options: [
            { value: 'SERVE', label: 'Serve' },
            { value: 'NET', label: 'Net play' },
            { value: 'FOOTWORK', label: 'Footwork' },
          ],
        },
        {
          key: 'yearsPlaying',
          label: 'Years playing',
          type: 'NUMBER',
          isAvailable: true,
          min: 0,
          max: 80,
        },
        { key: 'coached', label: 'Has a coach', type: 'BOOLEAN', isAvailable: true },
      ],
    },
    {
      key: 'gear',
      label: 'Gear',
      isAvailable: true,
      attributes: [
        {
          key: 'primaryRacket',
          label: 'Primary racket',
          type: 'DEFINITION',
          definitionRef: 'Reference',
          isAvailable: true,
        },
        {
          key: 'rackets',
          label: 'Rackets',
          type: 'DEFINITION_LIST',
          definitionRef: 'Reference',
          isAvailable: true,
        },
      ],
    },
  ],
};

// SPORT-7/A19: a group carrying its own attributes AND nested sub-groups, to two levels.
const nestedGroupsSchema: ResolvedSportAttributeSchema = {
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
            { value: 'LEFT', label: 'Left' },
            { value: 'RIGHT', label: 'Right' },
          ],
        },
      ],
    },
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
            {
              key: 'tension',
              label: 'String tension (lbs)',
              type: 'NUMBER',
              isAvailable: true,
              min: 15,
              max: 35,
            },
            { key: 'brand', label: 'Brand', type: 'STRING', isAvailable: true },
          ],
          groups: [
            {
              key: 'grip',
              label: 'Grip',
              isAvailable: true,
              attributes: [
                { key: 'size', label: 'Grip size', type: 'STRING', isAvailable: true },
                { key: 'overgrip', label: 'Uses an overgrip', type: 'BOOLEAN', isAvailable: true },
              ],
            },
          ],
        },
        {
          key: 'footwear',
          label: 'Footwear',
          isAvailable: true,
          attributes: [{ key: 'shoeModel', label: 'Shoe model', type: 'STRING', isAvailable: true }],
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
      'general/handedness': 'Right',
      'general/playstyle': 'BALANCE',
      'general/strengths': ['SERVE', 'NET'],
      'general/yearsPlaying': 6,
      'general/coached': true,
      'gear/primaryRacket': { id: null, value: 'Yonex Astrox 88D Pro', gramWeight: 83, inStock: true },
      'gear/rackets': [
        { id: null, value: 'Yonex Astrox 88D Pro', gramWeight: 83, inStock: true },
        { id: 'eq_123', value: 'Yonex Astrox 99 Pro', gramWeight: 90, inStock: false },
      ],
    },
  },
};

/** SPORT-7/A19: nested sub-groups render as indented collapsible sections, one level per depth;
 * a group's own attributes render (in a responsive grid) above its sub-groups. */
export const NestedGroups: Story = {
  args: {
    schema: nestedGroupsSchema,
    values: {
      'general/handedness': 'RIGHT',
      'gear/bagBrand': 'Victor',
      'gear/rackets/tension': 27,
      'gear/rackets/brand': 'Yonex',
      'gear/rackets/grip/size': 'G5',
      'gear/rackets/grip/overgrip': true,
      'gear/footwear/shoeModel': 'Power Cushion 65Z3',
    },
  },
};

/** A sub-group with `isAvailable: false` hides its whole subtree at any depth, even where a
 * descendant's own `isAvailable` is `true` — parent wins, recursively (v3/A19). */
export const NestedUnavailableSubtree: Story = {
  args: {
    schema: {
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          attributes: [{ key: 'bagBrand', label: 'Bag brand', type: 'STRING', isAvailable: true }],
          groups: [
            {
              key: 'rackets',
              label: 'Rackets (retired)',
              isAvailable: false,
              attributes: [{ key: 'tension', label: 'Tension', type: 'NUMBER', isAvailable: true }],
              groups: [
                {
                  key: 'grip',
                  label: 'Grip',
                  isAvailable: true,
                  attributes: [{ key: 'size', label: 'Grip size', type: 'STRING', isAvailable: true }],
                },
              ],
            },
          ],
        },
      ],
    },
    values: {},
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
          attributes: [{ key: 'note', label: 'Note', type: 'STRING', isAvailable: true }],
        },
      ],
    },
    values: { 'general/note': 'Left-handed, plays doubles mostly.' },
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
          attributes: [
            {
              key: 'playstyle',
              label: 'Playstyle',
              type: 'ENUM',
              isAvailable: true,
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
    values: { 'general/playstyle': 'ATTACK' },
  },
};

export const NumberFieldUnbounded: Story = {
  args: {
    schema: {
      groups: [
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          attributes: [
            { key: 'yearsPlaying', label: 'Years playing', type: 'NUMBER', isAvailable: true },
          ],
        },
      ],
    },
    values: { 'general/yearsPlaying': 6 },
  },
};

/** `min`/`max` mirror onto the `<input>` as UX-affordance bounds only — the server silently drops
 * an out-of-range value on save rather than erroring (A16), so this never produces a client-side
 * hard error. */
export const NumberFieldWithBounds: Story = {
  args: {
    schema: {
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          attributes: [
            {
              key: 'stringTension',
              label: 'String tension (lbs)',
              type: 'NUMBER',
              isAvailable: true,
              min: 18,
              max: 35,
            },
          ],
        },
      ],
    },
    values: { 'gear/stringTension': 27.5 },
  },
};

export const BooleanFieldUnchecked: Story = {
  args: {
    schema: {
      groups: [
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          attributes: [{ key: 'coached', label: 'Has a coach', type: 'BOOLEAN', isAvailable: true }],
        },
      ],
    },
    values: {},
  },
};

export const BooleanFieldChecked: Story = {
  args: {
    schema: {
      groups: [
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          attributes: [{ key: 'coached', label: 'Has a coach', type: 'BOOLEAN', isAvailable: true }],
        },
      ],
    },
    values: { 'general/coached': true },
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
          attributes: [
            {
              key: 'tags',
              label: 'Tags',
              type: 'LIST',
              isAvailable: true,
              options: Array.from({ length: 11 }, (_unused, index) => ({
                value: `tag${index}`,
                label: `Tag ${index + 1}`,
              })),
            },
          ],
        },
      ],
    },
    values: { 'general/tags': Array.from({ length: 10 }, (_unused, index) => `tag${index}`) },
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
          attributes: [
            {
              key: 'primaryRacket',
              label: 'Primary racket',
              type: 'DEFINITION',
              definitionRef: 'Reference',
              isAvailable: true,
            },
          ],
        },
      ],
    },
    values: { 'gear/primaryRacket': { id: null, value: 'Yonex Astrox 88D Pro' } },
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
          attributes: [
            {
              key: 'primaryRacket',
              label: 'Primary racket',
              type: 'DEFINITION',
              definitionRef: 'Reference',
              isAvailable: true,
            },
          ],
        },
      ],
    },
    values: { 'gear/primaryRacket': {} },
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
          attributes: [
            {
              key: 'rackets',
              label: 'Rackets',
              type: 'DEFINITION_LIST',
              definitionRef: 'Reference',
              isAvailable: true,
            },
          ],
        },
      ],
    },
    values: {
      'gear/rackets': [
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
          attributes: [{ key: 'note', label: 'Note', type: 'STRING', isAvailable: true }],
        },
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          attributes: [{ key: 'handedness', label: 'Hand', type: 'STRING', isAvailable: true }],
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
          attributes: [
            {
              key: 'mystery',
              label: 'Mystery (future type)',
              type: 'FUTURE_TYPE',
              isAvailable: true,
            },
            { key: 'handedness', label: 'Hand', type: 'STRING', isAvailable: true },
          ],
        },
      ],
    } as unknown as ResolvedSportAttributeSchema,
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

/* CLIENT-SESSION-17 Part B — `#ref` nodes: single-/multi-select whose choices are the creator's
 * own profile value(s) at `prefillKey`, plus an "Other…" affordance for a value not on the
 * profile. Only rendered when `refChoiceSource` is passed (the session-create context). */

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
          key: 'racketBrand',
          label: 'Racket brands you might bring',
          type: 'STRING',
          isAvailable: true,
          cardinality: 'LIST',
          prefillable: true,
          prefillKey: 'gear/racketBrand',
        },
      ],
    },
  ],
} as unknown as ResolvedSportAttributeSchema;

export const RefSingleAndMultiSelect: Story = {
  args: {
    schema: refSchema,
    values: {},
    refChoiceSource: {
      'gear/mainRacket': 'Yonex Astrox 99',
      'gear/racketBrand': ['Yonex', 'Li-Ning'],
    },
    refDraftOptions: {},
    onAddRefDraftOption: () => {},
  },
};

/** No profile value at the `#ref` path — the control shows only "Other…" and a hint. */
export const RefEmptyProfile: Story = {
  args: {
    schema: refSchema,
    values: {},
    refChoiceSource: {},
    refDraftOptions: {},
    onAddRefDraftOption: () => {},
  },
};

/** SPORT-13: a schema whose scalar nodes each declare a non-default `layout` — the arms render
 * the alternate controls (textarea / segmented / radio / slider / stepper) and a `format`
 * preview, all driven purely by the schema. */
const scalarLayoutSchema: ResolvedSportAttributeSchema = {
  groups: [
    {
      key: 'match',
      label: 'Match details',
      isAvailable: true,
      attributes: [
        { key: 'notes', label: 'Notes', type: 'STRING', isAvailable: true, layout: { id: 'textarea' } },
        {
          key: 'competitive',
          label: 'Competitive',
          type: 'BOOLEAN',
          isAvailable: true,
          layout: { id: 'segmented' },
        },
        {
          key: 'level',
          label: 'Level',
          type: 'ENUM',
          isAvailable: true,
          options: [
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Intermediate' },
            { value: 'advanced', label: 'Advanced' },
          ],
          layout: { id: 'radio' },
        },
        {
          key: 'tension',
          label: 'String tension (lbs)',
          type: 'NUMBER',
          isAvailable: true,
          min: 15,
          max: 35,
          layout: { id: 'slider', format: '0 lbs' },
        },
        {
          key: 'winRate',
          label: 'Win rate',
          type: 'NUMBER',
          isAvailable: true,
          layout: { id: 'readonly-text', format: '0%' },
        },
      ],
    },
  ],
};

export const ScalarLayouts: Story = {
  args: {
    schema: scalarLayoutSchema,
    values: { 'match/tension': 26, 'match/winRate': 0.62, 'match/level': 'intermediate' },
  },
};

/* SPORT-14 — container-element layouts. `group` child arrangement, `DEFINITION` record body,
 * `DEFINITION_LIST` presentation, and a heading `icon`. No MSW schema seed sets `layout`, so these
 * are the human-review surface for the container variants (the composite Vitest covers behaviour). */

const twoFieldGroup = (layout: unknown): ResolvedSportAttributeSchema =>
  ({
    groups: [
      {
        key: 'general',
        label: 'General',
        isAvailable: true,
        layout,
        attributes: [
          { key: 'hand', label: 'Handedness', type: 'STRING', isAvailable: true },
          { key: 'reach', label: 'Reach (cm)', type: 'NUMBER', isAvailable: true, min: 0, max: 250 },
          { key: 'stance', label: 'Stance', type: 'STRING', isAvailable: true },
          { key: 'coached', label: 'Has a coach', type: 'BOOLEAN', isAvailable: true },
        ],
      },
    ],
  }) as unknown as ResolvedSportAttributeSchema;

const groupValues = {
  'general/hand': 'Right',
  'general/reach': 180,
  'general/stance': 'Square',
  'general/coached': true,
};

/** `grid-3` — a third column from the `lg` breakpoint (generalises SPORT-7's fixed 1→2 grid). */
export const GroupLayoutGrid3: Story = {
  args: { schema: twoFieldGroup({ id: 'grid-3' }), values: groupValues },
};

/** `inline` — label-left rows (container-level CSS; the arms are untouched). */
export const GroupLayoutInline: Story = {
  args: { schema: twoFieldGroup({ id: 'inline' }), values: groupValues },
};

/** `flat` — the collapsible heading stays, the inner grid/box does not. */
export const GroupLayoutFlat: Story = {
  args: { schema: twoFieldGroup({ id: 'flat' }), values: groupValues },
};

/** `layout.icon` on container headings — `{icon} {label}`, the icon decorative (`aria-hidden`). */
export const HeadingIcons: Story = {
  args: {
    schema: {
      definitions: [referenceDefinition],
      groups: [
        {
          key: 'general',
          label: 'General',
          isAvailable: true,
          layout: { id: 'section', icon: 'shuttlecock' },
          attributes: [{ key: 'hand', label: 'Handedness', type: 'STRING', isAvailable: true }],
        },
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          layout: { id: 'section', icon: 'racket' },
          attributes: [
            {
              key: 'rackets',
              label: 'Rackets',
              type: 'DEFINITION_LIST',
              definitionRef: 'Reference',
              isAvailable: true,
              layout: { id: 'cards', icon: 'racket' },
            },
          ],
        },
      ],
    } as unknown as ResolvedSportAttributeSchema,
    values: {
      'general/hand': 'Right',
      'gear/rackets': [{ id: null, value: 'Yonex Astrox 99 Pro', gramWeight: 90, inStock: true }],
    },
  },
};

/** A mixed, nested document: a `grid-3` group holding an `inline` DEFINITION and a `table`
 * DEFINITION_LIST — container layouts compose. */
export const MixedNestedLayouts: Story = {
  args: {
    schema: {
      definitions: [referenceDefinition],
      groups: [
        {
          key: 'gear',
          label: 'Gear',
          isAvailable: true,
          layout: { id: 'grid-3', icon: 'gear' },
          attributes: [
            { key: 'bagBrand', label: 'Bag brand', type: 'STRING', isAvailable: true },
            {
              key: 'primaryRacket',
              label: 'Primary racket',
              type: 'DEFINITION',
              definitionRef: 'Reference',
              isAvailable: true,
              layout: { id: 'inline' },
            },
            {
              key: 'rackets',
              label: 'Rackets',
              type: 'DEFINITION_LIST',
              definitionRef: 'Reference',
              isAvailable: true,
              layout: { id: 'table' },
            },
          ],
        },
      ],
    } as unknown as ResolvedSportAttributeSchema,
    values: {
      'gear/bagBrand': 'Victor',
      'gear/primaryRacket': { id: null, value: 'Yonex Astrox 88D Pro', gramWeight: 83, inStock: true },
      'gear/rackets': [
        { id: null, value: 'Yonex Astrox 88D Pro', gramWeight: 83, inStock: true },
        { id: 'eq_123', value: 'Yonex Astrox 99 Pro', gramWeight: 90, inStock: false },
      ],
    },
  },
};
