package com.sportconnect.notification.access;

import com.sportconnect.common.access.ResourceGate;
import com.sportconnect.notification.entity.Notification;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * {@code notification-impl}'s {@link ResourceGate} implementation — see
 * {@code documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md}. Unlike {@code post-impl}'s
 * {@code PostGate}/{@code session-impl}'s {@code SessionGate}, a {@code Notification} has no
 * soft-delete/lifecycle concept of its own, so {@link #isAvailable} is trivially always
 * {@code true} — {@link ResourceGate#require} already turns a {@code null} resource into
 * {@code NotFoundException} before this is ever evaluated. The one real question is visibility:
 * a notification belongs to exactly one recipient.
 */
@Component
public class NotificationGate implements ResourceGate<Notification> {

    @Override
    public boolean isAvailable(Notification notification) {
        return true;
    }

    @Override
    public boolean isVisibleTo(Notification notification, UUID viewerId) {
        return notification.getRecipientUserId().equals(viewerId);
    }
}
