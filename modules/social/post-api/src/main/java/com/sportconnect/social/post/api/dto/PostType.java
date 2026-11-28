package com.sportconnect.social.post.api.dto;

public enum PostType {
    USER_FEED,
    GROUP_POST,
    GROUP_BROADCAST,
    GROUP_SYSTEM,
    SESSION_POST,
    /** SESSION-55: the comment-thread and like anchor of a group season; like {@link #SESSION_POST} it is in no feed and access is decided by the owning domain. */
    SEASON_POST;

    /** A post that exists only as the anchor of another domain's thread (a session or a season): never in a feed, never edited or deleted directly. */
    public boolean isThreadAnchor() {
        return this == SESSION_POST || this == SEASON_POST;
    }
}
