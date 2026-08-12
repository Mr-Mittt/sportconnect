package com.sportconnect.social.post.api.service;

import com.sportconnect.social.post.api.dto.CreatePostRequest;
import com.sportconnect.social.post.api.dto.PostResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface PostService {

    PostResponse createPost(UUID userId, CreatePostRequest request);

    /**
     * Creates a {@code GROUP_SYSTEM} post directly, bypassing {@link #createPost}'s validation.
     * Not reachable via the public {@code POST /api/posts} endpoint — {@code createPost} rejects
     * caller-supplied {@code postType == GROUP_SYSTEM} outright, since a self-authored "system"
     * post could otherwise be used to impersonate the system or fabricate a social-graph claim
     * (e.g. a fake "invited by" mention). Intended only for {@code GroupServiceImpl} to call when
     * a new member joins a group (B9).
     */
    void createSystemPost(Long groupId, UUID authorUserId, String content);

    /**
     * Creates a {@code SESSION_POST} directly, bypassing {@link #createPost}'s validation. Not
     * reachable via the public {@code POST /api/posts} endpoint — {@code createPost} rejects
     * caller-supplied {@code postType == SESSION_POST} outright, same spoofing guard as {@code
     * GROUP_SYSTEM}. Intended only for {@code SessionServiceImpl.createSession} to call, inline in
     * the same transaction, so a session and its comment-thread anchor are created or rolled back
     * together. The post is never {@code groupId}-scoped (even for a group-linked session) and
     * carries no {@code sessionId} — {@code post-impl} never needs to resolve which session a post
     * belongs to; {@code session-impl} holds the reverse link ({@code Session.postId}) and is the
     * side that resolves it (see {@code PostGate}'s {@code SESSION_POST} case, which calls back
     * into {@code session-api} with the post's own id). Returns the new post's id so the caller can
     * persist it as {@code Session.postId}.
     */
    Long createSessionPost(UUID authorUserId, String content);

    /**
     * Gated by {@code post-impl}'s {@code PostGate} (A14 —
     * {@code documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md}): throws {@code NotFoundException}
     * if the post doesn't exist, is soft-deleted, or its parent group is inactive; throws {@code
     * ForbiddenException} if it exists but {@code currentUserId} can't see it (non-member of a
     * group post, non-owner of a private/friends post they're not friends with).
     */
    PostResponse getPostById(Long postId, UUID currentUserId);

    /**
     * Batch equivalent of {@link #getPostById}, for callers resolving several posts by id at
     * once (e.g. a group's pinned posts) — avoids one query per post. Posts that don't exist or
     * are soft-deleted are silently absent from the result map rather than throwing, since a
     * caller resolving several ids at once typically wants to render what it can and skip the
     * rest (see {@code GroupServiceImpl.getPinnedPosts}).
     */
    Map<Long, PostResponse> getPostsByIds(List<Long> postIds, UUID currentUserId);
    
    Page<PostResponse> getUserPosts(UUID userId, UUID currentUserId, Pageable pageable);
    
    Page<PostResponse> getPersonalizedFeed(UUID callerId, Pageable pageable);
    
    Page<PostResponse> getGroupPosts(Long groupId, UUID currentUserId, Pageable pageable);
    
    PostResponse updatePost(Long postId, UUID userId, CreatePostRequest request);
    
    void deletePost(Long postId, UUID userId);
    
    /** Same {@code PostGate} contract as {@link #getPostById} — gates on the post before recording the like. */
    void likePost(Long postId, UUID userId);

    /** Same {@code PostGate} contract as {@link #getPostById} — gates on the post before removing the like. */
    void unlikePost(Long postId, UUID userId);

    /**
     * SESSION-10/A17 — bypasses {@code PostGate} entirely, delegating to the same like logic
     * {@link #likePost} uses. Intended only for {@code SessionServiceImpl} to call, after it has
     * already done its own participant/group-member authorization via its own {@code SessionGate}
     * — a {@code SESSION_POST} is otherwise invisible via {@code /api/posts/**}. Throws {@code
     * NotFoundException} if {@code postId} doesn't resolve to an active {@code SESSION_POST} —
     * same {@code postType} check {@code CommentService}'s bypass methods use, and for the same
     * reason: without it, this method could like any post, not just a session's anchor. No
     * secondary-id cross-check is needed here (unlike {@code CommentService.likeSessionComment}'s
     * {@code commentId}) — {@code postId} is the only thing being acted on, and
     * {@code SessionServiceImpl} always passes its own resolved {@code session.getPostId()}.
     */
    void likeSessionPost(Long postId, UUID userId);

    /** Same bypass contract as {@link #likeSessionPost}. */
    void unlikeSessionPost(Long postId, UUID userId);

    Page<PostResponse> getPostsByHashtag(String tag, UUID currentUserId, Pageable pageable);

    Page<PostResponse> getActiveBroadcasts(UUID callerId, Pageable pageable);

    PostResponse updateBroadcastEndTime(Long postId, UUID callerId, LocalDateTime newEndTime);
}
