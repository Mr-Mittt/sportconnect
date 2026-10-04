import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useLocaleStore } from '@/app/localeStore';
import { ResourceUnavailable } from './ResourceUnavailable';

describe('ResourceUnavailable', () => {
  it.each([
    ['notFound', 'Page not found', "The page you're looking for doesn't exist.", 'Back to home'],
    ['forbidden', 'No access', "You don't have access to this.", 'Back to home'],
    ['unavailable', 'No longer available', 'This no longer exists or was removed.', 'Back to home'],
    ['error', "Couldn't load this", 'Something went wrong on our side. Try again.', 'Try again'],
    ['network', 'You seem to be offline', "Can't reach the server. Check your connection.", 'Try again'],
    ['crash', 'Something broke', 'An unexpected error stopped this page from showing.', 'Reload'],
  ] as const)('%s: title, body and action in English', (variant, title, body, action) => {
    render(<ResourceUnavailable variant={variant} onAction={() => undefined} />);

    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
  });

  it('renders in Vietnamese when the locale is vi', () => {
    useLocaleStore.getState().setLocale('vi');
    render(<ResourceUnavailable variant="forbidden" onAction={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeInTheDocument();
    expect(screen.getByText('Bạn không có quyền truy cập nội dung này.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Về trang chủ' })).toBeInTheDocument();
  });

  it('calls onAction when the action is pressed', async () => {
    const onAction = vi.fn();
    render(<ResourceUnavailable variant="error" onAction={onAction} />);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('renders no button when there is no action', () => {
    render(<ResourceUnavailable variant="unavailable" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lets the caller override the action label and heading level', () => {
    render(<ResourceUnavailable variant="error" headingAs="h1" actionLabel="Retry now" onAction={() => undefined} />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();
  });
});
