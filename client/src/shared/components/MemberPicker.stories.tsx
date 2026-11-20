import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemberPicker } from './MemberPicker';

const meta = {
  title: 'Shared/MemberPicker',
  component: MemberPicker,
  args: {
    idPrefix: 'story',
    selected: [],
    results: [],
    query: '',
    onQueryChange: () => {},
    isSearching: false,
    isSearchError: false,
    onSelect: () => {},
    onRemove: () => {},
  },
} satisfies Meta<typeof MemberPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const WithResults: Story = {
  args: {
    query: 'li',
    results: [
      { id: '1', name: 'Linh Tran', avatarUrl: null },
      { id: '2', name: 'Lien Pham', avatarUrl: null },
    ],
  },
};

export const WithPicks: Story = {
  args: {
    selected: [
      { id: '1', name: 'Linh Tran', avatarUrl: null },
      { id: '3', name: 'Minh Le', avatarUrl: null },
    ],
    query: 'an',
    results: [{ id: '4', name: 'An Nguyen', avatarUrl: null }],
  },
};

export const NoResults: Story = { args: { query: 'zz' } };
export const Searching: Story = { args: { query: 'zz', isSearching: true } };
export const SearchFailed: Story = { args: { query: 'zz', isSearchError: true } };
