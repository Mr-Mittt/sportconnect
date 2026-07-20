import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GroupChatTab } from './GroupChatTab';

describe('GroupChatTab', () => {
  it('shows the not-saved disclaimer and an empty state', () => {
    render(<GroupChatTab currentUserFirstName="Ben" />);
    expect(screen.getByText(/messages here aren't saved/i)).toBeInTheDocument();
    expect(screen.getByText('No messages yet.')).toBeInTheDocument();
  });

  it('sends a message and renders it as an own bubble', async () => {
    const user = userEvent.setup();
    render(<GroupChatTab currentUserFirstName="Ben" />);

    const input = screen.getByLabelText('Message the group');
    await user.type(input, 'Hey team, ready for Sunday?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByText('Hey team, ready for Sunday?')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('disables Send while the draft is empty', () => {
    render(<GroupChatTab currentUserFirstName="Ben" />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
