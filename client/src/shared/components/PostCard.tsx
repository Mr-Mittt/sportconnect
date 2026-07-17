import {
  IconDotsVertical,
  IconHeart,
  IconHeartFilled,
  IconMessageCircle,
} from '@tabler/icons-react';
import { createElement } from 'react';
import type { Post } from '@/features/feed/types';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { formatRelativeTime } from '@/shared/lib/relativeTime';
import { getSportIcon } from '@/shared/lib/sportIcons';
import { cn } from '@/shared/lib/utils';
import type { SportProfile } from '@/shared/types/sport';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { HashtagText } from './HashtagText';

interface PostCardProps {
  post: Post;
  /** Resolved sport badge, or null when post.sportId doesn't map to a known
   * SportProfile (e.g. a sport outside the temporary sportIdMap, or no
   * sportId at all) — renders with no badge rather than crashing. */
  sport: SportProfile | null;
  /** The logged-in user's id — the "..." delete menu only renders when this
   * matches post.userId. undefined (session not yet resolved) hides it. */
  currentUserId: string | undefined;
  /** Resolved name of post.groupId, or null to render just the author name.
   * Feed decides null vs. resolved: contexts that blend posts from multiple
   * groups (Home Feed, Groups page's "All" view) pass the resolved name so
   * "username > groupname" disambiguates which group a post belongs to;
   * a specific group's own feed passes null since every post there already
   * shares that one group. */
  groupName: string | null;
  /** Clicking the resolved group name (only rendered when groupName isn't
   * null) — undefined renders groupName as static text instead of a link,
   * for a caller (e.g. HashtagPostsModal) with no group-scoped destination
   * to send the user to. */
  onGroupClick?: () => void;
  onToggleLike: (postId: number) => void;
  onHashtagClick: (tag: string) => void;
  onDeletePost: (postId: number) => void;
  onOpenComments: (postId: number) => void;
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
 * Single feed post. Controlled: isLikedByCurrentUser/likeCount render from
 * props and onToggleLike reports the click — the parent hook owns the
 * source of truth (HF-3 decision; FEED-1's optimistic mutations slot in
 * without changes here).
 *
 * `userFullName` is nullable on the wire (never actually null in practice
 * since backend ticket A9 shipped, but the type still allows it) — falls
 * back to "Unknown User", same convention CommentServiceImpl already uses
 * server-side for a comparable gap.
 *
 * Hashtags render inline within `post.content` itself (`HashtagText`) rather
 * than as a separate row of chips repeating the same tags below the text —
 * `post.hashtags` (the backend's structured extraction) isn't read here at
 * all; `HashtagText` re-derives clickable spans directly from the content
 * string via the same `#(\w+)` pattern the backend used to populate that
 * array in the first place, so the two always agree for real data. Emitted
 * WITH a leading '#', matching the existing HF-5/HF-6 hashtag-click
 * convention (`onHashtagClick('#tag')`).
 *
 * FEED-7: the comment button renders disabled for a `GROUP_BROADCAST` post
 * (user decision — commenting on broadcasts isn't wired up yet, "for now").
 * Like stays fully functional either way.
 */
export function PostCard({
  post,
  sport,
  currentUserId,
  groupName,
  onGroupClick,
  onToggleLike,
  onHashtagClick,
  onDeletePost,
  onOpenComments,
}: PostCardProps) {
  const displayName = post.userFullName ?? 'Unknown User';
  const isOwnPost = currentUserId !== undefined && post.userId === currentUserId;

  return (
    <article className="border-hairline rounded-xl border-border bg-surface-2 p-3.5">
      <div className="mb-2 flex items-center gap-2.5">
        <Avatar className="size-9">
          {post.userAvatarUrl !== null && <AvatarImage src={post.userAvatarUrl} alt="" />}
          <AvatarFallback className="bg-surface-1 text-text-primary">
            {initialsFor(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="text-sm font-medium text-text-primary">
            {displayName}
            {groupName !== null && (
              <>
                <span className="text-text-muted"> &gt; </span>
                {onGroupClick !== undefined ? (
                  <button
                    type="button"
                    onClick={onGroupClick}
                    className="cursor-pointer text-text-secondary underline-offset-2 hover:text-text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
                  >
                    {groupName}
                  </button>
                ) : (
                  <span className="text-text-secondary">{groupName}</span>
                )}
              </>
            )}
          </div>
          <div className="text-xs text-text-muted">{formatRelativeTime(post.createdAt)}</div>
        </div>
        {sport !== null && (
          <span
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs',
              getRampBadgeClasses(sport.colorRamp),
            )}
          >
            {/* createElement keeps the lookup out of a capitalized render-local,
                which react-hooks/static-components would flag as a new component */}
            {createElement(getSportIcon(sport.icon), { className: 'size-3', 'aria-hidden': true })}
            {sport.label}
          </span>
        )}
        {isOwnPost && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Post options"
                className="cursor-pointer rounded p-1 text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
              >
                <IconDotsVertical className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onSelect={() => onDeletePost(post.id)}
                className="text-text-danger"
              >
                Delete post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <HashtagText
        text={post.content}
        onHashtagClick={onHashtagClick}
        className="mb-2 text-sm leading-normal text-text-primary"
      />

      <div className="border-hairline-t flex items-center gap-4 border-border pt-2">
        <button
          type="button"
          aria-pressed={post.isLikedByCurrentUser}
          aria-label={post.isLikedByCurrentUser ? 'Unlike' : 'Like'}
          onClick={() => onToggleLike(post.id)}
          className={cn(
            'flex cursor-pointer items-center gap-1 rounded p-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
            post.isLikedByCurrentUser ? 'text-text-danger' : 'text-text-secondary',
          )}
        >
          {post.isLikedByCurrentUser ? (
            <IconHeartFilled className="size-4" aria-hidden="true" />
          ) : (
            <IconHeart className="size-4" aria-hidden="true" />
          )}
          {post.likeCount}
        </button>
        <button
          type="button"
          aria-label="View comments"
          disabled={post.postType === 'GROUP_BROADCAST'}
          onClick={() => onOpenComments(post.id)}
          className="flex cursor-pointer items-center gap-1 rounded p-0.5 text-xs text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent disabled:cursor-default disabled:opacity-50"
        >
          <IconMessageCircle className="size-4" aria-hidden="true" />
          {post.commentCount}
        </button>
      </div>
    </article>
  );
}
