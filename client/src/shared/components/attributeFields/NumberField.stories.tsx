import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ResolvedAttributeLayout } from '@/shared/types/sport';
import { NumberField } from './NumberField';

/** SPORT-13: one story per `NUMBER` `layout.id`, plus `format` preview. */
function Demo({
  layout,
  bounds = true,
  initial = 24,
}: {
  layout?: ResolvedAttributeLayout;
  bounds?: boolean;
  initial?: number;
}) {
  const [value, setValue] = useState<number | undefined>(initial);
  return (
    <div className="max-w-sm">
      <NumberField
        attribute={bounds ? { min: 15, max: 35 } : { min: null, max: null }}
        fieldId="n"
        label="String tension (lbs)"
        value={value}
        onChange={(v) => setValue(v as number | undefined)}
        layout={layout}
      />
    </div>
  );
}

const meta = {
  title: 'AttributeFields/NumberField',
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Input: Story = { args: { layout: { id: 'input' } } };
export const InputWithFormatPreview: Story = {
  args: { layout: { id: 'input', format: { en: '0.0 lbs' } } },
};
export const Stepper: Story = { args: { layout: { id: 'stepper' } } };
export const Slider: Story = { args: { layout: { id: 'slider' } } };
/** `slider` needs bounds — without them it degrades to the number input (a dev warning fires). */
export const SliderNoBoundsDegrades: Story = { args: { layout: { id: 'slider' }, bounds: false } };
export const ReadonlyTextGrouped: Story = {
  args: { layout: { id: 'readonly-text', format: { en: '#,##0' } }, initial: 1234 },
};
export const ReadonlyTextPercent: Story = {
  args: { layout: { id: 'readonly-text', format: { en: '0%' } }, initial: 0.42 },
};
export const DefaultNoLayout: Story = {};
