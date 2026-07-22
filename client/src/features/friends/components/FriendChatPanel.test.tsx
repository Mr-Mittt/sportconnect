import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FriendChatPanel } from './FriendChatPanel';

describe('FriendChatPanel', () => {
  it('shows the not-saved disclaimer and an empty state', () => {
    render(<FriendChatPanel otherPersonFirstName="Priya" />);
    expect(screen.getByText(/messages here aren't saved/i)).toBeInTheDocument();
    expect(screen.getByText('No messages yet.')).toBeInTheDocument();
  });

  it('sends a message and renders it as an own bubble', async () => {
    const user = userEvent.setup();
    render(<FriendChatPanel otherPersonFirstName="Priya" />);

    const input = screen.getByLabelText('Message');
    await user.type(input, 'Pickup game Sunday, you in?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByText('Pickup game Sunday, you in?')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('disables Send while the draft is empty', () => {
    render(<FriendChatPanel otherPersonFirstName="Priya" />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
