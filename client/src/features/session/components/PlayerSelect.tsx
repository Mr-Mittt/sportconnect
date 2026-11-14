import { IconChevronDown, IconX } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { initialsFor } from '@/shared/lib/initialsFor';
import { cn } from '@/shared/lib/utils';

export interface PlayerOption {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface PlayerSelectProps {
  /** The picked player's id, or `undefined` for an empty slot. */
  value: string | undefined;
  /** The player the slot holds (when `value` is set) and the ones that can still be picked. */
  options: PlayerOption[];
  /** The picked player, for the trigger. */
  selected: PlayerOption | undefined;
  /** `left` team: avatar then name; `right` team: name then avatar, everything right-aligned. */
  side: 'left' | 'right';
  invalid?: boolean;
  /** A saved row whose value differs from the saved one: the border takes the focus color. */
  edited?: boolean;
  /** A row marked for deletion: gray, struck through, not interactive. */
  deleted?: boolean;
  /** Text for an empty slot; blank once the record has any input. */
  placeholder: string;
  clearLabel: string;
  ariaLabel: string;
  onChange: (userId: string) => void;
}

function PlayerAvatar({ player }: { player: PlayerOption | undefined }) {
  return (
    <Avatar className="pointer-events-none size-4 shrink-0" aria-hidden="true">
      {player?.avatarUrl != null && <AvatarImage src={player.avatarUrl} alt="" />}
      <AvatarFallback className="text-[8px]">
        {player ? initialsFor(player.name) : '?'}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * CLIENT-GL-38: a player dropdown of the record dialog. A custom listbox, not a native `<select>`, so every option can
 * carry the player's avatar: avatar then name on the left team, name then avatar on the right team (the way the picked
 * value reads). Hovering an option takes `surface-1`; the box has a small radius; a filled slot's first option removes the
 * player, with a red X beside its text (X first on the left team, last on the right team).
 *
 * The list is drawn in place (absolute, not in a portal: a nested popover misbehaves inside the session modal) and closes
 * when focus leaves the control.
 */
export function PlayerSelect({
  value,
  options,
  selected,
  side,
  invalid = false,
  edited = false,
  deleted = false,
  placeholder,
  clearLabel,
  ariaLabel,
  onChange,
}: PlayerSelectProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const right = side === 'right';
  const pick = (userId: string) => {
    setOpen(false);
    onChange(userId);
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={deleted}
        data-edited={edited || undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-8 w-full min-w-0 cursor-pointer items-center gap-1 rounded-lg border-hairline border-border-strong bg-surface-2 px-1 text-2xs text-text-primary transition-[box-shadow,border-color] outline-none',
          'focus-visible:border-border-accent focus-visible:ring-3 focus-visible:ring-bg-accent',
          edited && 'border-border-accent ring-3 ring-bg-accent',
          invalid && 'border-2 border-text-danger',
          deleted && 'cursor-default bg-surface-1 text-text-muted line-through',
        )}
      >
        <IconChevronDown
          className="order-last size-3 shrink-0 text-text-muted"
          aria-hidden="true"
        />
        <span className={cn('flex min-w-0 flex-1 items-center gap-1', right && 'flex-row-reverse')}>
          {value !== undefined && <PlayerAvatar player={selected} />}
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              right ? 'text-right' : 'text-left',
              value === undefined && 'text-text-muted italic',
            )}
          >
            {value !== undefined ? (selected?.name ?? '') : placeholder}
          </span>
        </span>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          // Keep focus on the trigger while the pointer is on the list, so the blur handler does not close it first.
          onMouseDown={(event) => event.preventDefault()}
          className={cn(
            'absolute z-30 mt-0.5 max-h-48 w-max max-w-[14rem] min-w-full overflow-y-auto rounded-md border-hairline border-border-strong bg-surface-2 py-0.5 shadow-card',
            right ? 'right-0' : 'left-0',
          )}
        >
          {value !== undefined && (
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick('')}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-2xs text-text-primary hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none',
                  right && 'flex-row-reverse text-right',
                )}
              >
                <IconX className="size-3.5 shrink-0 text-text-danger" aria-hidden="true" />
                <span className="truncate">{clearLabel}</span>
              </button>
            </li>
          )}
          {options.map((player) => (
            <li key={player.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={player.id === value}
                onClick={() => pick(player.id)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-1.5 px-2 py-1.5 text-2xs text-text-primary hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none',
                  player.id === value && 'font-semibold',
                  right && 'flex-row-reverse text-right',
                )}
              >
                <PlayerAvatar player={player} />
                <span className="truncate">{player.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
