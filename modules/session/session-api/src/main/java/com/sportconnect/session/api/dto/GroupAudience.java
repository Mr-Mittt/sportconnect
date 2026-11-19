package com.sportconnect.session.api.dto;

/**
 * SESSION-GROUP-1 — who a group session was made for. It decides only who is <b>notified</b> (when the session is created,
 * and when it is cancelled): every member of the group can still see and join the session, and no {@code INVITED}
 * participant row is created (the same as sharing a standalone session).
 */
public enum GroupAudience {
    /** Every member of the group (the default). */
    ALL_MEMBERS,
    /** Only the members named in {@code CreateSessionRequest.audienceUserIds}. */
    SPECIFIC
}
