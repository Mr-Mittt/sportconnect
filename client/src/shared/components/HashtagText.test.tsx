import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HashtagText } from './HashtagText';

describe('HashtagText', () => {
  it('renders plain text unchanged when there are no hashtags', () => {
    render(<HashtagText text="Great match today!" onHashtagClick={vi.fn()} />);
    expect(screen.getByText('Great match today!')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders a hashtag occurrence as a clickable button, reporting the tag with #', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    render(<HashtagText text="Great match today! #fridayrun" onHashtagClick={onHashtagClick} />);

    const tag = screen.getByRole('button', { name: '#fridayrun' });
    expect(tag).toBeInTheDocument();
    await user.click(tag);
    expect(onHashtagClick).toHaveBeenCalledWith('#fridayrun');
  });

  it('renders multiple distinct hashtags, each independently clickable', async () => {
    const user = userEvent.setup();
    const onHashtagClick = vi.fn();
    render(
      <HashtagText
        text="Great #fridayrun session, see you at #pickup next week"
        onHashtagClick={onHashtagClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: '#fridayrun' }));
    await user.click(screen.getByRole('button', { name: '#pickup' }));
    expect(onHashtagClick).toHaveBeenNthCalledWith(1, '#fridayrun');
    expect(onHashtagClick).toHaveBeenNthCalledWith(2, '#pickup');
  });

  it('keeps the surrounding text intact around a hashtag', () => {
    const { container } = render(
      <HashtagText text="Who's in for Friday? #fridayrun see you there" onHashtagClick={vi.fn()} />,
    );
    expect(container).toHaveTextContent("Who's in for Friday? #fridayrun see you there");
  });

  it('does not treat a bare # with no word characters as a hashtag', () => {
    render(<HashtagText text="Price is # 5" onHashtagClick={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
