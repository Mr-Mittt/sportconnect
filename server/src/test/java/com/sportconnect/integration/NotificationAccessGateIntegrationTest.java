package com.sportconnect.integration;

import com.sportconnect.notification.entity.Notification;
import com.sportconnect.notification.repository.NotificationRepository;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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

    @Autowired
    private SessionRepository sessionRepository;

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
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("NOTIFICATION_FORBIDDEN"))
                .andExpect(jsonPath("$.errorParams").doesNotExist())
                .andExpect(jsonPath("$.message").value("You do not have access to this notification"));
    }

    @Test
    void markAsRead_nonExistentNotification_returnsNotFound() throws Exception {
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(put("/api/notifications/{notificationId}/read", 999999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("NOTIFICATION_NOT_FOUND"))
                .andExpect(jsonPath("$.errorParams").doesNotExist())
                .andExpect(jsonPath("$.message").value("Notification not found"));
    }

    @Test
    void markAsRead_withoutAuthentication_returnsUnauthorized() throws Exception {
        UUID recipientId = UUID.randomUUID();
        Long notificationId = createNotification(recipientId).getId();

        mockMvc.perform(put("/api/notifications/{notificationId}/read", notificationId))
                .andExpect(status().isUnauthorized());
    }

    /** NTF-5: the list has no error path of its own; another user's rows are simply not in it. */
    @Test
    void list_onlyReturnsTheCallersOwnNotifications_andNeverErrors() throws Exception {
        createNotification(UUID.randomUUID());
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(get("/api/notifications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.errorCode").doesNotExist())
                .andExpect(jsonPath("$.data.content").isEmpty());
    }

    /**
     * SESSION-49: the list resolves each session notification's title through the session domain. It used to 500 for
     * the whole page when one referenced session had no title; titles are required again, so the page is a 200 and the
     * entity title comes through.
     */
    @Test
    void list_withASessionNotification_returns200WithTheSessionsTitle() throws Exception {
        UUID recipientId = UUID.randomUUID();
        Long sessionId = sessionRepository.save(Session.builder().title("Friday game")
                .isPublic(true).postId(System.nanoTime()).sessionType(SessionType.STANDALONE)
                .createdBy(UUID.randomUUID()).sportId(1L).scheduledStart(Instant.now().plusSeconds(86400))
                .status(SessionStatus.PREPARING).capacity(10).initialSlot(0).autoApprove(true).build()).getId();
        notificationRepository.save(Notification.builder()
                .recipientUserId(recipientId).type("session.participant.joined")
                .entityType("SESSION").entityId(String.valueOf(sessionId)).isRead(false).build());
        authenticateAs(recipientId);

        try {
            mockMvc.perform(get("/api/notifications"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.content[0].entityTitle").value("Friday game"));
        } finally {
            // Leave no session behind for the other integration classes that share this database.
            notificationRepository.deleteAll();
            sessionRepository.deleteById(sessionId);
        }
    }

    private Notification createNotification(UUID recipientId, boolean isRead, String message) {
        return notificationRepository.save(Notification.builder()
                .recipientUserId(recipientId)
                .type("session.join_request.rejected")
                .entityType("SESSION")
                .entityId("42")
                .isRead(isRead)
                .message(message)
                .build());
    }

    private List<Notification> notificationsOf(UUID recipientId) {
        return notificationRepository.findAll().stream()
                .filter(n -> n.getRecipientUserId().equals(recipientId))
                .toList();
    }

    /** NTF-8: the list carries the notification's message (null when there is none). */
    @Test
    void list_returnsTheMessageOfANotificationThatHasOne() throws Exception {
        UUID recipientId = UUID.randomUUID();
        createNotification(recipientId, false, "The session is full");
        authenticateAs(recipientId);

        mockMvc.perform(get("/api/notifications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].message").value("The session is full"));
    }

    /**
     * NTF-8: {@code DELETE /api/notifications/read} hard-deletes the caller's read notifications and nothing else:
     * the caller's unread one stays, and so does another user's read one.
     */
    @Test
    void deleteRead_removesTheCallersReadNotifications_andKeepsUnreadAndOtherUsersRows() throws Exception {
        UUID callerId = UUID.randomUUID();
        UUID otherId = UUID.randomUUID();
        createNotification(callerId, true, "Reason one");
        createNotification(callerId, true, null);
        Long unreadId = createNotification(callerId, false, "Still unread").getId();
        Long othersReadId = createNotification(otherId, true, "Not yours").getId();
        authenticateAs(callerId);

        mockMvc.perform(delete("/api/notifications/read"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(2));

        assertThat(notificationsOf(callerId)).extracting(Notification::getId).containsExactly(unreadId);
        assertThat(notificationsOf(otherId)).extracting(Notification::getId).containsExactly(othersReadId);
        // The unread count is untouched: only read rows went.
        mockMvc.perform(get("/api/notifications/unread-count"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(1));
    }

    /** A repeat call (or a caller with nothing read) deletes nothing and is still a 200 with 0. */
    @Test
    void deleteRead_whenThereIsNothingRead_returnsZero() throws Exception {
        UUID callerId = UUID.randomUUID();
        createNotification(callerId, false, null);
        authenticateAs(callerId);

        mockMvc.perform(delete("/api/notifications/read"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(0));
        mockMvc.perform(delete("/api/notifications/read"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(0));

        assertThat(notificationsOf(callerId)).hasSize(1);
    }

    @Test
    void deleteRead_withoutAuthentication_returnsUnauthorized_andDeletesNothing() throws Exception {
        UUID recipientId = UUID.randomUUID();
        createNotification(recipientId, true, "Keep me");

        mockMvc.perform(delete("/api/notifications/read"))
                .andExpect(status().isUnauthorized());

        assertThat(notificationsOf(recipientId)).hasSize(1);
    }
}
