import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemberPicker, type PickerMember } from './MemberPicker';

const linh: PickerMember = { id: 'm-1', name: 'Linh Tran', avatarUrl: null };
const minh: PickerMember = { id: 'm-2', name: 'Minh Le', avatarUrl: null };

type Props = ComponentProps<typeof MemberPicker>;

function renderPicker(overrides: Partial<Props> = {}) {
  const props: Props = {
    idPrefix: 'p',
    selected: [],
    results: [linh, minh],
    query: 'li',
    onQueryChange: vi.fn(),
    isSearching: false,
    isSearchError: false,
    onSelect: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  render(<MemberPicker {...props} />);
  return props;
}

describe('MemberPicker (CLIENT-GROUP-SESSION-1)', () => {
  it('lists what the search found and reports a pick, then clears the search box', async () => {
    const props = renderPicker();
    await userEvent.click(screen.getByRole('button', { name: /Linh Tran/ }));
    expect(props.onSelect).toHaveBeenCalledWith(linh);
    expect(props.onQueryChange).toHaveBeenCalledWith('');
  });

  it('shows removable badges for the people picked, with no limit', async () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ id: `x-${index}`, name: `Member ${index}`, avatarUrl: null }));
    const props = renderPicker({ selected: many });
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Member 3' }));
    expect(props.onRemove).toHaveBeenCalledWith('x-3');
  });

  it('forwards what is typed', async () => {
    const props = renderPicker({ query: '' });
    await userEvent.type(screen.getByRole('textbox', { name: 'Search members' }), 'a');
    expect(props.onQueryChange).toHaveBeenCalledWith('a');
  });

  it('shows nothing under the box until something is typed', () => {
    renderPicker({ query: '   ', results: [] });
    expect(screen.queryByText('No members found.')).not.toBeInTheDocument();
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  });

  it('says so when nobody matches, while searching, and when the search failed', () => {
    const { unmount } = render(
      <MemberPicker idPrefix="p" selected={[]} results={[]} query="zz" onQueryChange={() => {}} isSearching={false} isSearchError={false} onSelect={() => {}} onRemove={() => {}} />,
    );
    expect(screen.getByText('No members found.')).toBeInTheDocument();
    unmount();

    const searching = render(
      <MemberPicker idPrefix="p" selected={[]} results={[]} query="zz" onQueryChange={() => {}} isSearching isSearchError={false} onSelect={() => {}} onRemove={() => {}} />,
    );
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    searching.unmount();

    render(
      <MemberPicker idPrefix="p" selected={[]} results={[]} query="zz" onQueryChange={() => {}} isSearching={false} isSearchError onSelect={() => {}} onRemove={() => {}} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't search members. Try again.");
  });

  it('keeps the previous list visible while the next search is still loading', () => {
    renderPicker({ isSearching: true });
    expect(screen.getByRole('button', { name: /Linh Tran/ })).toBeInTheDocument();
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  });
});
