import { describe, expect, it } from 'vitest';

/*
 * CLIENT-SESSION-50 (owner, 2026-11-17): the border flick of a form section has the colours of a focused text input
 * (the accent border and the 3px bg-accent ring, see `Input`), for every flick, because every flick is the one
 * `.section-flick` class. This reads the stylesheet, since jsdom does not apply it.
 */
const css = (
  import.meta.glob('/src/index.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
)['/src/index.css'];

const keyframes = /@keyframes section-flick \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';

describe('the section flick takes the focused input colours', () => {
  it('has the keyframes', () => {
    expect(keyframes).not.toBe('');
  });

  it('flicks the accent border and a bg-accent ring, like a focused Input', () => {
    expect(keyframes).toContain('border-color: var(--color-border-accent)');
    expect(keyframes).toContain('box-shadow: 0 0 0 3px var(--color-bg-accent)');
  });

  it('no longer uses the surface-1 grey', () => {
    expect(keyframes).not.toContain('--color-surface-1');
  });

  it('is applied by the one `.section-flick` class, which reduced motion turns off', () => {
    expect(css).toMatch(/\.section-flick \{\s*animation: section-flick 1s ease-in-out;/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.section-flick \{\s*animation: none;/);
  });
});
