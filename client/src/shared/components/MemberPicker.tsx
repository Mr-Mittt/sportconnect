import { IconX } from '@tabler/icons-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Input } from '@/shared/ui/input';
import { EmptyHint } from '@/shared/components/EmptyHint';
import { useOverridableText } from '@/shared/lib/useOverridableText';

/** A person the picker lists or has picked: the three fields it needs, whatever API they came from. */
export interface PickerMember {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface MemberPickerProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  /** Used to build the ids of the search box, so two pickers on a page do not clash. */
  idPrefix: string;
  selected: PickerMember[];
  /** What the last search found, already without the people picked and without the caller. */
  results: PickerMember[];
  query: string;
  onQueryChange: (query: string) => void;
  isSearching: boolean;
  isSearchError: boolean;
  onSelect: (member: PickerMember) => void;
  onRemove: (memberId: string) => void;
}

function initialsFor(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * CLIENT-GROUP-SESSION-1: a search-and-pick list of people, controlled and presentational: removable badges for the
 * ones picked (no limit), a search box, and the people the last search found as plain buttons below it. Like the friend
 * picker of the create form it is deliberately **not** a Popover or DropdownMenu (two Radix focus traps inside the
 * form's Dialog fail to open, CLIENT-SESSION-2): the results are an inline list. The caller owns the search (the group
 * member search for a group session) and maps what it finds to `PickerMember`, so the group-session configuration form
 * and the share dialog can reuse it with their own source.
 */
export function MemberPicker({
  idPrefix,
  selected,
  results,
  query,
  onQueryChange,
  isSearching,
  isSearchError,
  onSelect,
  onRemove,
  i18nOverridePrefix,
}: MemberPickerProps) {
  const t = useOverridableText('sharedComponents', i18nOverridePrefix);
  const hasQuery = query.trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('memberPicker.selectedLabel')}>
          {selected.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-1 rounded-full bg-surface-1 py-1 pr-1.5 pl-2.5 text-2xs font-medium text-text-primary"
            >
              {member.name}
              <button
                type="button"
                onClick={() => onRemove(member.id)}
                aria-label={t('memberPicker.remove', { name: member.name })}
                className="flex size-4 cursor-pointer items-center justify-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              >
                <IconX className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={`${idPrefix}-search`}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={t('memberPicker.placeholder')}
        aria-label={t('memberPicker.searchLabel')}
        autoComplete="off"
      />
      {hasQuery &&
        (isSearchError ? (
          <p role="alert" className="text-2xs text-text-danger">
            {t('memberPicker.error')}
          </p>
        ) : isSearching && results.length === 0 ? (
          <p className="text-2xs text-text-muted">{t('memberPicker.searching')}</p>
        ) : results.length === 0 ? (
          <EmptyHint size="2xs">{t('memberPicker.noResults')}</EmptyHint>
        ) : (
          <div className="flex flex-col gap-1">
            {results.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  onSelect(member);
                  onQueryChange('');
                }}
                className="border-hairline flex cursor-pointer items-center gap-2 rounded-lg border-border p-2 text-left hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              >
                <Avatar className="size-6 shrink-0">
                  {member.avatarUrl !== null && <AvatarImage src={member.avatarUrl} alt="" />}
                  <AvatarFallback className="text-2xs">{initialsFor(member.name)}</AvatarFallback>
                </Avatar>
                <span className="text-2sm text-text-primary">{member.name}</span>
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}
