interface IconProps {
  className?: string;
}

/**
 * SPORT-14: a badminton/tennis racket — an outline glyph Tabler's set does not carry (its nearest,
 * `IconBallTennis`, is a ball). Authored to Tabler's spec (24×24 viewBox, `currentColor` stroke,
 * 1.75 width, round caps/joins). Decorative — rendered `aria-hidden` beside the visible label.
 *
 * TODO(SPORT-14): placeholder artwork — the real `d` path data is to be supplied and swapped in
 * before the ticket closes.
 */
export function IconRacket({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="9.5" cy="9.5" rx="6.5" ry="7" transform="rotate(45 9.5 9.5)" />
      <path d="M13.5 14.5 20 21" />
      <path d="M6.5 9.5h6" />
      <path d="M9.5 6.5v6" />
    </svg>
  );
}
