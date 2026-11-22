import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ImportCandidate } from '../types';
import { UnresolvedNamesPanel } from './UnresolvedNamesPanel';

const members: ImportCandidate[] = [
  { userId: 'u-anh-a', fullName: 'Ánh Nguyễn' },
  { userId: 'u-anh-b', fullName: 'Ánh Vãng Lai' },
  { userId: 'u-bao', fullName: 'Bảo Nguyễn' },
  { userId: 'u-hieu', fullName: 'Hiếu Nguyễn' },
];

const meta = {
  title: 'Admin/Import/UnresolvedNamesPanel',
  component: UnresolvedNamesPanel,
  args: {
    members,
    aliases: {},
    onChoose: () => {},
    unresolved: [
      { name: 'Ánh', candidates: [members[0], members[1]] },
      { name: 'Anh_VL', candidates: [] },
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-[420px] p-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UnresolvedNamesPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two names to settle: one shared by two members (they come first), one nobody has. */
export const TwoNames: Story = {};

/** A single name, with a member already chosen. */
export const OneNameChosen: Story = {
  args: { unresolved: [{ name: 'Anh_VL', candidates: [] }], aliases: { Anh_VL: 'u-anh-b' } },
};
