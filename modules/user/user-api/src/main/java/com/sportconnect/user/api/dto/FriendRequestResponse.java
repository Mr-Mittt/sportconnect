package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FriendRequestResponse {
    private UUID requestId;
    private UUID senderId;
    private String senderName;
    private UUID receiverId;
    private String receiverName;
    private FriendRequestStatus status;
    private LocalDateTime createdAt;
}
