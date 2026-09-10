import type { ComponentType, ReactNode } from 'react';
import {
  IconAward,
  IconBallBaseball,
  IconBallBasketball,
  IconBallBowling,
  IconBallFootball,
  IconBallTennis,
  IconBallVolleyball,
  IconBarbell,
  IconCalendar,
  IconClock,
  IconList,
  IconMapPin,
  IconNote,
  IconRuler,
  IconSettings,
  IconTarget,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { devWarn } from '@/shared/lib/devWarn';
import { IconRacket } from './icons/IconRacket';
import { IconShuttlecock } from './icons/IconShuttlecock';

type HeadingIcon = ComponentType<{ className?: string }>;

/**
 * SPORT-14: the closed set of `layout.icon` names a schema author may put on a container heading
 * (`group` / `DEFINITION` / `DEFINITION_LIST`). Mostly Tabler outline components (`client/CLAUDE.md`
 * — Tabler, outline only); `shuttlecock` / `racket` are the two glyphs Tabler's set lacks, authored
 * locally to its spec. A name not in this map renders no icon (plus a dev warning) rather than
 * throwing — the text label always carries the meaning, the icon is decorative.
 */
const HEADING_ICONS: Record<string, HeadingIcon> = {
  tennis: IconBallTennis,
  racket: IconRacket,
  shuttlecock: IconShuttlecock,
  football: IconBallFootball,
  basketball: IconBallBasketball,
  volleyball: IconBallVolleyball,
  bowling: IconBallBowling,
  baseball: IconBallBaseball,
  strength: IconBarbell,
  award: IconAward,
  target: IconTarget,
  settings: IconSettings,
  gear: IconSettings,
  ruler: IconRuler,
  clock: IconClock,
  calendar: IconCalendar,
  list: IconList,
  user: IconUser,
  users: IconUsers,
  'map-pin': IconMapPin,
  note: IconNote,
};

/**
 * Resolve a `layout.icon` name to its component.
 *
 * - `null` / `undefined` / empty → `null`, silently (no icon is the norm).
 * - A non-empty name not in {@link HEADING_ICONS} → `null` plus a deduped {@link devWarn}, since
 *   the author clearly meant something. `context` names the node in the warning.
 */
export function resolveHeadingIcon(
  name: string | null | undefined,
  context: string,
): HeadingIcon | null {
  if (name == null || name === '') return null;
  const icon = HEADING_ICONS[name];
  if (icon === undefined) {
    devWarn(
      `layout-icon-unknown:${context}:${name}`,
      `"${context}" \`layout.icon\` "${name}" is not a known icon name — rendering the heading without an icon`,
    );
    return null;
  }
  return icon;
}

/**
 * A container heading's rendered content. With no resolvable icon this returns the **bare `label`
 * string** — so a heading with no `layout.icon` is byte-identical to its pre-SPORT-14 output. With
 * an icon it returns `{icon} {label}` in an `inline-flex` row, the icon `aria-hidden` (decorative;
 * the label is the accessible text).
 */
export function renderHeadingLabel(
  label: string,
  iconName: string | null | undefined,
  context: string,
): ReactNode {
  const Icon = resolveHeadingIcon(iconName, context);
  if (Icon === null) return label;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-flex shrink-0">
        <Icon className="size-4 text-text-secondary" />
      </span>
      {label}
    </span>
  );
}
