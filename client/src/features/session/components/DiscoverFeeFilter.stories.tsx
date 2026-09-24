import type { Meta, StoryObj } from '@storybook/react-vite';
import { DiscoverFeeFilter } from './DiscoverFeeFilter';

const meta = {
  title: 'Session/DiscoverFeeFilter',
  component: DiscoverFeeFilter,
  args: {
    onToggleFeeType: () => {},
    onMaxFeeAmountVndChange: () => {},
    onClear: () => {},
  },
} satisfies Meta<typeof DiscoverFeeFilter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unset: Story = {
  args: { feeType: undefined, maxFeeAmountVndText: '' },
};

export const FreeSelected: Story = {
  args: { feeType: 'FREE', maxFeeAmountVndText: '' },
};

export const FixedWithMaxAmount: Story = {
  args: { feeType: 'FIXED', maxFeeAmountVndText: '50000' },
};
