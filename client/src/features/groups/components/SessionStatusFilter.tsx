import { IconFilter } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import type { SessionStatus } from '@/shared/types/session';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';

interface SessionStatusFilterProps {
  /** i18next `"namespace:key.path"` prefix that overrides this component's copy (see `useOverridableText`). */
  i18nOverridePrefix?: string;
  /** Names the filter for a screen reader and the button's tooltip ("Today's", "Others", "History"). */
  sectionLabel: string;
  /** The statuses this section can show, in the order the menu lists them. */
  options: readonly SessionStatus[];
  selected: readonly SessionStatus[];
  onChange: (selected: SessionStatus[]) => void;
}

/**
 * CLIENT-GROUP-SESSION-2: the multi-select status filter in the header of a Sessions-tab section, right-aligned. A button
 * reading "Status (n)" opens a menu of checkbox rows (one per status the section offers); ticking a row keeps the menu open so
 * several can be changed in one go. Controlled: the section's data hook owns the selection. Nothing stops the viewer from
 * unticking every row: the section then shows its "select a status" hint and asks the server for nothing.
 */
export function SessionStatusFilter({ sectionLabel, options, selected, onChange, i18nOverridePrefix }: SessionStatusFilterProps) {
  const t = useOverridableText('groups', i18nOverridePrefix);
  const { t: tEnums } = useTranslation('enums');

  const toggle = (status: SessionStatus, checked: boolean) => {
    onChange(options.filter((option) => (option === status ? checked : selected.includes(option))));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('sessionsTab.filter.label', { section: sectionLabel })}
        className="flex cursor-pointer items-center gap-1 rounded-md border-hairline border-border px-2 py-1 text-2xs font-medium text-text-secondary hover:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
      >
        <IconFilter className="size-3.5" aria-hidden="true" />
        {t('sessionsTab.filter.button', { count: selected.length })}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {options.map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={selected.includes(status)}
            onCheckedChange={(checked) => toggle(status, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            {tEnums(`sessionStatus.${status}`)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
