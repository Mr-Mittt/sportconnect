import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ResolvedAttributeLayout, ResolvedSportAttributeOption } from '@/shared/types/sport';
import { ListField } from './ListField';

const OPTIONS: ResolvedSportAttributeOption[] = [
  { value: 'serve', label: 'Serve' },
  { value: 'net', label: 'Net play' },
  { value: 'footwork', label: 'Footwork' },
  { value: 'backhand', label: 'Backhand' },
  { value: 'defense', label: 'Defense' },
];

/** SPORT-14: one story per `LIST` container `layout.id`. */
function Demo({
  layout,
  initial = ['serve', 'net'],
}: {
  layout?: ResolvedAttributeLayout;
  initial?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  return (
    <div className="max-w-sm">
      <ListField
        fieldId="strengths"
        label="Strengths"
        options={OPTIONS}
        selected={selected}
        onChange={setSelected}
        layout={layout}
      />
    </div>
  );
}

const meta = {
  title: 'AttributeFields/ListField',
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Checkboxes: Story = { args: { layout: { id: 'checkboxes' } } };
export const Chips: Story = { args: { layout: { id: 'chips' } } };
export const Multiselect: Story = { args: { layout: { id: 'multiselect' } } };
export const Ordered: Story = { args: { layout: { id: 'ordered' } } };
/** No `layout` — the default, byte-identical to pre-SPORT-14 (`checkboxes`). */
export const DefaultNoLayout: Story = {};
