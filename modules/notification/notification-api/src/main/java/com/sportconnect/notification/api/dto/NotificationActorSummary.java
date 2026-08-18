package com.sportconnect.notification.api.dto;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * NTF-4: one entry of {@code NotificationResponse.actors} — the bounded (≤ 3) actor list
 * resolved to a display name, batch-fetched via {@code user-api}'s {@code getUsersByIds} rather
 * than the client resolving each actorId itself.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationActorSummary {

    private UUID id;
    private String fullName;
}
