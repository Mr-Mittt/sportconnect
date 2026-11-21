import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Input } from './input';
import { Select } from './select';

// This folder is also type-checked by the Keycloak theme's own tsconfig (`client/keycloak-theme/tsconfig.json` includes
// `../src/shared/ui`), which does not load the jest-dom matcher types: so no `toHaveClass` here, only plain DOM state
// (the same way `checkbox.test.tsx` next to it stays within vitest's own matchers).
const hasClass = (element: HTMLElement, name: string) => element.classList.contains(name);

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
    expect(hasClass(screen.getByRole('button', { name: 'Default' }), 'h-8')).toBe(true);
    expect(hasClass(screen.getByRole('button', { name: 'Small' }), 'h-8')).toBe(true);
    expect(hasClass(screen.getByRole('button', { name: 'Icon' }), 'size-8')).toBe(true);
  });

  it('an input and a select are 32px, with no vertical padding to grow them', () => {
    render(
      <>
        <Input aria-label="Name" />
        <Select aria-label="Day" />
      </>,
    );
    for (const control of [screen.getByLabelText('Name'), screen.getByLabelText('Day')]) {
      expect(hasClass(control, 'h-8')).toBe(true);
      expect(hasClass(control, 'py-0')).toBe(true);
      expect(hasClass(control, 'h-auto')).toBe(false);
      expect(hasClass(control, 'py-2.5')).toBe(false);
    }
  });
});
