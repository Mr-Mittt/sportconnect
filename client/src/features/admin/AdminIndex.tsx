/**
 * Landing content for `/admin` when no admin section is selected (ADMIN-1).
 *
 * Kept separate from `AdminLayout` so a new section adds its link here without
 * touching the shell. Renders an explicit empty state rather than nothing at all —
 * a blank panel is indistinguishable from a broken route.
 */
export function AdminIndex() {
  return (
    <section>
      <h2 className="text-lg font-semibold text-text-primary">Sections</h2>
      <p className="mt-2 text-2sm text-text-muted">
        No admin sections are available yet.
      </p>
    </section>
  );
}
