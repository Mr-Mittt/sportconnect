import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GroupSearchResult } from '@/features/feed/types';
import { JoinGroupModal } from './JoinGroupModal';

function result(overrides: Partial<GroupSearchResult>): GroupSearchResult {
  return {
    id: 1,
    sportId: 5,
    groupName: 'Riverside Ballers',
    description: null,
    avatarUrl: null,
    memberCount: 12,
    createdByFullName: 'Priya Shah',
    isMember: false,
    ...overrides,
  };
}

const baseProps = {
  isOpen: true,
  onClose: () => {},
  inputValue: '',
  onInputChange: () => {},
  onSearch: () => {},
  results: [] as GroupSearchResult[],
  isSearching: false,
  isSearchError: false,
  pendingGroupIds: new Set<number>(),
  onRequestToJoin: () => {},
  isRequesting: false,
  isRequestError: false,
};

describe('JoinGroupModal', () => {
  it('calls onInputChange as the user types', async () => {
    const user = userEvent.setup();
    const onInputChange = vi.fn();
    render(<JoinGroupModal {...baseProps} onInputChange={onInputChange} />);

    await user.type(screen.getByLabelText('Search groups'), 'a');
    expect(onInputChange).toHaveBeenCalledWith('a');
  });

  it('calls onSearch when pressing Enter or clicking the Search button', async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<JoinGroupModal {...baseProps} onSearch={onSearch} />);

    await user.type(screen.getByLabelText('Search groups'), '{Enter}');
    expect(onSearch).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledTimes(2);
  });

  it('shows "Already a member" with no action for a joined group', () => {
    render(<JoinGroupModal {...baseProps} results={[result({ isMember: true })]} />);
    expect(screen.getByText('Already a member')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request to join' })).not.toBeInTheDocument();
  });

  it('shows "Pending" with no action for a group with a pending request', () => {
    render(
      <JoinGroupModal {...baseProps} results={[result({ id: 5 })]} pendingGroupIds={new Set([5])} />,
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request to join' })).not.toBeInTheDocument();
  });

  it('calls onRequestToJoin with the group name when clicking "Request to join"', async () => {
    const user = userEvent.setup();
    const onRequestToJoin = vi.fn();
    render(
      <JoinGroupModal
        {...baseProps}
        results={[result({ groupName: 'Riverside Ballers' })]}
        onRequestToJoin={onRequestToJoin}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Request to join' }));
    expect(onRequestToJoin).toHaveBeenCalledWith('Riverside Ballers');
  });

  it('shows a loading message while searching', () => {
    render(<JoinGroupModal {...baseProps} isSearching />);
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('shows an error message on search failure', () => {
    render(<JoinGroupModal {...baseProps} isSearchError />);
    expect(screen.getByText("Couldn't load groups.")).toBeInTheDocument();
  });

  it('shows an error message on request failure', () => {
    render(<JoinGroupModal {...baseProps} isRequestError />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send the request");
  });

  it('shows an empty state when the search has no results', () => {
    render(<JoinGroupModal {...baseProps} />);
    expect(screen.getByText('No groups found.')).toBeInTheDocument();
  });
});
