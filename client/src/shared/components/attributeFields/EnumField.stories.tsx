import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ResolvedAttributeLayout, ResolvedSportAttributeOption } from '@/shared/types/sport';
import { EnumField } from './EnumField';

const SHORT: ResolvedSportAttributeOption[] = [
  { value: 'attack', label: 'Attack' },
  { value: 'balance', label: 'Balance' },
  { value: 'defend', label: 'Defend' },
];
const LONG: ResolvedSportAttributeOption[] = Array.from({ length: 8 }, (_, i) => ({
  value: `l${i}`,
  label: `Level ${i + 1}`,
}));

/** SPORT-13: one story per `ENUM` `layout.id`, plus the too-many-options degrade. */
function Demo({
  layout,
  options = SHORT,
  initial = '',
}: {
  layout?: ResolvedAttributeLayout;
  options?: ResolvedSportAttributeOption[];
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="max-w-sm">
      <EnumField
        attribute={{ options }}
        fieldId="e"
        label="Playstyle"
        value={value}
        onChange={(v) => setValue(v as string)}
        layout={layout}
      />
    </div>
  );
}

const meta = {
  title: 'AttributeFields/EnumField',
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dropdown: Story = { args: { layout: { id: 'dropdown' } } };
export const Radio: Story = { args: { layout: { id: 'radio' } } };
export const Segmented: Story = { args: { layout: { id: 'segmented' } } };
/** With a value set: the dropdown gets an `×` clear button; radio/segmented deselect on
 * re-clicking the selected option. */
export const DropdownWithClear: Story = {
  args: { layout: { id: 'dropdown' }, initial: 'balance' },
};
export const RadioSelectedDeselectable: Story = {
  args: { layout: { id: 'radio' }, initial: 'balance' },
};
export const SegmentedSelectedDeselectable: Story = {
  args: { layout: { id: 'segmented' }, initial: 'balance' },
};
/** `segmented` past the option threshold degrades to the dropdown (a dev warning fires). */
export const SegmentedTooManyDegrades: Story = {
  args: { layout: { id: 'segmented' }, options: LONG },
};
export const DefaultNoLayout: Story = {};
