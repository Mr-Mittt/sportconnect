package com.sportconnect.social.post.api.dto;

/**
 * SESSION-GL-63: the stable code of a server-written entry (a session system comment, the group welcome post). The
 * server stores the code and its params next to the English text; the client shows its own en/vi sentence for the
 * code, and falls back to the stored text for an entry without one (every row written before this change) or a code it
 * does not know. A new value is a client-visible enum: the client's case belongs in the same change or a ticket filed
 * with it (CLIENT-NOTIF-4 rule).
 *
 * <p>Params, all strings: {@code SESSION_JOINED}, {@code SESSION_LEFT}, {@code SESSION_RECORDS_UPDATED} and
 * {@code GROUP_MEMBER_JOINED} carry {@code name}; {@code GROUP_MEMBER_JOINED_INVITED} carries {@code name} and
 * {@code inviter}; {@code SESSION_STARTED} carries none. Names are baked in at write time, so a later rename does not
 * rewrite history.
 */
public enum SystemCode {
    SESSION_JOINED,
    SESSION_LEFT,
    SESSION_STARTED,
    SESSION_RECORDS_UPDATED,
    GROUP_MEMBER_JOINED,
    GROUP_MEMBER_JOINED_INVITED
}
