package com.sportconnect.social.post.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * One system comment to write into a session's discussion thread (SESSION-21). Batch input for
 * {@code CommentService.createSystemSessionComments}, so a caller starting many sessions at once
 * ({@code SessionGenerationService.startOngoingSessions}, 200 per pass) writes them in one call
 * instead of one per session.
 *
 * <p>{@code authorUserId} is always the session's {@code createdBy} — a system comment has no real
 * author, and this codebase resolves that the same way B9 did for {@code GROUP_SYSTEM} posts
 * (a real user in the NOT NULL column, with the type column carrying the "this is a system entry"
 * signal) rather than by making the column nullable.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SystemSessionCommentRequest {

    private Long postId;

    private UUID authorUserId;

    private String content;
}
