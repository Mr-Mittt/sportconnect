import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfileHeaderPlaceholder } from './ProfileHeaderPlaceholder';

describe('ProfileHeaderPlaceholder', () => {
  it('shows the session name and initials, and none of the profile-only content', () => {
    render(<ProfileHeaderPlaceholder fullName="Jordan Lee" />);

    expect(screen.getByText('Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('JL')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
