package com.sportconnect.session.api.dto;

import java.util.List;

/**
 * SESSION-GROUP-2 — the groups of a group's Sessions tab. Each bucket is a fixed set of statuses; {@code PREPARING} is its own
 * bucket and is never mixed into {@code SCHEDULED} (owner, 2026-11-19).
 */
public enum GroupSessionBucket {
    /** {@code ONGOING}. */
    ONGOING(List.of(SessionStatus.ONGOING), false),
    /** {@code SCHEDULED} only. */
    SCHEDULED(List.of(SessionStatus.SCHEDULED), false),
    /** {@code PREPARING}: a draft that its creator can still edit. */
    PREPARING(List.of(SessionStatus.PREPARING), false),
    /** {@code COMPLETED} and {@code CANCELLED}, newest first. */
    HISTORY(List.of(SessionStatus.COMPLETED, SessionStatus.CANCELLED), true);

    private final List<SessionStatus> statuses;
    private final boolean newestFirst;

    GroupSessionBucket(List<SessionStatus> statuses, boolean newestFirst) {
        this.statuses = statuses;
        this.newestFirst = newestFirst;
    }

    public List<SessionStatus> statuses() {
        return statuses;
    }

    /** History lists the newest first; every other bucket lists by start time, soonest first. */
    public boolean newestFirst() {
        return newestFirst;
    }
}
