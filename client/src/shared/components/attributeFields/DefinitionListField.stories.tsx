import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import type {
  ResolvedAttributeLayout,
  ResolvedSportAttributeDefinitionType,
} from '@/shared/types/sport';
import { DefinitionListField } from './DefinitionListField';

const RACKET: ResolvedSportAttributeDefinitionType = {
  name: 'Racket',
  fields: [
    { key: 'value', label: 'Model', type: 'STRING', isRequired: true },
    { key: 'gramWeight', label: 'Weight (g)', type: 'NUMBER', isRequired: false, min: 0, max: 500 },
    { key: 'inStock', label: 'In bag', type: 'BOOLEAN', isRequired: false },
  ],
};

/** SPORT-14: one story per `DEFINITION_LIST` `layout.id`, plus a heading-`icon` variant. */
function Demo({ layout }: { layout?: ResolvedAttributeLayout }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([
    { value: 'Yonex Astrox 99 Pro', gramWeight: 90, inStock: true },
    { value: 'Li-Ning Axforce 90', gramWeight: 88, inStock: false },
  ]);
  return (
    <div className="max-w-md">
      <DefinitionListField
        label="Rackets"
        definitionType={RACKET}
        rows={rows}
        onChange={setRows}
        definitionsByName={new Map([['Racket', RACKET]])}
        layout={layout}
      />
    </div>
  );
}

const meta = {
  title: 'AttributeFields/DefinitionListField',
  component: Demo,
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Cards: Story = { args: { layout: { id: 'cards' } } };
export const Table: Story = { args: { layout: { id: 'table' } } };
export const Accordion: Story = { args: { layout: { id: 'accordion' } } };
export const WithHeadingIcon: Story = { args: { layout: { id: 'cards', icon: 'racket' } } };
/** No `layout` — the default, byte-identical to pre-SPORT-14 (`cards`). */
export const DefaultNoLayout: Story = {};

/** CLIENT-SESSION-19: "Add" opens the shared `AddDefinitionRecordModal` instead of appending a
 * blank row inline — same `play`-driven pattern as `TopBar.stories.tsx`'s open-dropdown state. */
export const AddModalOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
  },
};
