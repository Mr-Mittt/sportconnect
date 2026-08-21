import { Button } from '@/shared/ui/button';
import type { SportResponse } from '@/shared/types/sport';

export interface SportCatalogTableProps {
  sports: SportResponse[];
  selectedSportId: number | undefined;
  onSelect: (sportId: number) => void;
}

function formatCount(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—';
  return `${min ?? '?'}–${max ?? '?'}`;
}

/**
 * ADMIN-2 master pane: every sport, including deactivated ones.
 *
 * Presentational and controlled — the page owns which row is selected. Shows all sport
 * fields except `attributesSchema`, whose column holds a "Show detail" button instead of a
 * value (the document is far too large for a cell).
 *
 * **Keyboard access lives on the button, not the row.** A clickable `<tr>` is not reachable
 * by keyboard and takes no focus; the row's `onClick` here is a mouse-only convenience
 * layered on top of a real focusable control, so the keyboard path never depends on it.
 */
export function SportCatalogTable({ sports, selectedSportId, onSelect }: SportCatalogTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-2sm">
        <caption className="sr-only">
          All sports, including deactivated ones. Select a sport to edit its fields and
          attribute schema.
        </caption>
        <thead>
          <tr className="border-b-hairline border-border text-left text-text-secondary">
            <th scope="col" className="py-2 pr-3 font-medium">Id</th>
            <th scope="col" className="py-2 pr-3 font-medium">Name</th>
            <th scope="col" className="py-2 pr-3 font-medium">Category</th>
            <th scope="col" className="py-2 pr-3 font-medium">Description</th>
            <th scope="col" className="py-2 pr-3 font-medium">Players</th>
            <th scope="col" className="py-2 pr-3 font-medium">Icon URL</th>
            <th scope="col" className="py-2 pr-3 font-medium">Status</th>
            <th scope="col" className="py-2 pr-3 font-medium">Attributes</th>
          </tr>
        </thead>
        <tbody>
          {sports.map((sport) => {
            const isSelected = sport.id === selectedSportId;
            return (
              <tr
                key={sport.id}
                onClick={() => onSelect(sport.id)}
                aria-current={isSelected ? 'true' : undefined}
                className={`border-b-hairline border-border cursor-pointer transition-colors hover:bg-surface-1 ${
                  isSelected ? 'bg-surface-1' : ''
                }`}
              >
                <td className="py-2 pr-3 text-text-muted">{sport.id}</td>
                <td className="py-2 pr-3 font-medium text-text-primary">{sport.name}</td>
                <td className="py-2 pr-3 text-text-secondary">{sport.category ?? '—'}</td>
                <td className="max-w-[16rem] truncate py-2 pr-3 text-text-secondary">
                  {sport.description ?? '—'}
                </td>
                <td className="py-2 pr-3 text-text-secondary">
                  {formatCount(sport.minPlayers, sport.maxPlayers)}
                </td>
                <td className="max-w-[12rem] truncate py-2 pr-3 text-text-muted">
                  {sport.iconUrl ?? '—'}
                </td>
                <td className="py-2 pr-3">
                  {/* Text, not colour alone — a11y baseline. */}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      sport.isActive
                        ? 'bg-surface-1 text-text-primary'
                        : 'bg-surface-1 text-text-muted'
                    }`}
                  >
                    {sport.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Show detail for ${sport.name}`}
                    onClick={(event) => {
                      // The row handler would otherwise fire a second, identical select.
                      event.stopPropagation();
                      onSelect(sport.id);
                    }}
                  >
                    Show detail
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
