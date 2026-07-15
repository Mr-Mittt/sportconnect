import type { ReactNode } from 'react';

interface HashtagTextProps {
  text: string;
  onHashtagClick: (tag: string) => void;
  className?: string;
}

// Same `#(\w+)` shape as the real backend's extraction regex
// (HashtagServiceImpl) — what's clickable here always matches what the
// backend actually indexed for this exact text, since that's where its own
// `hashtags` array came from in the first place.
const HASHTAG_PATTERN = /#(\w+)/g;

/**
 * Renders `text` with every `#tag` occurrence turned into an inline clickable
 * button, instead of a separate row of hashtag chips repeating the same tags
 * below the text (FEED-6 follow-up — the old PostCard rendered both). Used
 * for post content (`PostCard`, the comment modal's repeated post body) and
 * comment content (`CommentItem`) — one component, not three copies of the
 * same regex-split-and-render logic.
 */
export function HashtagText({ text, onHashtagClick, className }: HashtagTextProps) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  // `matchAll` internally clones the regex per the spec, so it never mutates
  // (or reads stale state from) the shared module-level `HASHTAG_PATTERN` —
  // unlike a manual `exec()` loop, which would need to reset `lastIndex`
  // itself and isn't safe to do from inside a component's render.
  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const tag = match[1];
    nodes.push(
      <button
        key={`${match.index}-${tag}`}
        type="button"
        onClick={() => onHashtagClick(`#${tag}`)}
        className="cursor-pointer text-text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent rounded"
      >
        #{tag}
      </button>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <p className={className}>{nodes}</p>;
}
