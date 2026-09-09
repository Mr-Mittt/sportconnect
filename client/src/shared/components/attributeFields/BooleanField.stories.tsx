import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ResolvedAttributeLayout } from '@/shared/types/sport';
import { BooleanField } from './BooleanField';

/** SPORT-13: one story per `BOOLEAN` `layout.id`. */
function Demo({ layout }: { layout?: ResolvedAttributeLayout }) {
  const [value, setValue] = useState(false);
  return (
    <div className="max-w-sm">
      <BooleanField fieldId="b" label="Competitive" value={value} onChange={(v) => setValue(v as boolean)} layout={layout} />
    </div>
  );
}

const meta = {
  title: 'AttributeFields/BooleanField',
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Switch: Story = { args: { layout: { id: 'switch' } } };
export const Checkbox: Story = { args: { layout: { id: 'checkbox' } } };
export const Segmented: Story = { args: { layout: { id: 'segmented' } } };
export const DefaultNoLayout: Story = {};
