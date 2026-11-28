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
 *
 * <p>SESSION-GROUP-4: the {@code GROUP_SESSION_*} codes are the {@code GROUP_SYSTEM} posts written when the owner or an admin
 * changes how a group's regular sessions are generated. All carry {@code name} (who changed it) and {@code mode}
 * ({@code WEEKLY} or {@code MONTHLY}); {@code GROUP_SESSION_RECURRENCE_ADDED}, {@code _UPDATED} and {@code _DELETED} also
 * carry {@code day} (the weekday number 1 to 7, Monday first, or the day of the month, per {@code mode}) and {@code time}
 * ({@code HH:mm}, empty if none); {@code GROUP_SESSION_MODE_CHANGED} carries {@code mode} as the new mode.
 * {@code GROUP_SESSION_GENERATION_ON} and {@code _OFF} carry {@code name} and {@code mode}.
 *
 * <p>SESSION-78: {@code GROUP_STATISTICS_ON} and {@code GROUP_STATISTICS_OFF} are the {@code GROUP_SYSTEM} posts written when the
 * owner or an admin switches the group's statistics and leaderboard; they carry {@code name} only.
 *
 * <p>SESSION-55: {@code GROUP_SEASON_CREATED}, {@code _STARTED}, {@code _FINALISED} and {@code _CANCELLED} are the {@code GROUP_SYSTEM} posts of a group season's life; all carry {@code name} (the season's name), {@code startDate} and {@code endDate} (ISO local dates); {@code _CREATED} and {@code _CANCELLED} also carry {@code by} (who did it).
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
    SESSION_ATTRIBUTES_CHANGED,
    GROUP_SESSION_RECURRENCE_ADDED,
    GROUP_SESSION_RECURRENCE_UPDATED,
    GROUP_SESSION_RECURRENCE_DELETED,
    GROUP_SESSION_GENERATION_ON,
    GROUP_SESSION_GENERATION_OFF,
    GROUP_SESSION_MODE_CHANGED,
    GROUP_STATISTICS_ON,
    GROUP_STATISTICS_OFF,
    GROUP_STATS_CONFIG_CHANGED,
    GROUP_SEASON_CREATED,
    GROUP_SEASON_STARTED,
    GROUP_SEASON_FINALISED,
    GROUP_SEASON_CANCELLED
}
