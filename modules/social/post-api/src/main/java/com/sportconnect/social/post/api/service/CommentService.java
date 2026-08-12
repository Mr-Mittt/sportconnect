package com.sportconnect.social.post.api.service;

import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

public interface CommentService {

    /**
     * Gated by {@code post-impl}'s {@code PostGate} on the parent post (A14 —
     * {@code documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md}): {@code NotFoundException} if the
     * post is unavailable, {@code ForbiddenException} if it exists but isn't visible to
     * {@code userId}.
     */
    CommentResponse createComment(Long postId, UUID userId, CreateCommentRequest request);

    /** Same {@code PostGate} contract as {@link #createComment} — gates on the parent post, not the individual comments returned. */
    Page<CommentResponse> getPostComments(Long postId, UUID currentUserId, Pageable pageable);

    void deleteComment(Long commentId, UUID userId);

    /**
     * {@code NotFoundException} if the comment doesn't exist or is soft-deleted; then gated by
     * {@code PostGate} on the comment's parent post, same contract as {@link #createComment} —
     * closes a gap where a comment on a since-unavailable/invisible post was previously likeable
     * (A14).
     */
    void likeComment(Long commentId, UUID userId);

    /** Same two-step gate as {@link #likeComment} (comment availability, then parent-post {@code PostGate}). */
    void unlikeComment(Long commentId, UUID userId);

    /**
     * SESSION-10/A17 — bypasses {@code PostGate} entirely. Intended only for {@code
     * SessionServiceImpl} to call, after it has already done its own participant/group-member
     * authorization — a {@code SESSION_POST} is otherwise invisible via this module's own gate
     * (see {@code PostGate}'s {@code SESSION_POST} case), by design: the only way to reach a
     * session's comment thread is through {@code session-api}. Throws {@code NotFoundException}
     * if {@code postId} doesn't resolve to an active {@code SESSION_POST} — the {@code postType}
     * check (not just existence) matters here specifically because this method has no other way
     * to confirm {@code postId} is actually a session anchor and not some other post type the
     * caller has no business bypassing {@code PostGate} for.
     */
    CommentResponse createSessionComment(Long postId, UUID userId, CreateCommentRequest request);

    /** Same bypass contract as {@link #createSessionComment}. */
    Page<CommentResponse> getSessionPostComments(Long postId, UUID currentUserId, Pageable pageable);

    /**
     * Same bypass contract as {@link #createSessionComment}, plus one more check: {@code postId}
     * must be {@code commentId}'s actual parent post. Without this, a caller authorized against
     * one session's comment thread could like/unlike a comment on a *different* session's thread
     * (or, without the {@code SESSION_POST} type check alone, any other post's comment) just by
     * knowing/guessing its id — {@code SessionServiceImpl} passes its own resolved {@code
     * session.getPostId()}, never a client-supplied value, so this closes that gap. Throws {@code
     * NotFoundException} if the comment doesn't exist, isn't active, or doesn't belong to
     * {@code postId}.
     */
    void likeSessionComment(Long postId, Long commentId, UUID userId);

    /** Same bypass contract as {@link #likeSessionComment}. */
    void unlikeSessionComment(Long postId, Long commentId, UUID userId);
}
