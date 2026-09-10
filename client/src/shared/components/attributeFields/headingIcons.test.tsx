import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDevWarnCache } from '@/shared/lib/devWarn';
import { renderHeadingLabel, resolveHeadingIcon } from './headingIcons';

beforeEach(() => {
  resetDevWarnCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('resolveHeadingIcon', () => {
  it('returns a component for a known name', () => {
    expect(resolveHeadingIcon('tennis', 'gear')).toBeTypeOf('object');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('resolves the locally-authored glyphs Tabler lacks', () => {
    expect(resolveHeadingIcon('shuttlecock', 'gear')).not.toBeNull();
    expect(resolveHeadingIcon('racket', 'gear')).not.toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns null and warns once for an unknown name', () => {
    expect(resolveHeadingIcon('not-a-real-icon', 'gear')).toBeNull();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('returns null silently for nullish / empty', () => {
    expect(resolveHeadingIcon(null, 'g')).toBeNull();
    expect(resolveHeadingIcon(undefined, 'g')).toBeNull();
    expect(resolveHeadingIcon('', 'g')).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe('renderHeadingLabel', () => {
  it('returns the bare label string when no icon resolves (byte-identical heading)', () => {
    expect(renderHeadingLabel('Gear', undefined, 'gear')).toBe('Gear');
    expect(renderHeadingLabel('Gear', 'nope', 'gear')).toBe('Gear');
  });

  it('renders an aria-hidden icon before the label when one resolves', () => {
    const { container, getByText } = render(
      <div>{renderHeadingLabel('Gear', 'tennis', 'gear')}</div>,
    );
    expect(getByText('Gear')).toBeInTheDocument();
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
