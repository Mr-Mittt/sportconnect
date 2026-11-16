import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MAX_POST_LENGTH } from '@/features/feed/types';
import { CreatePostForm } from './CreatePostForm';
import type { MentionSource } from './MentionInput';

const currentUser = { firstName: 'Jordan', fullName: 'Jordan Lee', avatarUrl: null };
const noop = () => {};
const baseProps = {
  currentUser,
  onSubmit: noop,
  isSubmitting: false,
  onPhotoClick: noop,
  onLocationClick: noop,
  onTagSportClick: noop,
};

/**
 * `useUnsavedChangesGuard`'s `useBlocker` (PROFILE-10) requires a data router — same two-route
 * memory-router shape `useSettingsUnsavedGuard.test.tsx` (`features/groups/`) established. Returns
 * the router too, so tests that exercise the in-app-navigation leg can drive it directly.
 */
function renderForm(ui: React.ReactElement) {
  const router = createMemoryRouter(
    [
      { path: '/a', element: ui },
      { path: '/b', element: <div>Elsewhere</div> },
    ],
    { initialEntries: ['/a'] },
  );
  const result = render(<RouterProvider router={router} />);
  return { ...result, router };
}

describe('CreatePostForm', () => {
  it('"Keep editing" after the leave question puts the caret back in the post box (owner, 2026-11-16)', async () => {
    const user = userEvent.setup();
    const { router } = renderForm(<CreatePostForm {...baseProps} />);
    await user.type(screen.getByRole('textbox', { name: 'Create a post' }), 'half');
    await act(async () => router.navigate('/b'));
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Create a post' })).toHaveFocus());
    expect(router.state.location.pathname).toBe('/a');
  });

  it('keeps the plain look it had before tagging: one row, no border, no tinted background (owner, 2026-11-16)', () => {
    renderForm(<CreatePostForm {...baseProps} />);
    const box = screen.getByRole('textbox', { name: 'Create a post' });
    expect(box).toHaveClass('min-h-9', 'bg-transparent');
    expect(box).not.toHaveClass('min-h-20', 'bg-surface-1', 'border-hairline');
  });

  it("shows the current user's first name in the placeholder", () => {
    renderForm(<CreatePostForm {...baseProps} />);
    expect(screen.getByRole('textbox', { name: 'Create a post' })).toHaveAttribute(
      'data-placeholder',
      "What's on your mind, Jordan?",
    );
  });

  it('falls back to a name-less placeholder when currentUser is undefined', () => {
    renderForm(<CreatePostForm {...baseProps} currentUser={undefined} />);
    expect(screen.getByRole('textbox', { name: 'Create a post' })).toHaveAttribute(
      'data-placeholder',
      "What's on your mind?",
    );
  });

  it('disables Post until there is text, then enables it', async () => {
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} />);
    const postButton = screen.getByRole('button', { name: 'Post' });
    expect(postButton).toBeDisabled();

    await user.type(screen.getByLabelText('Create a post'), 'Great match today!');
    expect(postButton).toBeEnabled();
  });

  it('does not enable Post for whitespace-only input', async () => {
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} />);
    await user.type(screen.getByLabelText('Create a post'), '   ');
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  it('calls onSubmit with trimmed content, asBroadcast false, and clears the box', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} onSubmit={onSubmit} />);

    const box = screen.getByRole('textbox', { name: 'Create a post' });
    await user.type(box, '  Great match today!  ');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    expect(onSubmit).toHaveBeenCalledWith('Great match today!', { asBroadcast: false });
    expect(box).toHaveTextContent('');
  });

  it('disables Post while a submission is in flight', () => {
    renderForm(<CreatePostForm {...baseProps} isSubmitting />);
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  it('refuses typing past MAX_POST_LENGTH and shows the counter near it', async () => {
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} />);
    const box = screen.getByRole('textbox', { name: 'Create a post' });
    await user.click(box);
    await user.paste('a'.repeat(MAX_POST_LENGTH - 1));
    await user.keyboard('bc');
    expect(box.textContent).toHaveLength(MAX_POST_LENGTH);
    expect(screen.getByText(`${MAX_POST_LENGTH} / ${MAX_POST_LENGTH}`)).toBeInTheDocument();
  });

  it('Enter adds a line and never sends; the Post button sends the text with its line break', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox', { name: 'Create a post' });
    await user.type(box, 'first');
    await user.keyboard('{Enter}');
    await user.keyboard('second');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onSubmit).toHaveBeenCalledWith('first\nsecond', { asBroadcast: false });
  });

  it('keeps the line breaks of a pasted text', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('textbox', { name: 'Create a post' }));
    await user.paste('one\ntwo');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onSubmit).toHaveBeenCalledWith('one\ntwo', { asBroadcast: false });
  });

  it('a line break alone is not a post', async () => {
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} />);
    await user.type(screen.getByRole('textbox', { name: 'Create a post' }), '{Enter}{Enter}');
    expect(screen.getByRole('button', { name: 'Post' })).toBeDisabled();
  });

  it('reports the inert Photo/Location/Tag sport affordances as clicks, not omitted', async () => {
    const onPhotoClick = vi.fn();
    const onLocationClick = vi.fn();
    const onTagSportClick = vi.fn();
    const user = userEvent.setup();
    renderForm(
      <CreatePostForm
        {...baseProps}
        onPhotoClick={onPhotoClick}
        onLocationClick={onLocationClick}
        onTagSportClick={onTagSportClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Photo/ }));
    await user.click(screen.getByRole('button', { name: /Location/ }));
    await user.click(screen.getByRole('button', { name: /Tag sport/ }));

    expect(onPhotoClick).toHaveBeenCalledTimes(1);
    expect(onLocationClick).toHaveBeenCalledTimes(1);
    expect(onTagSportClick).toHaveBeenCalledTimes(1);
  });

  it('does not render the Broadcast toggle when canBroadcast is false (default)', () => {
    renderForm(<CreatePostForm {...baseProps} />);
    expect(screen.queryByRole('button', { name: /Broadcast/ })).not.toBeInTheDocument();
  });

  it('toggling Broadcast on reports asBroadcast: true on submit, then resets', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} onSubmit={onSubmit} canBroadcast />);

    const broadcastToggle = screen.getByRole('button', { name: /Broadcast/ });
    expect(broadcastToggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(broadcastToggle);
    expect(broadcastToggle).toHaveAttribute('aria-pressed', 'true');

    await user.type(screen.getByLabelText('Create a post'), 'Court booking confirmed!');
    await user.click(screen.getByRole('button', { name: 'Post' }));

    expect(onSubmit).toHaveBeenCalledWith('Court booking confirmed!', { asBroadcast: true });
    expect(broadcastToggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('hides the error message by default', () => {
    renderForm(<CreatePostForm {...baseProps} />);
    expect(screen.queryByText("Couldn't create post. Try again.")).not.toBeInTheDocument();
  });

  it('shows an error message when isError is true', () => {
    renderForm(<CreatePostForm {...baseProps} isError />);
    expect(screen.getByText("Couldn't create post. Try again.")).toBeInTheDocument();
  });

  it('shows the code-specific errorText instead of the generic line (CLIENT-ERR-6)', () => {
    renderForm(<CreatePostForm {...baseProps} isError errorText="Join this group to post here." />);
    expect(screen.getByText('Join this group to post here.')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't create post. Try again.")).not.toBeInTheDocument();
  });

  describe('unsaved-changes guard (PROFILE-10)', () => {
    it('blocks in-app navigation while there is unsubmitted text, and Leave lets it through', async () => {
      const user = userEvent.setup();
      const { router } = renderForm(<CreatePostForm {...baseProps} />);
      await user.type(screen.getByLabelText('Create a post'), 'Great match today!');

      router.navigate('/b');

      const dialog = await screen.findByRole('dialog', { name: 'Leave without posting?' });
      expect(router.state.location.pathname).toBe('/a');

      await user.click(within(dialog).getByRole('button', { name: 'Leave' }));
      await waitFor(() => expect(router.state.location.pathname).toBe('/b'));
    });

    it('Keep editing cancels the blocked navigation and preserves the text', async () => {
      const user = userEvent.setup();
      const { router } = renderForm(<CreatePostForm {...baseProps} />);
      await user.type(screen.getByLabelText('Create a post'), 'Great match today!');

      router.navigate('/b');
      const dialog = await screen.findByRole('dialog', { name: 'Leave without posting?' });
      await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }));

      expect(router.state.location.pathname).toBe('/a');
      expect(screen.getByRole('textbox', { name: 'Create a post' })).toHaveTextContent('Great match today!');
    });

    it('does not block navigation when the composer is empty', async () => {
      const { router } = renderForm(<CreatePostForm {...baseProps} />);

      router.navigate('/b');

      await waitFor(() => expect(router.state.location.pathname).toBe('/b'));
      expect(screen.queryByRole('dialog', { name: 'Leave without posting?' })).not.toBeInTheDocument();
    });
  });
});

