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

/** SPORT-15: `#ref` layout composition — `SINGLE` picks from the ENUM set, `LIST` from the LIST set. */
function Demo({
  cardinality,
  layout,
}: {
  cardinality: 'SINGLE' | 'LIST';
  layout?: ResolvedAttributeLayout;
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
