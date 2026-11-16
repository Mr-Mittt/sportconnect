import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PostText } from './PostText';

// CLIENT-GL-50 part 2: a post or comment body with chips and clickable hashtags together.

const ID = '123e4567-e89b-12d3-a456-426614174000';

describe('PostText', () => {
  it('draws a tag as a chip with the stored name and never shows the id or the markup', () => {
    const { container } = render(<PostText text={`Great game @[Priya Shah](${ID}) today`} onHashtagClick={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'Mention: Priya Shah' })).toHaveTextContent('@Priya Shah');
    expect(container).not.toHaveTextContent(ID);
    expect(container).not.toHaveTextContent('@[');
    expect(container).toHaveTextContent('Great game @Priya Shah today');
  });

  it('keeps hashtags clickable next to a chip, and reports the tag with its #', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    render(<PostText text={`#derby with @[Priya Shah](${ID}) #badminton`} onHashtagClick={onHashtagClick} />);
    await user.click(screen.getByRole('button', { name: '#badminton' }));
    await user.click(screen.getByRole('button', { name: '#derby' }));
    expect(onHashtagClick).toHaveBeenNthCalledWith(1, '#badminton');
    expect(onHashtagClick).toHaveBeenNthCalledWith(2, '#derby');
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('renders text with no tag as the hashtag text did, in one paragraph', () => {
    const { container } = render(<PostText text="Plain #text only" onHashtagClick={vi.fn()} className="text-sm" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p')).toHaveClass('text-sm');
    expect(screen.getByRole('button', { name: '#text' })).toBeInTheDocument();
  });

  it('shows the line breaks of the text', () => {
    const { container } = render(<PostText text={'first line\nsecond line'} onHashtagClick={vi.fn()} />);
    expect(container.querySelector('p')).toHaveClass('whitespace-pre-line');
    expect(container.querySelector('p')?.textContent).toBe('first line\nsecond line');
  });

  it('leaves markup that cannot be read as plain text', () => {
    const { container } = render(<PostText text="broken @[No id] here" onHashtagClick={vi.fn()} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(container).toHaveTextContent('broken @[No id] here');
  });
});
