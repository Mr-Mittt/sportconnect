import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { GameMoodSlider } from './GameMoodSlider';

const meta = {
  title: 'Session/GameMoodSlider',
  component: GameMoodSlider,
  args: { value: 5, onChange: () => {} },
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GameMoodSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The untouched default: 5 · Normal. */
export const Default: Story = {};

export const ForFun: Story = { args: { value: 1 } };

export const Competitive: Story = { args: { value: 10 } };

function InteractiveSlider({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  return <GameMoodSlider value={value} onChange={setValue} />;
}

/** Controlled, so dragging shows the number and level word change. */
export const Interactive: Story = {
  render: (args) => <InteractiveSlider initial={args.value} />,
};
