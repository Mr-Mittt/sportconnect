import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionStatusFilter } from './SessionStatusFilter';
import { GroupSessionsSection } from './GroupSessionsSection';

const filter = (
  <SessionStatusFilter
    sectionLabel="Other sessions"
    options={['PREPARING', 'SCHEDULED', 'CANCELLED']}
    selected={['PREPARING', 'SCHEDULED']}
    onChange={() => {}}
  />
);

const meta = {
  title: 'Groups/GroupSessionsSection',
  component: GroupSessionsSection,
  args: {
    title: 'Other sessions',
    defaultOpen: true,
    filter,
    children: <p className="text-2sm text-text-muted">The section body: cards, a hint or the history dates.</p>,
  },
} satisfies Meta<typeof GroupSessionsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
export const Collapsed: Story = { args: { defaultOpen: false } };
