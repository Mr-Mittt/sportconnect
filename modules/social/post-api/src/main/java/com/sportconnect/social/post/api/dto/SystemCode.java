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
 *
 * <p>SESSION-67: the {@code SESSION_*_CHANGED} codes are written when the host edits a {@code PREPARING} session, one per
 * changed field. Each carries {@code name} (the editor), {@code old} and {@code new}; an empty string means "no value"
 * (the client reads empty {@code old} as "added", empty {@code new} as "removed", both set as "changed", or "updated" for
 * the free-text fields). Location is a name, the start an ISO instant, the duration in minutes, booleans
 * {@code true}/{@code false}. {@code SESSION_FEE_CHANGED} carries {@code oldFeeType}, {@code oldFeeAmountVnd},
 * {@code newFeeType} and {@code newFeeAmountVnd} instead (amount empty unless {@code FIXED});
 * {@code SESSION_ATTRIBUTES_CHANGED} carries {@code name} only.
 */
public enum SystemCode {
    SESSION_JOINED,
    SESSION_LEFT,
    SESSION_STARTED,
    SESSION_RECORDS_UPDATED,
    GROUP_MEMBER_JOINED,
    GROUP_MEMBER_JOINED_INVITED,
    SESSION_TITLE_CHANGED,
    SESSION_LOCATION_CHANGED,
    SESSION_LOCATION_NOTE_CHANGED,
    SESSION_START_CHANGED,
    SESSION_DURATION_CHANGED,
    SESSION_CAPACITY_CHANGED,
    SESSION_FEE_CHANGED,
    SESSION_FEE_NOTE_CHANGED,
    SESSION_AUTO_APPROVE_CHANGED,
    SESSION_VISIBILITY_CHANGED,
    SESSION_INITIAL_SLOT_CHANGED,
    SESSION_MALE_SLOTS_CHANGED,
    SESSION_FEMALE_SLOTS_CHANGED,
    SESSION_GAME_MOOD_CHANGED,
    SESSION_ATTRIBUTES_CHANGED
}
