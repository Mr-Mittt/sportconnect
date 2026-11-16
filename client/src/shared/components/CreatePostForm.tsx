import { IconBallFootball, IconMapPin, IconPhoto, IconSpeakerphone } from '@tabler/icons-react';
import { createElement, useMemo, useRef, useState } from 'react';
import { MAX_POST_LENGTH } from '@/features/feed/types';
import { useUnsavedChangesGuard } from '@/shared/hooks/useUnsavedChangesGuard';
import { isEmptyDraft, serialize, trimSegments } from '@/shared/lib/mentionMarkup';
import { useOverridableText } from '@/shared/lib/useOverridableText';
import { cn } from '@/shared/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import { Button, POST_BUTTON_DISABLED_OVERRIDE } from '@/shared/ui/button';
import { MentionInput, type MentionDraft, type MentionInputHandle, type MentionSource } from './MentionInput';
import { UnsavedPostConfirmDialog } from './UnsavedPostConfirmDialog';

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
  /** CLIENT-ERR-6: code-specific failure text (e.g. not a member of the group); replaces the generic line when set. */
  errorText?: string;
  /** CLIENT-GL-50 part 2: who an `@` in the post can tag (a user post: the caller's friends, a group post: the group's
   * members). Absent = nobody can be tagged and the text is sent as typed. */
  mentionSource?: MentionSource;
  /** CLIENT-I18N-4: i18next `"namespace:key.path"` prefix overriding this component's default
   * copy (`sharedComponents.createPostForm.*`) for a specific caller. No current caller passes
   * this. */
  i18nOverridePrefix?: string;
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
 * CLIENT-GL-50 part 2: the box is a `MentionInput` in its multi-line mode: `@` tags a friend (user post) or a group
 * member (group post), Enter adds a line, the Post button sends. The text is stored with the tags as `@[Name](id)`.
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
 *
 * PROFILE-10: unsubmitted `content` is a real draft the caller could lose by navigating away
 * (in-app, or closing/refreshing the tab) — `useUnsavedChangesGuard(hasText)` owns both leave-
 * points, same primitive `/profile`'s Settings-tab guard uses (`shared/hooks/`). Every hosting page
 * (Home Feed, Groups, `/profile`) gets this for free with zero per-page wiring, since it lives
 * entirely inside this component. No tab-switch leg (unlike Settings) — this composer isn't tied to
 * a page tab — and no Save option in the confirm dialog, since a draft here has nothing to persist.
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
  errorText,
  mentionSource,
  i18nOverridePrefix,
}: CreatePostFormProps) {
  const t = useOverridableText('sharedComponents', i18nOverridePrefix);
  const [draft, setDraft] = useState<MentionDraft>({ segments: [], stored: '', plain: '' });
  const [isBroadcastOn, setIsBroadcastOn] = useState(false);
  const inputHandle = useRef<MentionInputHandle>(null);
  const [query, setQuery] = useState<string | null>(null);

  // A person already tagged is not offered again.
  const options = useMemo(() => {
    if (query === null) return [];
    const tagged = new Set(draft.segments.flatMap((segment) => (segment.kind === 'mention' ? [segment.userId] : [])));
    return (mentionSource?.options ?? []).filter((person) => !tagged.has(person.id));
  }, [query, draft.segments, mentionSource?.options]);

  const hasText = !isEmptyDraft(draft.segments);
  const unsavedGuard = useUnsavedChangesGuard(hasText);

  const submitPost = () => {
    if (!hasText) return;
    // The text is stored as typed (tags as `@[Name](id)`), trimmed at both ends; inner line breaks stay.
    onSubmit(serialize(trimSegments(draft.segments)), { asBroadcast: canBroadcast && isBroadcastOn });
    inputHandle.current?.clear();
    setIsBroadcastOn(false);
  };

  return (
    <div className="border-hairline mb-3.5 rounded-xl border-border bg-surface-2 p-3.5">
      <div className="flex gap-2.5">
        <Avatar className="size-9 shrink-0">
          {currentUser?.avatarUrl != null && <AvatarImage src={currentUser.avatarUrl} alt="" />}
          <AvatarFallback className="text-2xs">
            {currentUser !== undefined ? initialsFor(currentUser.fullName) : ''}
          </AvatarFallback>
        </Avatar>
        <MentionInput
          ref={inputHandle}
          multiline
          ariaLabel={t('createPostForm.ariaLabel')}
          placeholder={
            currentUser !== undefined
              ? t('createPostForm.placeholderWithName', { firstName: currentUser.firstName })
              : t('createPostForm.placeholderDefault')
          }
          maxLength={MAX_POST_LENGTH}
          options={options}
          pickerLabel={t('createPostForm.mentionLabel')}
          onQueryChange={(next) => {
            setQuery(next);
            mentionSource?.onQueryChange(next);
          }}
          onChange={setDraft}
          // Enter adds a line here; the Post button below sends.
          onSubmit={submitPost}
        />
      </div>
      <div className="border-hairline-t mt-1 flex items-center justify-between gap-2 border-border pt-2.5">
        {/* PROFILE-7: scrolls within itself instead of the page overflowing
            sideways — same overflow-x-auto/shrink-0 idiom NavTabs already
            uses (HF-8). A narrow viewport alone never overflowed this row;
            it only does inside a tab-rail layout (ProfileTabs/GroupTabs),
            which leaves this card too little width for three labeled
            buttons plus the Post button on one line. */}
        <div className="flex min-w-0 flex-1 gap-3.5 overflow-x-auto">
          <button
            type="button"
            onClick={onPhotoClick}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded p-0.5 text-2xs text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {createElement(IconPhoto, { className: 'size-4', 'aria-hidden': true })}
            {t('createPostForm.photo')}
          </button>
          <button
            type="button"
            onClick={onLocationClick}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded p-0.5 text-2xs text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {createElement(IconMapPin, { className: 'size-4', 'aria-hidden': true })}
            {t('createPostForm.location')}
          </button>
          <button
            type="button"
            onClick={onTagSportClick}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded p-0.5 text-2xs text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
          >
            {/* SPORT-4: a generic "tag a sport" glyph (same role as the Location
                pin above), not bound to any specific SportProfile — stays a
                plain Tabler icon rather than switching to SportIcon. */}
            {createElement(IconBallFootball, { className: 'size-4', 'aria-hidden': true })}
            {t('createPostForm.tagSport')}
          </button>
          {canBroadcast && (
            <button
              type="button"
              aria-pressed={isBroadcastOn}
              onClick={() => setIsBroadcastOn((on) => !on)}
              className={cn(
                'flex shrink-0 cursor-pointer items-center gap-1.5 rounded p-0.5 text-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
                isBroadcastOn ? 'font-medium text-text-accent' : 'text-text-secondary',
              )}
            >
              {createElement(IconSpeakerphone, { className: 'size-4', 'aria-hidden': true })}
              {t('createPostForm.broadcast')}
            </button>
          )}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={submitPost}
          disabled={!hasText || isSubmitting}
          className={cn('shrink-0 cursor-pointer disabled:cursor-default', POST_BUTTON_DISABLED_OVERRIDE)}
        >
          {t('createPostForm.post')}
        </Button>
      </div>
      {isError && (
        <p className="mt-2 text-2xs text-text-danger">{errorText ?? t('createPostForm.error')}</p>
      )}
      <UnsavedPostConfirmDialog
        isOpen={unsavedGuard.isLeaveDialogOpen}
        onStay={unsavedGuard.cancelLeave}
        onLeave={unsavedGuard.proceed}
      />
    </div>
  );
}
