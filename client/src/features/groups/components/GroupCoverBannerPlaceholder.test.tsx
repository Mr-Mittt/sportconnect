import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SportProfile } from '@/shared/types/sport';
import { GroupCoverBannerPlaceholder } from './GroupCoverBannerPlaceholder';

const sport: SportProfile = { key: 'football', label: 'Football', iconUrl: '/images/sports/football.png', colorRamp: 'teal' };

describe('GroupCoverBannerPlaceholder', () => {
  it('renders the loading line and no group name or member count', () => {
    render(<GroupCoverBannerPlaceholder sport={sport} onBack={() => {}} />);
    expect(screen.getByText('Loading group…')).toBeInTheDocument();
    expect(screen.queryByText(/members/)).not.toBeInTheDocument();
  });

  it('still renders when the sport is unresolved', () => {
    render(<GroupCoverBannerPlaceholder sport={undefined} onBack={() => {}} />);
    expect(screen.getByTestId('group-cover-banner-placeholder')).toBeInTheDocument();
  });

  it('calls onBack when "All groups" is clicked', async () => {
    const onBack = vi.fn();
    render(<GroupCoverBannerPlaceholder sport={sport} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'All groups' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
