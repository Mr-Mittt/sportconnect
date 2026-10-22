import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthShell } from './AuthShell';
import { CommunityIllustration } from './CommunityIllustration';

function earthImage(container: HTMLElement) {
  return container.querySelector('img');
}

describe('CommunityIllustration', () => {
  it('loads the client-served earth image by default', () => {
    const { container } = render(<CommunityIllustration />);
    expect(earthImage(container)?.getAttribute('src')).toBe('/earth.png');
  });

  it('uses the given earthSrc (the Keycloak theme serves it from its own resources path)', () => {
    const { container } = render(<CommunityIllustration earthSrc="/resources/abc/earth.png" />);
    expect(earthImage(container)?.getAttribute('src')).toBe('/resources/abc/earth.png');
  });

  it('AuthShell forwards earthSrc to the illustration', () => {
    const { container } = render(
      <AuthShell earthSrc="/resources/abc/earth.png">
        <p>content</p>
      </AuthShell>,
    );
    expect(earthImage(container)?.getAttribute('src')).toBe('/resources/abc/earth.png');
  });
});
