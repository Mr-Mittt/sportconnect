import {
  IconBallFootball,
  IconBarbell,
  IconBike,
  IconPingPong,
  IconUser,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';

type AvatarKind = 'person' | 'group';

/**
 * AUTH-17 (owner): a person circle is smaller than a group circle. Both are placed by their *centre*
 * (`cx`, `cy`), so a size change never moves the point the connector lines end on.
 */
const AVATAR_KINDS: Record<AvatarKind, { circle: number; iconSize: number; icon: Icon }> = {
  person: { circle: 32, iconSize: 18, icon: IconUser },
  group: { circle: 44, iconSize: 24, icon: IconUsers },
};

interface FloatingAvatar {
  cx: number;
  cy: number;
  kind: AvatarKind;
  delaySeconds: number;
}

const floatingAvatars: FloatingAvatar[] = [
  { cx: 110, cy: 48, kind: 'person', delaySeconds: 0 },
  { cx: 250, cy: 48, kind: 'group', delaySeconds: 0.4 },
  { cx: 330, cy: 185, kind: 'person', delaySeconds: 0.8 },
  { cx: 260, cy: 307, kind: 'person', delaySeconds: 1.2 },
  { cx: 30, cy: 185, kind: 'group', delaySeconds: 1.6 },
  { cx: 100, cy: 307, kind: 'person', delaySeconds: 2 },
  { cx: 241, cy: 145, kind: 'group', delaySeconds: 2.4 },
  { cx: 180, cy: 252, kind: 'person', delaySeconds: 2.8 },
  { cx: 119, cy: 145, kind: 'person', delaySeconds: 3.2 },
];

/**
 * The globe is centred on (180, 180), the point the hub, the connector lines and the ring of people are drawn
 * around (AUTH-17: it used to sit at (174, 166), 6 px left and 14 px above all of them).
 */
const GLOBE = { size: 304, left: 28, top: 28 };

interface AccentIcon {
  left: number;
  top: number;
  icon: Icon;
  colorVar: string;
}

const accentIcons: AccentIcon[] = [
  { left: 163, top: 71, icon: IconBallFootball, colorVar: 'var(--color-teal-800)' },
  { left: 243, top: 209, icon: IconBarbell, colorVar: 'var(--color-purple-800)' },
  { left: 83, top: 209, icon: IconBike, colorVar: 'var(--color-coral-800)' },
];

// Each cluster's 4 (or 3, for the central hub) connector lines, transcribed
// verbatim from design-reference-login.html's SVG.
const connectorLines: Array<{ x1: number; y1: number; x2: number; y2: number; colorVar: string }> = [
  { x1: 110, y1: 48, x2: 180, y2: 88, colorVar: 'var(--color-teal-800)' },
  { x1: 250, y1: 48, x2: 180, y2: 88, colorVar: 'var(--color-teal-800)' },
  { x1: 241, y1: 145, x2: 180, y2: 88, colorVar: 'var(--color-teal-800)' },
  { x1: 119, y1: 145, x2: 180, y2: 88, colorVar: 'var(--color-teal-800)' },
  { x1: 330, y1: 185, x2: 260, y2: 226, colorVar: 'var(--color-purple-800)' },
  { x1: 260, y1: 307, x2: 260, y2: 226, colorVar: 'var(--color-purple-800)' },
  { x1: 241, y1: 145, x2: 260, y2: 226, colorVar: 'var(--color-purple-800)' },
  { x1: 180, y1: 252, x2: 260, y2: 226, colorVar: 'var(--color-purple-800)' },
  { x1: 30, y1: 185, x2: 100, y2: 226, colorVar: 'var(--color-coral-800)' },
  { x1: 100, y1: 307, x2: 100, y2: 226, colorVar: 'var(--color-coral-800)' },
  { x1: 180, y1: 252, x2: 100, y2: 226, colorVar: 'var(--color-coral-800)' },
  { x1: 119, y1: 145, x2: 100, y2: 226, colorVar: 'var(--color-coral-800)' },
  { x1: 241, y1: 145, x2: 180, y2: 180, colorVar: 'var(--color-decor-hub)' },
  { x1: 180, y1: 252, x2: 180, y2: 180, colorVar: 'var(--color-decor-hub)' },
  { x1: 119, y1: 145, x2: 180, y2: 180, colorVar: 'var(--color-decor-hub)' },
];

interface CommunityIllustrationProps {
  /**
   * AUTH-15: URL of the earth image. The default is the client's own `/earth.png`; the Keycloak
   * theme passes an asset URL of its own, because on Keycloak's pages `/earth.png` 404s (they are
   * served under `/resources/<hash>/login/<theme>/`).
   */
  earthSrc?: string;
}

/**
 * Purely decorative — the Login/Register left-panel illustration from
 * design-reference-login.html: an earth image ringed by orbiting "community"
 * avatar circles (floating animation), connector lines colored by sport ramp,
 * and a central hub icon. `aria-hidden` on the whole tree since none of this
 * conveys information a screen reader user needs.
 *
 * Shared with the Keycloak theme (`client/keycloak-theme`): keep this file free of app imports
 * (router, i18n, stores) — see the ESLint `no-restricted-imports` block in `eslint.config.js`.
 */
export function CommunityIllustration({ earthSrc = '/earth.png' }: CommunityIllustrationProps) {
  return (
    <div className="relative mx-auto h-[340px] w-[360px]" aria-hidden="true">
      <div
        data-illustration="globe"
        className="absolute overflow-hidden rounded-full"
        style={{
          left: GLOBE.left,
          top: GLOBE.top,
          width: GLOBE.size,
          height: GLOBE.size,
          background:
            'radial-gradient(circle at 36% 30%, #ffffff 0%, #f5f4f0 42%, #e7e6de 74%, #d4d3cb 100%)',
          boxShadow:
            'rgba(44, 44, 42, 0.2) 0px 22px 44px, rgba(44, 44, 42, 0.1) -14px -16px 34px inset, rgba(255, 255, 255, 0.75) 10px 10px 24px inset',
        }}
      >
        <img src={earthSrc} alt="" className="size-full object-cover" />
      </div>

      <svg width="360" height="340" viewBox="0 0 360 340" className="absolute inset-0">
        {connectorLines.map((line, i) => (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.colorVar}
            strokeOpacity={0.32}
            strokeWidth={2}
            strokeLinecap="round"
          />
        ))}
      </svg>

      <div
        data-illustration="hub"
        className="absolute flex items-center justify-center"
        style={{ left: 148, top: 148, width: 64, height: 64 }}
      >
        <IconPingPong
          size={44}
          style={{
            color: 'var(--color-decor-hub)',
            filter: 'drop-shadow(rgba(30, 106, 168, 0.28) 0px 2px 3px)',
          }}
        />
      </div>

      {accentIcons.map(({ left, top, icon: AccentIcon, colorVar }, i) => (
        <div
          key={i}
          className="absolute flex items-center justify-center"
          style={{ left, top, width: 34, height: 34 }}
        >
          <AccentIcon size={30} style={{ color: colorVar }} />
        </div>
      ))}

      {floatingAvatars.map(({ cx, cy, kind, delaySeconds }, i) => {
        const { circle, iconSize, icon: AvatarIcon } = AVATAR_KINDS[kind];
        return (
          <div
            key={i}
            data-illustration="avatar"
            data-kind={kind}
            className="animate-float-avatar absolute flex items-center justify-center rounded-full"
            style={{
              left: cx - circle / 2,
              top: cy - circle / 2,
              width: circle,
              height: circle,
              background:
                'radial-gradient(circle at 34% 28%, #ffffff 0%, #f2f1ec 55%, #d9d8d1 100%)',
              boxShadow:
                'rgba(44, 44, 42, 0.22) 0px 8px 15px, rgba(0, 0, 0, 0.08) 0px -3px 6px inset, rgba(255, 255, 255, 0.9) 0px 2px 4px inset',
              animationDelay: `${delaySeconds}s`,
            }}
          >
            <AvatarIcon size={iconSize} className="text-text-secondary" />
          </div>
        );
      })}
    </div>
  );
}
