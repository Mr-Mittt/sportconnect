import { useTranslation } from 'react-i18next';
import { parseMarkup } from '@/shared/lib/mentionMarkup';
import { cn } from '@/shared/lib/utils';
import { HashtagText } from './HashtagText';

interface PostTextProps {
  /** The stored post or comment text: tags written as `@[Full Name](userId)`, hashtags as `#tag`. */
  text: string;
  onHashtagClick: (tag: string) => void;
  className?: string;
}

/**
 * CLIENT-GL-50 part 2: the body of a post or a comment with its tags drawn as chips and its `#hashtags` still clickable.
 * The name shown is the one stored in the text; the id is never shown. Line breaks of the text show (`pre-line`), and
 * text without any tag renders exactly as `HashtagText` did.
 */
export function PostText({ text, onHashtagClick, className }: PostTextProps) {
  const { t } = useTranslation('sharedComponents');
  return (
    <p className={cn('whitespace-pre-line', className)}>
      {parseMarkup(text).map((segment, index) =>
        segment.kind === 'text' ? (
          <HashtagText key={index} text={segment.text} onHashtagClick={onHashtagClick} as="span" />
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
