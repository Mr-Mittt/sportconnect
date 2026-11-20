package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * CLIENT-GROUP-SESSION-5 - one chosen member of a {@code SPECIFIC} audience, resolved for display (name and avatar), so the
 * recurrence form can show who is picked without a lookup per person. A display lookup: a deactivated account keeps its real name.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupSessionAudienceMember {

    private UUID id;
    private String name;
    private String avatarUrl;
}
