import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MentionText } from './MentionText';

// CLIENT-GL-50: a stored comment draws its tags as chips and never shows an id.

const ID = '123e4567-e89b-12d3-a456-426614174000';

describe('MentionText', () => {
  it('draws each tag as a chip with the stored name, announced as a mention, and hides the id', () => {
    const { container } = render(<MentionText text={`hi @[Priya Shah](${ID}) bye`} />);
    const chip = screen.getByRole('img', { name: 'Mention: Priya Shah' });
    expect(chip).toHaveTextContent('@Priya Shah');
    expect(container.textContent).toBe('hi @Priya Shah bye');
    expect(container.textContent).not.toContain(ID);
  });

  it('shows markup it cannot read as plain text', () => {
    const { container } = render(<MentionText text="@[Bao](broken and @Bao" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.textContent).toBe('@[Bao](broken and @Bao');
  });

  it('shows a plain comment as it is', () => {
    render(<MentionText text="Great session!" />);
    expect(screen.getByText('Great session!')).toBeInTheDocument();
  });
});
