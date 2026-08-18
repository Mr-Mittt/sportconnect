package com.sportconnect.integration;

import com.sportconnect.notification.entity.Notification;
import com.sportconnect.notification.repository.NotificationRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real end-to-end coverage for NTF-1's {@code NotificationGate} (see
 * {@code modules/notification/docs/MVP/NTF-1_MODULE_SCAFFOLDING.md}) — goes through a real
 * {@code MockMvc} HTTP request, real {@code NotificationController}/{@code
 * NotificationServiceImpl}/{@code NotificationGate} beans, and a real H2-backed DB round trip.
 * {@code NotificationGateSpec}/{@code NotificationServiceImplSpec} (in {@code notification-impl})
 * cover the gate's branch logic and the service's wiring to it with collaborators mocked; this
 * class proves {@code PUT /api/notifications/{id}/read} actually rejects/accepts over real HTTP.
 * <p>
 * {@code Notification.recipientUserId} carries no FK to {@code users(id)} (ID-only cross-domain
 * reference, per this module's design), so fixtures use bare random UUIDs rather than real
 * {@code User} rows — nothing under test resolves the recipient against the user table.
 */
class NotificationAccessGateIntegrationTest extends BaseIT {

    @Autowired
    private NotificationRepository notificationRepository;

    private Notification createNotification(UUID recipientId) {
        Notification notification = Notification.builder()
                .recipientUserId(recipientId)
                .type("post.comment.created")
                .entityType("POST")
                .entityId("42")
                .isRead(false)
                .build();
        return notificationRepository.save(notification);
    }

    @Test
    void markAsRead_owner_returnsOk() throws Exception {
        UUID recipientId = UUID.randomUUID();
        Long notificationId = createNotification(recipientId).getId();
        authenticateAs(recipientId);

        mockMvc.perform(put("/api/notifications/{notificationId}/read", notificationId))
                .andExpect(status().isOk());
    }

    @Test
    void markAsRead_nonOwner_returnsForbidden() throws Exception {
        UUID recipientId = UUID.randomUUID();
        Long notificationId = createNotification(recipientId).getId();
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(put("/api/notifications/{notificationId}/read", notificationId))
                .andExpect(status().isForbidden());
    }

    @Test
    void markAsRead_nonExistentNotification_returnsNotFound() throws Exception {
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(put("/api/notifications/{notificationId}/read", 999999L))
                .andExpect(status().isNotFound());
    }

    @Test
    void markAsRead_withoutAuthentication_returnsUnauthorized() throws Exception {
        UUID recipientId = UUID.randomUUID();
        Long notificationId = createNotification(recipientId).getId();

        mockMvc.perform(put("/api/notifications/{notificationId}/read", notificationId))
                .andExpect(status().isUnauthorized());
    }
}
