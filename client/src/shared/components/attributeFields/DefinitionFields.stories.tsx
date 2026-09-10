import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  ResolvedAttributeLayout,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { DefinitionFields } from './DefinitionFields';

const REFERENCE: ResolvedSportAttributeDefinitionType = {
  name: 'Reference',
  fields: [
    { key: 'value', label: 'Model', type: 'STRING', isRequired: true },
    { key: 'gramWeight', label: 'Weight (g)', type: 'NUMBER', isRequired: false, min: 0, max: 500 },
    { key: 'balance', label: 'Balance', type: 'STRING', isRequired: false },
    { key: 'inStock', label: 'In stock', type: 'BOOLEAN', isRequired: false },
  ],
};

/** SPORT-14: one story per `DEFINITION` record-body `layout.id`. */
function Demo({ layout }: { layout?: ResolvedAttributeLayout }) {
  const [record, setRecord] = useState<Record<string, unknown>>({
    value: 'Yonex Astrox 99 Pro',
    gramWeight: 90,
    balance: 'Head-heavy',
    inStock: true,
  });
  return (
    <div className="max-w-md rounded-lg border-hairline border-border p-3">
      <DefinitionFields
        definitionType={REFERENCE}
        record={record}
        onChange={setRecord}
        definitionsByName={new Map([['Reference', REFERENCE]])}
        layout={layout}
      />
    </div>
  );
}

const meta = {
  title: 'AttributeFields/DefinitionFields',
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Stacked: Story = { args: { layout: { id: 'stacked' } } };
export const Inline: Story = { args: { layout: { id: 'inline' } } };
export const Grid2: Story = { args: { layout: { id: 'grid-2' } } };
/** No `layout` — the default, byte-identical to pre-SPORT-14 (`stacked`). */
export const DefaultNoLayout: Story = {};