describe('CreatePostForm tagging (CLIENT-GL-50 part 2)', () => {
  const PRIYA = '123e4567-e89b-12d3-a456-426614174000';
  const source = (): MentionSource => ({
    options: [{ id: PRIYA, name: 'Priya Shah', label: 'Priya Shah', avatarUrl: null }],
    onQueryChange: vi.fn(),
  });

  it('offers the source people for an @ word, tells the source what was typed, and sends the tag as markup', async () => {
    const onSubmit = vi.fn();
    const mentionSource = source();
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} onSubmit={onSubmit} mentionSource={mentionSource} />);
    const box = screen.getByRole('textbox', { name: 'Create a post' });
    await user.type(box, 'see @Pr');
    expect(mentionSource.onQueryChange).toHaveBeenLastCalledWith('Pr');
    const list = screen.getByRole('listbox', { name: 'People you can tag' });
    await user.click(within(list).getByRole('option', { name: /Priya Shah/ }));
    expect(screen.getByRole('img', { name: 'Mention: Priya Shah' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onSubmit).toHaveBeenCalledWith(`see @[Priya Shah](${PRIYA})`, { asBroadcast: false });
  });

  it('Enter while the @ list is open picks the person and adds no line', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} onSubmit={onSubmit} mentionSource={source()} />);
    await user.type(screen.getByRole('textbox', { name: 'Create a post' }), '@Pr');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('img', { name: 'Mention: Priya Shah' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onSubmit).toHaveBeenCalledWith(`@[Priya Shah](${PRIYA})`, { asBroadcast: false });
  });

  it('does not offer a person already tagged in the post', async () => {
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} mentionSource={source()} />);
    const box = screen.getByRole('textbox', { name: 'Create a post' });
    await user.type(box, '@Pr');
    await user.keyboard('{Enter}');
    await user.type(box, '@Pr');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('without a source nobody is offered and the text is sent as typed', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    renderForm(<CreatePostForm {...baseProps} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: 'Create a post' }), 'hi @Pr');
    expect(screen.queryByRole('listbox')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(onSubmit).toHaveBeenCalledWith('hi @Pr', { asBroadcast: false });
  });
});
