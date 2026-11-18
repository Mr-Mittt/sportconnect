package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.GroupSessionRecurrenceRequest;
import com.sportconnect.session.api.dto.GroupSessionRecurrenceResponse;
import com.sportconnect.session.api.dto.GroupSessionSettingsResponse;
import com.sportconnect.session.api.dto.UpdateGroupSessionSettingsRequest;

import java.util.List;
import java.util.UUID;

/**
 * SESSION-GROUP-4 — how a group's regular sessions are generated: the group's settings (on or off, weekly or monthly) and its
 * recurrence configurations. Read is open to any member of the group; every write is for the group's owner and admins. A group
 * that does not exist or is no longer active is 404 {@code GROUP_NOT_FOUND} before any permission answer. This ticket stores
 * and serves the configuration; generating sessions from it is SESSION-GROUP-5.
 *
 * <p>Every change (a configuration added, updated or deleted, generation switched on or off, the mode switched) also writes a
 * {@code GROUP_SYSTEM} post in the group's feed, authored as the group's current owner, so members see what changed.
 */
public interface GroupSessionConfigService {

    /** The group's settings; {@code enabled = false} and {@code WEEKLY} when none was ever saved. */
    GroupSessionSettingsResponse getSettings(Long groupId, UUID callerId);

    /** Applies the non-null fields; a change writes its system post, an unchanged value writes nothing. */
    GroupSessionSettingsResponse updateSettings(Long groupId, UUID callerId, UpdateGroupSessionSettingsRequest request);

    /** Every configuration of the group, both modes, ordered by mode, day and start time. */
    List<GroupSessionRecurrenceResponse> getRecurrences(Long groupId, UUID callerId);

    /** Adds a configuration in the group's current mode. 409 {@code SESSION_RECURRENCE_DAY_LIMIT} on the sixth of a day. */
    GroupSessionRecurrenceResponse createRecurrence(Long groupId, UUID callerId, GroupSessionRecurrenceRequest request);

    /** Replaces a configuration (its mode never changes). */
    GroupSessionRecurrenceResponse updateRecurrence(Long groupId, Long recurrenceId, UUID callerId, GroupSessionRecurrenceRequest request);

    /** Hard delete. */
    void deleteRecurrence(Long groupId, Long recurrenceId, UUID callerId);
}
