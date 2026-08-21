import { Link } from 'react-router-dom';

/**
 * Landing content for `/admin` when no admin section is selected (ADMIN-1).
 *
 * Kept separate from `AdminLayout` so a new section adds its link here without
 * touching the shell. ADMIN-2 replaced the original "no sections yet" empty state
 * with the first real entry.
 */
export function AdminIndex() {
  return (
    <section>
      <h2 className="text-lg font-semibold text-text-primary">Sections</h2>
      <ul className="mt-2 space-y-2">
        <li>
          <Link
            to="/admin/sports"
            className="text-2sm font-medium text-text-accent underline-offset-4 hover:underline"
          >
            Sports
          </Link>
          <p className="text-2sm text-text-muted">
            Update sport fields and per-sport attribute schemas.
          </p>
        </li>
      </ul>
    </section>
  );
}
