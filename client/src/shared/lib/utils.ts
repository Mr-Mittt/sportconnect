import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge doesn't know about our custom border-hairline* utilities
 * (index.css) — its default config bucketed them into the border-color
 * conflict group (matching the generic "border-X" shape), so any class list
 * combining border-hairline with a border-{color} utility silently dropped
 * border-hairline entirely, leaving border-width: 0 (browser default). This
 * broke every Button variant using a border, invisible until inspected
 * directly (AUTH-1) since default-variant buttons still had a distinguishing
 * fill color. Registering these under their real conflict groups (border-w /
 * border-w-t / border-w-r / border-w-b) fixes it for every existing and
 * future usage in one place.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'border-w': ['border-hairline'],
      'border-w-t': ['border-hairline-t'],
      'border-w-r': ['border-hairline-r'],
      'border-w-b': ['border-hairline-b'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
