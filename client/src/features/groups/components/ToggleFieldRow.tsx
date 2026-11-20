import { useOverridableText } from '@/shared/lib/useOverridableText';

export interface ToggleFieldRowProps {
  label: string;
  description: string;
  value: boolean;
  canEdit: boolean;
  onChange: (value: boolean) => void;
  t: ReturnType<typeof useOverridableText>;
}

/** One `GroupSettings` boolean row — same visual shape as the Privacy row below. */
export function ToggleFieldRow({ label, description, value, canEdit, onChange, t }: ToggleFieldRowProps) {
  return (
    <div className="border-hairline-t flex items-center justify-between border-border pt-3.5">
      <div>
        <div className="text-2sm font-medium text-text-primary">{label}</div>
        <div className="text-2xs text-text-muted">{description}</div>
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={() => onChange(!value)}
          aria-pressed={value}
          aria-label={`${label}: ${value ? t('settings.on') : t('settings.off')}`}
          className={`cursor-pointer rounded-full px-3 py-1.5 text-2sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent ${
            value
              ? 'border-2 border-border-accent font-medium text-text-primary'
              : 'border-hairline border-border bg-surface-1 text-text-secondary'
          }`}
        >
          {value ? t('settings.on') : t('settings.off')}
        </button>
      ) : (
        <span className="text-2sm text-text-secondary">{value ? t('settings.on') : t('settings.off')}</span>
      )}
    </div>
  );
}
