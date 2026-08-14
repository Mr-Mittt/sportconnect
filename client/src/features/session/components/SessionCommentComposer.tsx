import { IconSend } from '@tabler/icons-react';
import { useState } from 'react';
import { MAX_COMMENT_LENGTH } from '@/features/feed/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

interface SessionCommentComposerProps {
  currentUser: { fullName: string; avatarUrl: string | null } | undefined;
  onAddComment: (content: string) => void;
  isPosting: boolean;
}

function initialsFor(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * CLIENT-SESSION-10: extracted from `SessionCommentSection` so `SessionDetailModal` can pin it in
 * the dialog's non-scrolling footer (design-reference-session-modal.html) while the like
 * button/thread/"view more" stay in the scrollable body — `SessionCommentSection` no longer owns
 * composer state. Same input/submit behavior as before (Enter submits, trims, clears on send).
 */
export function SessionCommentComposer({
  currentUser,
  onAddComment,
  isPosting,
}: SessionCommentComposerProps) {
  const [content, setContent] = useState('');

  const submitComment = () => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;
    onAddComment(trimmed);
    setContent('');
  };

  return (
    <div className="flex items-center gap-2">
      <Avatar className="size-7 shrink-0">
        {currentUser?.avatarUrl != null && <AvatarImage src={currentUser.avatarUrl} alt="" />}
        <AvatarFallback className="bg-surface-1 text-2xs text-text-primary">
          {currentUser !== undefined ? initialsFor(currentUser.fullName) : ''}
        </AvatarFallback>
      </Avatar>
      <input
        type="text"
        value={content}
        onChange={(event) => setContent(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submitComment();
        }}
        placeholder="Add a comment…"
        aria-label="Add a comment"
        maxLength={MAX_COMMENT_LENGTH}
        className="min-w-0 flex-1 rounded-lg border-hairline border-border bg-surface-1 px-3 py-1.5 text-2sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
      />
      <Button
        variant="primary"
        size="icon"
        aria-label="Post comment"
        onClick={submitComment}
        disabled={content.trim().length === 0 || isPosting}
        className={cn('cursor-pointer rounded-full disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
      >
        <IconSend className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
