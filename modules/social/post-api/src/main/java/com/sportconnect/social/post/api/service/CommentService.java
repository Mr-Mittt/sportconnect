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
}
