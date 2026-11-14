import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyHint } from './EmptyHint';

describe('EmptyHint', () => {
  it('is muted and always centered, at the default size', () => {
    render(<EmptyHint>Nothing here yet.</EmptyHint>);
    const hint = screen.getByText('Nothing here yet.');
    expect(hint).toHaveClass('text-center', 'text-text-muted', 'text-2sm');
  });

  it.each([
    ['2xs', 'text-2xs'],
    ['xs', 'text-xs'],
  ] as const)('supports the %s size and extra spacing without losing the centering', (size, cls) => {
    render(
      <EmptyHint size={size} className="py-2">
        hint
      </EmptyHint>,
    );
    expect(screen.getByText('hint')).toHaveClass('text-center', cls, 'py-2');
  });
});
