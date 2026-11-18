import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SessionVisibilitySwitch, SessionVisibilityWarning } from './SessionVisibility';

/** CLIENT-SESSION-52: the public / private switch with its one-line hint, and the warning shown while it is off. */
const meta = {
  title: 'Session/SessionVisibility',
  component: SessionVisibilitySwitch,
  args: { id: 'visibility', isPublic: true, onChange: () => {} },
} satisfies Meta<typeof SessionVisibilitySwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** On (the default): everyone can see the session and ask to join. */
export const Public: Story = {};

/** Off: only the host and the invited friends. */
export const Private: Story = {
  args: { isPublic: false },
};

/** The warning that goes with the off state (the create form shows it across its footer). */
export const Warning: StoryObj<typeof SessionVisibilityWarning> = {
  render: () => <SessionVisibilityWarning />,
};

function InteractiveVisibility() {
  const [isPublic, setIsPublic] = useState(true);
  return (
    <div className="flex w-96 flex-col gap-2">
      {!isPublic && <SessionVisibilityWarning />}
      <SessionVisibilitySwitch id="interactive" isPublic={isPublic} onChange={setIsPublic} />
    </div>
  );
}

/** Interactive: the hint and the warning follow the switch. */
export const Interactive: Story = {
  render: () => <InteractiveVisibility />,
};
