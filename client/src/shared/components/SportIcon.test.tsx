import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SportIcon } from './SportIcon';

describe('SportIcon', () => {
  it('renders the real icon as a decorative image when iconUrl is set', () => {
    // Decorative image (alt="") has role "presentation", not "img" — query
    // by tag directly rather than getByRole (same convention GroupCoverBanner.test.tsx uses).
    const { container } = render(
      <SportIcon iconUrl="https://example.com/images/sports/badminton.png" className="size-4" />,
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/images/sports/badminton.png');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveClass('size-4');
  });

  it('falls back to a generic icon, not a crash, when iconUrl is null', () => {
    const { container } = render(<SportIcon iconUrl={null} className="size-4" />);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveClass('size-4');
  });
});
