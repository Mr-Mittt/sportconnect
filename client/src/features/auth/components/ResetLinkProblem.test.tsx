import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ResetLinkProblem } from './ResetLinkProblem';

describe('ResetLinkProblem', () => {
  it.each([
    ['RESET_TOKEN_INVALID', 'This reset link isn’t valid, or it has already been used or has expired.'],
    ['RESET_TOKEN_USED', 'This reset link has already been used.'],
    ['RESET_TOKEN_EXPIRED', 'This reset link has expired.'],
  ])('shows the copy for %s and a way to request a new link', (code, copy) => {
    render(
      <MemoryRouter>
        <ResetLinkProblem errorCode={code} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(copy);
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });
});
