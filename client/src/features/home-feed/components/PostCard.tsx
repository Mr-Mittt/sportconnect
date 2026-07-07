import { IconHeart, IconHeartFilled, IconMessageCircle } from '@tabler/icons-react';
import { createElement } from 'react';
import { getRampBadgeClasses } from '@/shared/lib/rampStyles';
import { formatRelativeTime } from '@/shared/lib/relativeTime';
import { getSportIcon } from '@/shared/lib/sportIcons';
import { cn } from '@/shared/lib/utils';
import type { SportProfile } from '@/shared/types/sport';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/ui/avatar';
import type { Post } from '../types';

interface PostCardProps {
  post: Post;
  sport: SportProfile;
  onToggleLike: (postId: string) => void;
  onHashtagClick: (tag: string) => void;
}

/**
 * Single feed post. Controlled: likedByMe/likeCount render from props and
 * onToggleLike reports the click — the parent hook owns the source of truth
 * (HF-3 decision; FEED-1's optimistic mutation slots in without changes here).
 */
export function PostCard({ post, sport, onToggleLike, onHashtagClick }: PostCardProps) {
  return (
    <article className="border-hairline rounded-xl border-border bg-surface-2 p-3.5">
      <div className="mb-2 flex items-center gap-2.5">
        <Avatar className="size-9">
          {post.authorAvatarUrl !== undefined && (
            <AvatarImage src={post.authorAvatarUrl} alt="" />
          )}
          <AvatarFallback className="bg-surface-1 text-text-primary">
            {post.authorInitials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="text-sm font-medium text-text-primary">{post.authorName}</div>
          <div className="text-xs text-text-muted">{formatRelativeTime(post.createdAt)}</div>
        </div>
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
      </div>

      <p className="mb-2 text-sm leading-normal text-text-primary">{post.text}</p>

      {post.hashtags.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {post.hashtags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onHashtagClick(tag)}
              className="cursor-pointer rounded text-xs text-text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="border-hairline-t flex items-center gap-4 border-border pt-2">
        <button
          type="button"
          aria-pressed={post.likedByMe}
          aria-label={post.likedByMe ? 'Unlike' : 'Like'}
          onClick={() => onToggleLike(post.id)}
          className={cn(
            'flex cursor-pointer items-center gap-1 rounded p-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-accent',
            post.likedByMe ? 'text-text-danger' : 'text-text-secondary',
          )}
        >
          {post.likedByMe ? (
            <IconHeartFilled className="size-4" aria-hidden="true" />
          ) : (
            <IconHeart className="size-4" aria-hidden="true" />
          )}
          {post.likeCount}
        </button>
        <span className="flex items-center gap-1 text-xs text-text-secondary">
          <IconMessageCircle className="size-4" aria-hidden="true" />
          {post.commentCount}
        </span>
      </div>
    </article>
  );
}
