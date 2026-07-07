import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHomeFeedData } from './useHomeFeedData';

describe('useHomeFeedData', () => {
  it('returns the convention shape with all five datasets populated', () => {
    const { result } = renderHook(() => useHomeFeedData());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.data.sportProfiles.length).toBeGreaterThan(0);
    expect(result.current.data.posts.length).toBeGreaterThan(0);
    expect(result.current.data.upcomingMatches.length).toBeGreaterThan(0);
    expect(result.current.data.hashtags.length).toBeGreaterThan(0);
    expect(result.current.data.broadcasts.length).toBeGreaterThan(0);
  });

  it('toggleLike flips likedByMe and adjusts likeCount, reversibly', () => {
    const { result } = renderHook(() => useHomeFeedData());
    const before = result.current.data.posts[0];
    expect(before.likedByMe).toBe(false);

    act(() => result.current.toggleLike(before.id));
    const liked = result.current.data.posts[0];
    expect(liked.likedByMe).toBe(true);
    expect(liked.likeCount).toBe(before.likeCount + 1);

    act(() => result.current.toggleLike(before.id));
    const reverted = result.current.data.posts[0];
    expect(reverted.likedByMe).toBe(false);
    expect(reverted.likeCount).toBe(before.likeCount);
  });

  it('count math stays correct across repeated toggling (HF-9 checklist)', () => {
    const { result } = renderHook(() => useHomeFeedData());
    const before = result.current.data.posts[0];

    for (let i = 0; i < 7; i++) {
      act(() => result.current.toggleLike(before.id));
    }
    // Odd number of flips → liked, exactly +1 (never accumulates drift)
    expect(result.current.data.posts[0].likedByMe).toBe(true);
    expect(result.current.data.posts[0].likeCount).toBe(before.likeCount + 1);

    act(() => result.current.toggleLike(before.id));
    expect(result.current.data.posts[0].likedByMe).toBe(false);
    expect(result.current.data.posts[0].likeCount).toBe(before.likeCount);
  });

  it('toggleLike leaves other posts untouched', () => {
    const { result } = renderHook(() => useHomeFeedData());
    const otherBefore = result.current.data.posts[1];
    act(() => result.current.toggleLike(result.current.data.posts[0].id));
    expect(result.current.data.posts[1]).toEqual(otherBefore);
  });
});
