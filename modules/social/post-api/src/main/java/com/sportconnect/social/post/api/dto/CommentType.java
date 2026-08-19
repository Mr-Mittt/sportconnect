package com.sportconnect.social.post.api.dto;

/**
 * Discriminates a user's own comment from a server-written system entry, the same way
 * {@link PostType#GROUP_SYSTEM} does for posts (B9). {@code SESSION_SYSTEM} entries are written
 * only by {@code session-impl}, at genuine participant/status transitions, and can never be
 * created, replied to, liked, or deleted by a caller.
 */
public enum CommentType {
    USER,
    SESSION_SYSTEM
}
