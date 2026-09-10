interface IconProps {
  className?: string;
}

/**
 * SPORT-14: a badminton shuttlecock — an outline glyph Tabler's set does not carry, authored to
 * Tabler's spec (24×24 viewBox, `currentColor` stroke, 1.75 width, round caps/joins) so it sits
 * beside real Tabler icons on a container heading without looking out of place. Decorative — the
 * caller renders it `aria-hidden` next to the visible text label.
 *
 * TODO(SPORT-14): placeholder artwork — the real `d` path data is to be supplied and swapped in
 * before the ticket closes.
 */
export function IconShuttlecock({ className }: IconProps) {
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
      <circle cx="12" cy="17.5" r="3.5" />
      <path d="M9.2 15.4 5 6l6 4.5" />
      <path d="M14.8 15.4 19 6l-6 4.5" />
      <path d="M12 14V4" />
      <path d="M8.5 16.2 4.5 12" />
      <path d="M15.5 16.2 19.5 12" />
    </svg>
  );
}
