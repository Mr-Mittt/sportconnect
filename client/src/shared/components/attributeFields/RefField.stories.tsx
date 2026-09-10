import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  ResolvedAttributeLayout,
  ResolvedRefAttribute,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { RefField } from './RefField';

const DEFS = new Map<string, ResolvedSportAttributeDefinitionType>();
const CHOICE_SOURCE = {
  'gear/racket': ['Yonex Astrox 99', 'Li-Ning Axforce 90', 'Victor Thruster K'],
};

/** SPORT-15: `#ref` layout composition — `SINGLE` picks from the ENUM set, `LIST` from the LIST set.
 * SPORT-16: `layoutProp` is the `layout` prop `SportAttributesFields` passes after applying
 * `#ref`→base inheritance (`node.layout ?? baseAttr.layout`) — when set it overrides `node.layout`. */
function Demo({
  cardinality,
  layout,
  layoutProp,
}: {
  cardinality: 'SINGLE' | 'LIST';
  layout?: ResolvedAttributeLayout;
  layoutProp?: ResolvedAttributeLayout | null;
}) {
  const node = {
    key: 'racket',
    label: 'Racket',
    type: 'STRING',
    prefillable: true,
    cardinality,
    prefillKey: 'gear/racket',
    layout,
  } as ResolvedRefAttribute;
  const [value, setValue] = useState<unknown>(cardinality === 'LIST' ? [] : '');
  const [drafts, setDrafts] = useState<unknown[]>([]);
  return (
    <div className="max-w-sm">
      <RefField
        node={node}
        fieldId="racket"
        value={value}
        onChange={setValue}
        choiceSource={CHOICE_SOURCE}
        draftOptions={drafts}
        onAddDraftOption={(v) => setDrafts((d) => [...d, v])}
        definitionsByName={DEFS}
        layout={layoutProp}
      />
    </div>
  );
}

const GRIP: ResolvedSportAttributeDefinitionType = {
  name: 'Grip',
  fields: [
    { key: 'brand', label: 'Brand', type: 'STRING', isRequired: true },
    { key: 'code', label: 'Code', type: 'STRING' },
    { key: 'note', label: 'Note', type: 'STRING' },
  ],
};
const GRIP_DEFS = new Map<string, ResolvedSportAttributeDefinitionType>([['Grip', GRIP]]);

/** SPORT-16: `#ref`-to-`DEFINITION` record with a `fieldLayouts` map — `code` hidden, `note`
 * forced to a textarea. Open "Other…" to see the record form honour the overrides. */
function RecordDemo() {
  const node = {
    key: 'grip',
    label: 'Grip',
    type: 'DEFINITION',
    prefillable: true,
    cardinality: 'SINGLE',
    prefillKey: 'gear/grip',
    definitionRef: 'Grip',
    fieldLayouts: {
      code: { hidden: true },
      note: { id: 'textarea' },
    },
  } as ResolvedRefAttribute;
  const [value, setValue] = useState<unknown>('');
  const [drafts, setDrafts] = useState<unknown[]>([]);
  return (
    <div className="max-w-sm">
      <RefField
        node={node}
        fieldId="grip"
        value={value}
        onChange={setValue}
        choiceSource={null}
        draftOptions={drafts}
        onAddDraftOption={(v) => setDrafts((d) => [...d, v])}
        definitionsByName={GRIP_DEFS}
        layout={{ id: 'radio' }}
      />
    </div>
  );
}

const meta = {
  title: 'AttributeFields/RefField',
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SingleDropdown: Story = { args: { cardinality: 'SINGLE', layout: { id: 'dropdown' } } };
export const SingleRadio: Story = { args: { cardinality: 'SINGLE', layout: { id: 'radio' } } };
export const SingleSegmented: Story = {
  args: { cardinality: 'SINGLE', layout: { id: 'segmented' } },
};
export const ListCheckboxes: Story = {
  args: { cardinality: 'LIST', layout: { id: 'checkboxes' } },
};
export const ListChips: Story = { args: { cardinality: 'LIST', layout: { id: 'chips' } } };
export const ListMultiselect: Story = {
  args: { cardinality: 'LIST', layout: { id: 'multiselect' } },
};
export const ListOrdered: Story = { args: { cardinality: 'LIST', layout: { id: 'ordered' } } };
/** No `layout` — SINGLE defaults to `dropdown`, LIST to `checkboxes` (byte-identical to pre-SPORT-15). */
export const DefaultSingle: Story = { args: { cardinality: 'SINGLE' } };
export const DefaultList: Story = { args: { cardinality: 'LIST' } };

/** SPORT-16: `node.layout` is absent but the `layout` prop (inherited from the base attribute)
 * drives the control. */
export const InheritedLayout: Story = {
  args: { cardinality: 'SINGLE', layoutProp: { id: 'segmented' } },
};

/** SPORT-16: `#ref` `fieldLayouts` overrides on a record base — `code` hidden, `note` a textarea. */
export const FieldLayoutsOverride: Story = {
  args: { cardinality: 'SINGLE' },
  render: () => <RecordDemo />,
};
