import { IconQuestionMark } from '@tabler/icons-react';

interface SportIconProps {
  /** SportProfile.iconUrl — a real backend-served PNG (`Sport.iconUrl`), or
   * null when the catalog has no icon for this sport yet. */
  iconUrl: string | null;
  className?: string;
}

/**
 * SPORT-4: renders a sport's real icon, replacing the old Tabler stand-in
 * lookup (`getSportIcon`). Every call site already renders the sport's name
 * as visible text alongside this icon (badge label, pill label, section
 * header), so the icon itself stays decorative (`alt=""`, `aria-hidden`) —
 * same treatment `createElement(getSportIcon(...), { 'aria-hidden': true })`
 * had before.
 *
 * Falls back to a generic question-mark icon when `iconUrl` is null, instead
 * of rendering nothing — same "unknown sport, don't crash" precedent
 * `getSportIcon`'s unknown-name fallback established.
 */
export function SportIcon({ iconUrl, className }: SportIconProps) {
  if (iconUrl === null) {
    return <IconQuestionMark className={className} aria-hidden="true" />;
  }
  return <img src={iconUrl} alt="" aria-hidden="true" className={className} />;
}
