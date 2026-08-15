import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GroupSearchResult } from '@/features/feed/types';
import type { GroupedSearchResults } from '@/features/groups/useJoinGroupModalData';
import type { SportKey, SportProfile } from '@/shared/types/sport';
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

const football: SportProfile = { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' };
const tennis: SportProfile = { key: 'tennis', label: 'Tennis', iconUrl: '/images/sports/tennis.png', colorRamp: 'purple' };

function grouped(sportProfile: SportProfile, results: GroupSearchResult[]): GroupedSearchResults {
  return { sportKey: sportProfile.key, sportProfile, results };
}

const baseProps = {
  isOpen: true,
  onClose: () => {},
  inputValue: '',
  onInputChange: () => {},
  onSearch: () => {},
  sportProfiles: [football, tennis],
  selectedSports: new Set<SportKey>(['football', 'tennis']),
  onToggleSport: () => {},
  groupedResults: [] as GroupedSearchResults[],
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

  it('renders a pill per sport profile and reflects selection via aria-pressed', () => {
    render(<JoinGroupModal {...baseProps} selectedSports={new Set(['football'])} />);
    expect(screen.getByRole('button', { name: 'Football' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tennis' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onToggleSport with the clicked sport\'s key', async () => {
    const user = userEvent.setup();
    const onToggleSport = vi.fn();
    render(<JoinGroupModal {...baseProps} onToggleSport={onToggleSport} />);

    await user.click(screen.getByRole('button', { name: 'Tennis' }));
    expect(onToggleSport).toHaveBeenCalledWith('tennis');
  });

  it('renders results grouped into sections by sport', () => {
    render(
      <JoinGroupModal
        {...baseProps}
        groupedResults={[
          grouped(football, [result({ id: 1, groupName: 'Riverside Ballers' })]),
          grouped(tennis, [result({ id: 2, sportId: 2, groupName: 'Ace Club' })]),
        ]}
      />,
    );
    // "Football"/"Tennis" each appear twice: once as a filter pill label, once as a section header.
    expect(screen.getAllByText('Football')).toHaveLength(2);
    expect(screen.getByText('Riverside Ballers')).toBeInTheDocument();
    expect(screen.getAllByText('Tennis')).toHaveLength(2);
    expect(screen.getByText('Ace Club')).toBeInTheDocument();
  });

  it('shows "Already a member" with no action for a joined group', () => {
    render(
      <JoinGroupModal
        {...baseProps}
        groupedResults={[grouped(football, [result({ isMember: true })])]}
      />,
    );
    expect(screen.getByText('Already a member')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request to join' })).not.toBeInTheDocument();
  });

  it('shows "Pending" with no action for a group with a pending request', () => {
    render(
      <JoinGroupModal
        {...baseProps}
        groupedResults={[grouped(football, [result({ id: 5 })])]}
        pendingGroupIds={new Set([5])}
      />,
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
        groupedResults={[grouped(football, [result({ groupName: 'Riverside Ballers' })])]}
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

  it('shows an empty state when there are no grouped results (no matches, or zero sports selected)', () => {
    render(<JoinGroupModal {...baseProps} selectedSports={new Set()} groupedResults={[]} />);
    expect(screen.getByText('No groups found.')).toBeInTheDocument();
  });
});
