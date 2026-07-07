/*
 * Ramp → Tailwind class maps. Static strings on purpose: Tailwind statically
 * analyzes class names, so `bg-${ramp}-50` would silently produce no CSS.
 * Unknown ramps fall back to neutral surface styling — same behavior as the
 * mockup's `var(--<ramp>-50, var(--surface-1))` fallback.
 */
const badgeClassesByRamp: Record<string, string> = {
  teal: 'bg-teal-50 text-teal-800',
  coral: 'bg-coral-50 text-coral-800',
  purple: 'bg-purple-50 text-purple-800',
};

export function getRampBadgeClasses(ramp: string): string {
  return badgeClassesByRamp[ramp] ?? 'bg-surface-1 text-text-primary';
}
