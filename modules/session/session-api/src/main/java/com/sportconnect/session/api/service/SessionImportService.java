package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.ImportApplyResponse;
import com.sportconnect.session.api.dto.ImportPreviewResponse;
import com.sportconnect.session.api.dto.ImportSessionsRequest;

import java.util.UUID;

/**
 * SESSION-70 — imports finished group sessions with their games (admin only; the controller gates the role). The caller's id
 * is for the log only: the sessions belong to the request's host.
 */
public interface SessionImportService {

    /**
     * Matches the request without writing anything: every session with its games and the members the names resolved to, and
     * the names that could not be settled. Fails with a coded 400/404 when the request itself is wrong (group, location, host,
     * dates, games), never because a name is unresolved.
     */
    ImportPreviewResponse preview(UUID callerId, ImportSessionsRequest request);

    /**
     * Creates the sessions. Refuses the whole call (409 {@code SESSION_IMPORT_UNRESOLVED_NAMES}) before any write while a name is
     * unresolved. Each session is its own transaction: one failing never undoes the others, and a session already there (same
     * group, title and start) is skipped, so a repeated call is safe. Sends no notification and writes no system comment.
     */
    ImportApplyResponse apply(UUID callerId, ImportSessionsRequest request);
}
