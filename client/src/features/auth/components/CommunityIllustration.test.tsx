import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthShell } from './AuthShell';
import { CommunityIllustration } from './CommunityIllustration';

function earthImage(container: HTMLElement) {
  return container.querySelector('img');
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function boxOf(element: Element): Box {
  const style = (element as HTMLElement).style;
  return {
    left: parseFloat(style.left),
    top: parseFloat(style.top),
    width: parseFloat(style.width),
    height: parseFloat(style.height),
  };
}

const centreOf = ({ left, top, width, height }: Box) => ({ x: left + width / 2, y: top + height / 2 });

function avatars(container: HTMLElement, kind: 'person' | 'group') {
  return Array.from(container.querySelectorAll(`[data-illustration="avatar"][data-kind="${kind}"]`));
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

  describe('layout (AUTH-17)', () => {
    it('draws six people and three groups', () => {
      const { container } = render(<CommunityIllustration />);
      expect(avatars(container, 'person')).toHaveLength(6);
      expect(avatars(container, 'group')).toHaveLength(3);
    });

    it('a person circle is smaller than a group circle, with a smaller icon', () => {
      const { container } = render(<CommunityIllustration />);
      const personSizes = avatars(container, 'person').map((element) => boxOf(element).width);
      const groupSizes = avatars(container, 'group').map((element) => boxOf(element).width);
      expect(Math.max(...personSizes)).toBeLessThan(Math.min(...groupSizes));
      expect(new Set(personSizes)).toEqual(new Set([32]));
      expect(new Set(groupSizes)).toEqual(new Set([44]));
      const iconSize = (element: Element) => element.querySelector('svg')?.getAttribute('width');
      expect(avatars(container, 'person').every((element) => iconSize(element) === '18')).toBe(true);
      expect(avatars(container, 'group').every((element) => iconSize(element) === '24')).toBe(true);
    });

    it('every circle is round and keeps the centre the connector lines end on, whatever its size', () => {
      const { container } = render(<CommunityIllustration />);
      const all = [...avatars(container, 'person'), ...avatars(container, 'group')];
      expect(all.every((element) => boxOf(element).width === boxOf(element).height)).toBe(true);
      const centres = all.map((element) => centreOf(boxOf(element)));
      const key = ({ x, y }: { x: number; y: number }) => `${x},${y}`;
      expect(new Set(centres.map(key))).toEqual(
        new Set(
          [
            [110, 48],
            [250, 48],
            [330, 185],
            [260, 307],
            [30, 185],
            [100, 307],
            [241, 145],
            [180, 252],
            [119, 145],
          ].map(([x, y]) => `${x},${y}`),
        ),
      );
    });

    it('the globe is centred on the hub, the point everything else is drawn around', () => {
      const { container } = render(<CommunityIllustration />);
      const globe = container.querySelector('[data-illustration="globe"]')!;
      const hub = container.querySelector('[data-illustration="hub"]')!;
      expect(centreOf(boxOf(globe))).toEqual({ x: 180, y: 180 });
      expect(centreOf(boxOf(globe))).toEqual(centreOf(boxOf(hub)));
    });

    it('the globe stays inside the 360 x 340 drawing', () => {
      const { container } = render(<CommunityIllustration />);
      const { left, top, width, height } = boxOf(container.querySelector('[data-illustration="globe"]')!);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + width).toBeLessThanOrEqual(360);
      expect(top + height).toBeLessThanOrEqual(340);
    });
  });
});
