import { useId } from 'react';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import type { ImportCandidate, ImportUnresolvedName } from '../types';

interface UnresolvedNamesPanelProps {
  unresolved: ImportUnresolvedName[];
  /** The group's active members, offered for every name. */
  members: ImportCandidate[];
  /** The member chosen so far, by name as written. */
  aliases: Record<string, string>;
  /** `userId` is empty when the admin goes back to "Choose a member". */
  onChoose: (name: string, userId: string) => void;
}

/**
 * CLIENT-ADMIN-IMPORT-1: one dropdown per name the server could not settle (no member has that first name, or several do).
 * The members with that first name come first, then every active member of the group. The apply stays disabled until each
 * name has a member.
 */
export function UnresolvedNamesPanel({ unresolved, members, aliases, onChoose }: UnresolvedNamesPanelProps) {
  const baseId = useId();
  return (
    <section aria-label="Names to match" className="space-y-3">
      <p className="text-2sm text-text-secondary">
        {unresolved.length === 1 ? 'This name is' : 'These names are'} not matched to exactly one member. Choose who each one is.
      </p>
      {unresolved.map((entry, index) => {
        const id = `${baseId}-${index}`;
        const sameFirstName = new Set(entry.candidates.map((c) => c.userId));
        return (
          <div key={entry.name}>
            <Label htmlFor={id}>{`Who is "${entry.name}"?`}</Label>
            <Select id={id} value={aliases[entry.name] ?? ''} onChange={(event) => onChoose(entry.name, event.target.value)}>
              <option value="">Choose a member…</option>
              {entry.candidates.length > 0 && (
                <optgroup label="Same first name">
                  {entry.candidates.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.fullName}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All members">
                {members
                  .filter((m) => !sameFirstName.has(m.userId))
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.fullName}
                    </option>
                  ))}
              </optgroup>
            </Select>
            {entry.candidates.length === 0 && (
              <p className="mt-1 text-2xs text-text-muted">No member has this first name.</p>
            )}
          </div>
        );
      })}
    </section>
  );
}
