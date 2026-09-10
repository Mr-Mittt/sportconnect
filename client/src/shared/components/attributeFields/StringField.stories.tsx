import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ResolvedAttributeLayout } from '@/shared/types/sport';
import { StringField } from './StringField';

/** SPORT-13: one story per `STRING` `layout.id`, plus `format` on `readonly-text`. */
function Demo({ layout, initial = 'Yonex Astrox 99' }: { layout?: ResolvedAttributeLayout; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="max-w-sm">
      <StringField fieldId="s" label="Racket model" value={value} onChange={(v) => setValue(v as string)} layout={layout} />
    </div>
  );
}

const meta = {
  title: 'AttributeFields/StringField',
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Input: Story = { args: { layout: { id: 'input' } } };
export const Textarea: Story = { args: { layout: { id: 'textarea' } } };
export const ReadonlyText: Story = { args: { layout: { id: 'readonly-text' } } };
export const ReadonlyTextUppercase: Story = {
  args: { layout: { id: 'readonly-text', format: { en: 'uppercase' } } },
};
export const ReadonlyTextTitlecase: Story = {
  args: { layout: { id: 'readonly-text', format: { en: 'titlecase' } }, initial: 'li-ning axforce 90' },
};
/** No `layout` — the default, must match pre-SPORT-13 output. */
export const DefaultNoLayout: Story = {};
