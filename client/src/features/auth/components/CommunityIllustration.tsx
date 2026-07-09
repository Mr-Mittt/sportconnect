import {
  IconBallFootball,
  IconBarbell,
  IconBike,
  IconPingPong,
  IconUser,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';

interface FloatingAvatar {
  left: number;
  top: number;
  icon: Icon;
  size: number;
  delaySeconds: number;
}

const floatingAvatars: FloatingAvatar[] = [
  { left: 90, top: 28, icon: IconUser, size: 20, delaySeconds: 0 },
  { left: 230, top: 28, icon: IconUsers, size: 22, delaySeconds: 0.4 },
  { left: 310, top: 165, icon: IconUser, size: 20, delaySeconds: 0.8 },
  { left: 240, top: 287, icon: IconUser, size: 20, delaySeconds: 1.2 },
  { left: 10, top: 165, icon: IconUsers, size: 22, delaySeconds: 1.6 },
  { left: 80, top: 287, icon: IconUser, size: 20, delaySeconds: 2 },
  { left: 221, top: 125, icon: IconUsers, size: 22, delaySeconds: 2.4 },
  { left: 160, top: 232, icon: IconUser, size: 20, delaySeconds: 2.8 },
  { left: 99, top: 125, icon: IconUser, size: 20, delaySeconds: 3.2 },
];

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

/**
 * Purely decorative — the Login/Register left-panel illustration from
 * design-reference-login.html: an earth image ringed by orbiting "community"
 * avatar circles (floating animation), connector lines colored by sport ramp,
 * and a central hub icon. `aria-hidden` on the whole tree since none of this
 * conveys information a screen reader user needs.
 */
export function CommunityIllustration() {
  return (
    <div className="relative mx-auto h-[340px] w-[360px]" aria-hidden="true">
      <div
        className="absolute overflow-hidden rounded-full"
        style={{
          left: 22,
          top: 14,
          width: 304,
          height: 304,
          background:
            'radial-gradient(circle at 36% 30%, #ffffff 0%, #f5f4f0 42%, #e7e6de 74%, #d4d3cb 100%)',
          boxShadow:
            'rgba(44, 44, 42, 0.2) 0px 22px 44px, rgba(44, 44, 42, 0.1) -14px -16px 34px inset, rgba(255, 255, 255, 0.75) 10px 10px 24px inset',
        }}
      >
        <img src="/earth.png" alt="" className="size-full object-cover" />
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

      {floatingAvatars.map(({ left, top, icon: AvatarIcon, size, delaySeconds }, i) => (
        <div
          key={i}
          className="animate-float-avatar absolute flex items-center justify-center rounded-full"
          style={{
            left,
            top,
            width: 40,
            height: 40,
            background:
              'radial-gradient(circle at 34% 28%, #ffffff 0%, #f2f1ec 55%, #d9d8d1 100%)',
            boxShadow:
              'rgba(44, 44, 42, 0.22) 0px 8px 15px, rgba(0, 0, 0, 0.08) 0px -3px 6px inset, rgba(255, 255, 255, 0.9) 0px 2px 4px inset',
            animationDelay: `${delaySeconds}s`,
          }}
        >
          <AvatarIcon size={size} className="text-text-secondary" />
        </div>
      ))}
    </div>
  );
}
