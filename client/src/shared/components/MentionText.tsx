import { useTranslation } from 'react-i18next';
import { parseMarkup } from '@/shared/lib/mentionMarkup';

interface MentionTextProps {
  /** The stored comment text, tags written as `@[Full Name](userId)`. */
  text: string;
  className?: string;
}

/**
 * CLIENT-GL-50: a session comment with its tags drawn as chips. The name shown is the one stored in the text (a person
 * who left or changed their name still reads as tagged); the id is never shown. Markup that cannot be read stays as
 * plain text.
 */
export function MentionText({ text, className }: MentionTextProps) {
  const { t } = useTranslation('sharedComponents');
  return (
    <p className={className}>
      {parseMarkup(text).map((segment, index) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <span
            key={`${index}-${segment.userId}`}
            role="img"
            aria-label={t('mention.chipLabel', { name: segment.name })}
            className="mx-0.5 inline-block rounded-md bg-surface-2 px-1 font-medium text-text-accent"
          >
            @{segment.name}
          </span>
        ),
      )}
    </p>
  );
}
