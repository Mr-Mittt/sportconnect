import { MemberPicker, type PickerMember } from '@/shared/components/MemberPicker';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { GroupSessionAudience } from '../types';

interface GroupAudienceFieldProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  idPrefix: string;
  audience: GroupSessionAudience;
  onAudienceChange: (next: GroupSessionAudience) => void;
  selected: PickerMember[];
  results: PickerMember[];
  query: string;
  onQueryChange: (query: string) => void;
  isSearching: boolean;
  isSearchError: boolean;
  onSelect: (member: PickerMember) => void;
  onRemove: (memberId: string) => void;
  /** "Specific" with nobody picked, after a refused submit. */
  showPickError: boolean;
}

/**
 * CLIENT-GROUP-SESSION-1: the Who section's audience of a group session, in place of the slots: **All members** (the
 * default) or **Specific members** with a `MemberPicker` (no limit). The audience only decides who is told; every member
 * can still see and join the session, which the hint under the radios says.
 */
export function GroupAudienceField({
  idPrefix,
  audience,
  onAudienceChange,
  selected,
  results,
  query,
  onQueryChange,
  isSearching,
  isSearchError,
  onSelect,
  onRemove,
  showPickError,
  i18nOverridePrefix,
}: GroupAudienceFieldProps) {
  const t = useOverridableText('session', i18nOverridePrefix);
  const isSpecific = audience === 'SPECIFIC';
  return (
    <fieldset aria-label={t('create.audience.label')} className="flex min-w-0 flex-col gap-2">
      <label className="flex cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
        <input
          type="radio"
          name={`${idPrefix}-audience`}
          checked={!isSpecific}
          onChange={() => onAudienceChange('ALL_MEMBERS')}
          className="size-4 cursor-pointer"
        />
        {t('create.audience.allMembers')}
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-2sm text-text-primary select-none">
        <input
          type="radio"
          name={`${idPrefix}-audience`}
          checked={isSpecific}
          onChange={() => onAudienceChange('SPECIFIC')}
          className="size-4 cursor-pointer"
        />
        {t('create.audience.specific')}
      </label>
      {isSpecific && (
        <div className="ml-6 flex flex-col gap-1.5">
          <MemberPicker
            idPrefix={idPrefix}
            selected={selected}
            results={results}
            query={query}
            onQueryChange={onQueryChange}
            isSearching={isSearching}
            isSearchError={isSearchError}
            onSelect={onSelect}
            onRemove={onRemove}
          />
          {showPickError && selected.length === 0 && (
            <p className="text-2xs text-text-danger">{t('create.validation.audience')}</p>
          )}
        </div>
      )}
      <p className="text-2xs text-text-muted">{t('create.audience.hint')}</p>
    </fieldset>
  );
}
