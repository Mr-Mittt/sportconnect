import { IconMapPin, IconPhoto, IconSpeakerphone } from '@tabler/icons-react';
import { createElement, useLayoutEffect, useRef, useState } from 'react';
import { MAX_POST_LENGTH } from '@/features/feed/types';
import { getSportIcon } from '@/shared/lib/sportIcons';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';

interface CreatePostFormProps {
  currentUser: { firstName: string; fullName: string; avatarUrl: string | null } | undefined;
  /** `asBroadcast` is only ever true if `canBroadcast` was also true — the
   * toggle itself doesn't render otherwise (FEED-7). */
  onSubmit: (content: string, options: { asBroadcast: boolean }) => void;
  isSubmitting: boolean;
  /** Inert for this ticket (FEED-3 delta) — same "affordance exists,
   * destination doesn't yet" pattern as HF-3/HF-4's no-op callbacks. */
  onPhotoClick: () => void;
  onLocationClick: () => void;
  onTagSportClick: () => void;
  /** Shows the "Broadcast" switcher next to Tag sport (FEED-7) — true only
   * on the Groups page, for a selected group's owner/admin. Home Feed never
   * passes true (broadcasts require a specific group). Defaults to false so
   * every other existing call site doesn't need updating. */
  canBroadcast?: boolean;
  /** FEED-10: shows "Couldn't create post. Try again." when the last submit
   * failed. The textarea already clears on submit (see submitPost below),
   * so this is a visibility fix, not a content-preserving retry — the user
   * retypes and submits again. Defaults to false so every other existing
   * call site doesn't need updating. */
  isError?: boolean;
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
 * FEED-3's real post composer — de-mocks the design reference's inert
 * composer card (design-reference-home-feed-v2.html, now the canonical
 * design-reference-home-feed.html) with a working textarea + Post button
 * wired to useCreatePost(). Presentational and controlled like every other
 * Home Feed component (client/CLAUDE.md): owns only its own transient
 * textarea value, clearing itself immediately on submit rather than waiting
 * for the mutation to resolve — same shape as CommentSection's composer.
 *
 * Photo/Location/Tag-sport stay inert mockup buttons per the ticket's scope
 * delta; only content is sent to the backend (postType/groupId/sportId all
 * omitted, so the server defaults to a public USER_FEED post).
 *
 * FEED-7: `canBroadcast` (owner/admin of the selected group, gated by the
 * caller) shows a "Broadcast" toggle next to Tag sport. `isBroadcastOn` is
 * ephemeral, composer-local UI state — same reasoning as `content` — reset
 * to off on every submit, not lifted to the page. The caller decides what
 * `asBroadcast: true` actually means (create vs. update-the-existing-one);
 * this component only reports intent.
 */
export function CreatePostForm({
  currentUser,
  onSubmit,
  isSubmitting,
  onPhotoClick,
  onLocationClick,
  onTagSportClick,
  canBroadcast = false,
  isError = false,
}: CreatePostFormProps) {
  const [content, setContent] = useState('');
  const [isBroadcastOn, setIsBroadcastOn] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mirrors the design reference's autosize() — grow the textarea to fit its
  // content instead of scrolling internally, matching the mockup's rows="1"
  // + reset-then-measure technique.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [content]);

  const hasText = content.trim().length > 0;

  const submitPost = () => {
    const trimmed = content.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed, { asBroadcast: canBroadcast && isBroadcastOn });
    setContent('');
    setIsBroadcastOn(false);
  };

  const TagSportIcon = getSportIcon('ball-football');

  return (
    <div className="border-hairline mb-3.5 rounded-xl border-border bg-surface-2 p-3.5">
      <div className="flex gap-2.5">
        <Avatar className="size-9 shrink-0">
          {currentUser?.avatarUrl != null && <AvatarImage src={currentUser.avatarUrl} alt="" />}
          <AvatarFallback className="text-2xs">
            {currentUser !== undefined ? initialsFor(currentUser.fullName) : ''}
          </AvatarFallback>
        </Avatar>
        <textarea
          ref={textareaRef}
          rows={1}
          value={content}
          onChange={(event) => setContent(event.target.value.slice(0, MAX_POST_LENGTH))}
          placeholder={`What's on your mind${currentUser !== undefined ? `, ${currentUser.firstName}` : ''}?`}
          aria-label="Create a post"
          maxLength={MAX_POST_LENGTH}
          className="min-w-0 flex-1 resize-none border-none bg-transparent py-2 text-sm text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>
      <div className="border-hairline-t mt-1 flex items-center justify-between border-border pt-2.5">
        <div className="flex gap-3.5">
          <button
            type="button"
            onClick={onPhotoClick}
            className="flex cursor-pointer items-center gap-1.5 rounded p-0.5 text-2xs text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {createElement(IconPhoto, { className: 'size-4', 'aria-hidden': true })}
            Photo
          </button>
          <button
            type="button"
            onClick={onLocationClick}
            className="flex cursor-pointer items-center gap-1.5 rounded p-0.5 text-2xs text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {createElement(IconMapPin, { className: 'size-4', 'aria-hidden': true })}
            Location
          </button>
          <button
            type="button"
            onClick={onTagSportClick}
            className="flex cursor-pointer items-center gap-1.5 rounded p-0.5 text-2xs text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {createElement(TagSportIcon, { className: 'size-4', 'aria-hidden': true })}
            Tag sport
          </button>
          {canBroadcast && (
            <button
              type="button"
              aria-pressed={isBroadcastOn}
              onClick={() => setIsBroadcastOn((on) => !on)}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded p-0.5 text-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
                isBroadcastOn ? 'font-medium text-text-accent' : 'text-text-secondary',
              )}
            >
              {createElement(IconSpeakerphone, { className: 'size-4', 'aria-hidden': true })}
              Broadcast
            </button>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={submitPost}
          disabled={!hasText || isSubmitting}
          className={cn('cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
        >
          Post
        </Button>
      </div>
      {isError && (
        <p className="mt-2 text-2xs text-text-danger">Couldn't create post. Try again.</p>
      )}
    </div>
  );
}
