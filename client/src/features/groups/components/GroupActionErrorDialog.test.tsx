import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import { GroupActionErrorDialog } from './GroupActionErrorDialog';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('GroupActionErrorDialog', () => {
  it('renders nothing while there is no message', () => {
    render(<GroupActionErrorDialog message={null} onDismiss={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the message and dismisses on "Got it"', async () => {
    const onDismiss = vi.fn();
    render(<GroupActionErrorDialog message="This invitation has already been handled." onDismiss={onDismiss} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This invitation has already been handled.');
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders Vietnamese chrome when the locale is vi', async () => {
    await i18n.changeLanguage('vi');
    render(<GroupActionErrorDialog message="Lời mời này đã được xử lý." onDismiss={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Đã hiểu' })).toBeInTheDocument();
  });
});
