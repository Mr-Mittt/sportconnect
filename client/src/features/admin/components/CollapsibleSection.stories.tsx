import type { Meta, StoryObj } from '@storybook/react-vite';
import { CollapsibleSection } from './CollapsibleSection';

const meta = {
  title: 'Admin/CollapsibleSection',
  component: CollapsibleSection,
  args: {
    title: 'Session attributes',
    children: (
      <p className="text-2sm text-text-secondary">
        The section body — a form or a schema editor in the real detail panel. Stays mounted when
        collapsed so an in-progress edit is never lost.
      </p>
    ),
  },
  decorators: [
    (Story) => (
      <div className="max-w-md rounded-xl border-hairline border-border bg-surface-2 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CollapsibleSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Collapsed: Story = {
  args: { defaultOpen: false },
};

/** Two stacked sections — the shared top border between them is the visual divider in the
 * real detail panel. */
export const Stacked: Story = {
  render: (args) => (
    <>
      <CollapsibleSection title="Profile attributes">
        <p className="text-2sm text-text-secondary">Profile schema editor goes here.</p>
      </CollapsibleSection>
      <CollapsibleSection {...args} />
    </>
  ),
};
