import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Input } from './input';
import { Select } from './select';

/** CLIENT-UI-1: one height (32px, `h-8`) for every single-line control; a taller or auto-height control breaks the rows that line them up. */
describe('control height', () => {
  it('a default button, a small one and an icon button are 32px', () => {
    render(
      <>
        <Button>Default</Button>
        <Button size="sm">Small</Button>
        <Button size="icon" aria-label="Icon" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Default' })).toHaveClass('h-8');
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass('h-8');
    expect(screen.getByRole('button', { name: 'Icon' })).toHaveClass('size-8');
  });

  it('an input and a select are 32px, with no vertical padding to grow them', () => {
    render(
      <>
        <Input aria-label="Name" />
        <Select aria-label="Day" />
      </>,
    );
    for (const control of [screen.getByLabelText('Name'), screen.getByLabelText('Day')]) {
      expect(control).toHaveClass('h-8', 'py-0');
      expect(control).not.toHaveClass('h-auto');
      expect(control).not.toHaveClass('py-2.5');
    }
  });
});
