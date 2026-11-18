package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * SESSION-66 — what a share did. {@code sent} friends were notified; {@code skipped} were left out without error
 * (not a friend of the caller, the caller's own id, already {@code JOINED}, {@code REQUESTED} or {@code INVITED}
 * in the session, a deactivated account). Duplicate ids in the request count once, so {@code sent + skipped} is the number of distinct ids asked for.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionShareResponse {

    private int sent;

    private int skipped;
}
