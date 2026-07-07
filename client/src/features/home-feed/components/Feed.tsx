import type { SportKey, SportProfile } from '@/shared/types/sport';
import type { Post } from '../types';
import { PostCard } from './PostCard';

interface FeedProps {
  posts: Post[];
  activeSport: SportKey | 'all';
  sportsByKey: Record<SportKey, SportProfile>;
  onToggleLike: (postId: string) => void;
  onHashtagClick: (tag: string) => void;
}

export function Feed({ posts, activeSport, sportsByKey, onToggleLike, onHashtagClick }: FeedProps) {
  const visiblePosts =
    activeSport === 'all' ? posts : posts.filter((post) => post.sport === activeSport);

  if (visiblePosts.length === 0) {
    return (
      <div className="py-6 text-center text-2sm text-text-muted">No posts yet for this sport.</div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {visiblePosts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          sport={sportsByKey[post.sport]}
          onToggleLike={onToggleLike}
          onHashtagClick={onHashtagClick}
        />
      ))}
    </div>
  );
}
