import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SectionEditActions, SectionSummary, SessionFormSection } from './SessionFormSection';

const meta = {
  title: 'Session/SessionFormSection',
  component: SessionFormSection,
  args: { title: 'Where', open: true, onOpenChange: () => {}, children: <p className="text-2sm">Section fields go here.</p> },
  decorators: [
    (Story) => (
      <div className="w-[34rem] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SessionFormSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The create form's section: open, no actions. */
export const Open: Story = {};

export const WithMissingChip: Story = {
  args: { title: 'Cost', missing: ['fee'] },
};

/** The detail modal's collapsed section: a `field: value` row, "..." for a missing value, Edit in the header. */
export const CollapsedWithSummaryAndEdit: Story = {
  args: {
    open: false,
    missing: ['location'],
    summary: (
      <SectionSummary
        items={[
          { label: 'Location', value: null },
          { label: 'Note', value: 'Court 3' },
        ]}
      />
    ),
    actions: (
      <SectionEditActions
        mode="view"
        canEdit
        editDisabled={false}
        isSaving={false}
        canSave
        onEdit={() => {}}
        onSave={() => {}}
        onDiscard={() => {}}
      />
    ),
  },
};

/** Another section is being edited: Edit is shown disabled. */
export const EditDisabled: Story = {
  args: {
    open: false,
    summary: <SectionSummary items={[{ label: 'Fee', value: 'Free' }]} />,
    actions: (
      <SectionEditActions
        mode="view"
        canEdit
        editDisabled
        isSaving={false}
        canSave
        onEdit={() => {}}
        onSave={() => {}}
        onDiscard={() => {}}
      />
    ),
  },
};

/** Editing: Discard and Save replace Edit in the header (icon-only below the small breakpoint). */
export const Editing: Story = {
  args: {
    isEditing: true,
    actions: (
      <SectionEditActions
        mode="edit"
        canEdit
        editDisabled={false}
        isSaving={false}
        canSave
        onEdit={() => {}}
        onSave={() => {}}
        onDiscard={() => {}}
      />
    ),
  },
};

export const EditingSaving: Story = {
  args: {
    isEditing: true,
    actions: (
      <SectionEditActions
        mode="edit"
        canEdit
        editDisabled={false}
        isSaving
        canSave
        onEdit={() => {}}
        onSave={() => {}}
        onDiscard={() => {}}
      />
    ),
  },
};

function InteractiveSection({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <SessionFormSection
      title={title}
      open={open}
      onOpenChange={setOpen}
      summary={<SectionSummary items={[{ label: 'Fee', value: 'Free' }]} />}
    >
      <p className="text-2sm">Section fields go here.</p>
    </SessionFormSection>
  );
}

export const Interactive: Story = {
  render: (args) => <InteractiveSection title={args.title} />,
};
