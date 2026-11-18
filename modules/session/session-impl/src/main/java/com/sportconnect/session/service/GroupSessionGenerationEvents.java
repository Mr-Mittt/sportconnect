package com.sportconnect.session.service;

import java.time.LocalDate;
import java.util.List;

/**
 * SESSION-GROUP-5 — what asks the generator to look at a group again. Both are published inside the changing transaction and
 * handled only after it commits ({@link GroupSessionGenerationListener}), so the planner, which runs in its own transaction,
 * sees the new state and a failure to generate can never undo the change that caused it.
 */
public final class GroupSessionGenerationEvents {

    private GroupSessionGenerationEvents() {
    }

    /** An owner or admin switched generation on, switched the mode, or added or edited a recurrence configuration. */
    public record ConfigChanged(Long groupId) {
    }

    /** A group and the local date of a regular session that has just completed or been cancelled. */
    public record GroupDay(Long groupId, LocalDate occurrenceDate) {
    }

    /** Regular sessions ended (completed or cancelled): their days may be over, which queues the next day. */
    public record RegularSessionsEnded(List<GroupDay> days) {
    }
}
