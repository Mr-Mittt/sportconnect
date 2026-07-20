package com.sportconnect.integration;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.group.api.dto.CreateGroupRequest;
import com.sportconnect.group.api.dto.CreateJoinRequestRequest;
import com.sportconnect.group.api.dto.GroupInvitationResponse;
import com.sportconnect.group.api.dto.GroupMemberResponse;
import com.sportconnect.group.api.dto.GroupResponse;
import com.sportconnect.group.api.dto.GroupSettingsResponse;
import com.sportconnect.group.api.dto.JoinRequestResponse;
import com.sportconnect.group.api.dto.UpdateGroupRequest;
import com.sportconnect.group.api.dto.UpdateGroupSettingsRequest;
import com.sportconnect.group.api.service.GroupService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.MediaType;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GroupControllerTest extends BaseIT {

    @MockBean
    private GroupService groupService;

    private UUID userId;
    private GroupResponse groupResponse;
    private CreateGroupRequest createRequest;

    @BeforeEach
    @Override
    public void baseSetup() {
        super.baseSetup();
        userId = UUID.randomUUID();
        authenticateAs(userId);

        groupResponse = GroupResponse.builder()
                .id(1L)
                .groupName("Test Group")
                .description("Test Description")
                .isPrivate(false)
                .isActive(true)
                .createdBy(userId)
                .createdByFullName("Test User")
                .memberCount(5)
                .currentUserRole("group_owner")
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        createRequest = CreateGroupRequest.builder()
                .sportId(1L)
                .groupName("New Group")
                .description("New Description")
                .isPrivate(false)
                .build();
    }

    @Test
    void createGroup_Success() throws Exception {
        // Arrange
        when(groupService.createGroup(eq(userId), any(CreateGroupRequest.class)))
                .thenReturn(groupResponse);

        // Act & Assert
        mockMvc.perform(post("/api/groups")
                        .with(csrf())
                        .param("userId", userId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(createRequest)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(1))
                .andExpect(jsonPath("$.data.groupName").value("Test Group"))
                .andExpect(jsonPath("$.message").value("Group created successfully"));

        verify(groupService).createGroup(eq(userId), any(CreateGroupRequest.class));
    }

    @Test
    void createGroup_InvalidRequest_ReturnsBadRequest() throws Exception {
        // Arrange
        CreateGroupRequest invalidRequest = CreateGroupRequest.builder()
                .groupName("") // Invalid: empty name
                .build();

        // Act & Assert
        mockMvc.perform(post("/api/groups")
                        .with(csrf())
                        .param("userId", userId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(invalidRequest)))
                .andExpect(status().isBadRequest());

        verify(groupService, never()).createGroup(any(), any());
    }

    @Test
    void getGroup_Success() throws Exception {
        // Arrange
        when(groupService.getGroup(1L, userId)).thenReturn(groupResponse);

        // Act & Assert
        mockMvc.perform(get("/api/groups/1")
                        .param("currentUserId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(1))
                .andExpect(jsonPath("$.data.groupName").value("Test Group"));

        verify(groupService).getGroup(1L, userId);
    }

    @Test
    void getGroup_WithoutAuthentication_ReturnsUnauthorized() throws Exception {
        // getGroup has no per-group privacy/membership check (tracked as A9), but SecurityConfig
        // still requires *some* authenticated caller for this endpoint (not in the permitAll
        // list). Confirms that boundary rather than the removed "anonymous viewing succeeds"
        // premise, which contradicted the actual SecurityConfig rules.
        //
        // .with(anonymous()) — not a manual SecurityContextHolder.clearContext() — is required
        // here: baseSetup()'s authenticateAs(userId) context otherwise survives into this
        // request regardless of a manual clear (MockMvc's security integration re-establishes it
        // from the ThreadLocal before dispatch in a way a plain clearContext() call doesn't
        // override); anonymous() is Spring Security Test's supported mechanism for this exact
        // scenario.
        mockMvc.perform(get("/api/groups/1").with(anonymous()))
                .andExpect(status().isUnauthorized());

        verify(groupService, never()).getGroup(any(), any());
    }

    @Test
    void getGroup_PrivateGroupNonMember_ReturnsBadRequest() throws Exception {
        // A9 — the privacy/membership decision itself is exercised in GroupServiceImplSpec
        // (GroupService is mocked here). This confirms the controller/GlobalExceptionHandler
        // wiring: a BadRequestException thrown by the service reaches the client as a 400 with
        // the ApiResponse.error envelope, not as a 500 or an unwrapped stack trace.
        when(groupService.getGroup(1L, userId))
                .thenThrow(new BadRequestException("This group is private. Request to join to view its details"));

        mockMvc.perform(get("/api/groups/1"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("This group is private. Request to join to view its details"));

        verify(groupService).getGroup(1L, userId);
    }

    @Test
    void getUserGroups_Success() throws Exception {
        // Arrange
        Page<GroupResponse> page = new PageImpl<>(List.of(groupResponse), 
                org.springframework.data.domain.PageRequest.of(0, 10), 1);
        when(groupService.getUserGroups(eq(userId), any())).thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/groups/user/" + userId)
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].id").value(1));

        verify(groupService).getUserGroups(eq(userId), any());
    }

    @Test
    void getPublicGroups_Success() throws Exception {
        // Arrange
        // Signature grew to (viewerId, sportId, search, pageable) → Page<GroupSearchResponse>
        // in the group-spaces work
        com.sportconnect.group.api.dto.GroupSearchResponse searchResponse =
                com.sportconnect.group.api.dto.GroupSearchResponse.builder()
                        .id(1L)
                        .groupName("Test Group")
                        .memberCount(1)
                        .isMember(false)
                        .build();
        Page<com.sportconnect.group.api.dto.GroupSearchResponse> page =
                new PageImpl<>(List.of(searchResponse),
                        org.springframework.data.domain.PageRequest.of(0, 10), 1);
        when(groupService.getPublicGroups(any(), any(), any(), any())).thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/groups/public")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].groupName").value("Test Group"));

        verify(groupService).getPublicGroups(any(), any(), any(), any());
    }

    @Test
    void updateGroup_Success() throws Exception {
        // Arrange
        UpdateGroupRequest updateRequest = UpdateGroupRequest.builder()
                .description("Updated Description")
                .build();

        when(groupService.updateGroup(eq(1L), eq(userId), any(UpdateGroupRequest.class)))
                .thenReturn(groupResponse);

        // Act & Assert
        mockMvc.perform(put("/api/groups/1")
                        .with(csrf())
                        .param("userId", userId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(updateRequest)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Group updated successfully"));

        verify(groupService).updateGroup(eq(1L), eq(userId), any(UpdateGroupRequest.class));
    }

    @Test
    void deleteGroup_Success() throws Exception {
        // Arrange
        doNothing().when(groupService).deleteGroup(1L, userId);

        // Act & Assert
        mockMvc.perform(delete("/api/groups/1")
                        .with(csrf())
                        .param("userId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Group deleted successfully"));

        verify(groupService).deleteGroup(1L, userId);
    }

    @Test
    void addMember_Success() throws Exception {
        // Arrange
        UUID targetUserId = UUID.randomUUID();
        doNothing().when(groupService).addMember(1L, userId, targetUserId, "group_member");

        // Act & Assert
        mockMvc.perform(post("/api/groups/1/members")
                        .with(csrf())
                        .param("adminUserId", userId.toString())
                        .param("targetUserId", targetUserId.toString())
                        .param("roleName", "group_member"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Member added successfully"));

        verify(groupService).addMember(1L, userId, targetUserId, "group_member");
    }

    @Test
    void removeMember_Success() throws Exception {
        // Arrange
        UUID targetUserId = UUID.randomUUID();
        doNothing().when(groupService).removeMember(1L, userId, targetUserId);

        // Act & Assert
        mockMvc.perform(delete("/api/groups/1/members/" + targetUserId)
                        .with(csrf())
                        .param("adminUserId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Member removed successfully"));

        verify(groupService).removeMember(1L, userId, targetUserId);
    }

    @Test
    void updateMemberRole_Success() throws Exception {
        // Arrange
        UUID targetUserId = UUID.randomUUID();
        doNothing().when(groupService).updateMemberRole(1L, userId, targetUserId, "group_admin");

        // Act & Assert
        mockMvc.perform(put("/api/groups/1/members/" + targetUserId + "/role")
                        .with(csrf())
                        .param("adminUserId", userId.toString())
                        .param("newRoleName", "group_admin"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Member role updated successfully"));

        verify(groupService).updateMemberRole(1L, userId, targetUserId, "group_admin");
    }

    @Test
    void getGroupMembers_Success() throws Exception {
        // Arrange
        GroupMemberResponse memberResponse = GroupMemberResponse.builder()
                .id(1L)
                .groupId(1L)
                .userId(userId)
                .userFullName("Test User")
                .roleName("group_owner")
                .roleLevel(3)
                .joinedAt(LocalDateTime.now())
                .build();

        Page<GroupMemberResponse> page = new PageImpl<>(List.of(memberResponse), 
                org.springframework.data.domain.PageRequest.of(0, 10), 1);
        when(groupService.getGroupMembers(eq(1L), eq(userId), any())).thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/groups/1/members")
                        .param("currentUserId", userId.toString())
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].userFullName").value("Test User"));

        verify(groupService).getGroupMembers(eq(1L), eq(userId), any());
    }

    @Test
    void transferOwnership_Success() throws Exception {
        // Arrange
        UUID newOwnerId = UUID.randomUUID();
        doNothing().when(groupService).transferOwnership(1L, userId, newOwnerId);

        // Act & Assert
        mockMvc.perform(put("/api/groups/1/transfer-ownership")
                        .with(csrf())
                        .param("currentOwnerId", userId.toString())
                        .param("newOwnerId", newOwnerId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Ownership transferred successfully"));

        verify(groupService).transferOwnership(1L, userId, newOwnerId);
    }

    @Test
    void leaveGroup_Success() throws Exception {
        // Arrange
        doNothing().when(groupService).leaveMember(1L, userId);

        // Act & Assert
        mockMvc.perform(delete("/api/groups/1/leave")
                        .with(csrf())
                        .param("userId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Left group successfully"));

        verify(groupService).leaveMember(1L, userId);
    }

    @Test
    void createJoinRequest_Success() throws Exception {
        // Arrange
        CreateJoinRequestRequest request = CreateJoinRequestRequest.builder()
                .groupName("Test Group")
                .message("I want to join")
                .build();

        JoinRequestResponse response = JoinRequestResponse.builder()
                .id(1L)
                .groupId(1L)
                .groupName("Test Group")
                .userId(userId)
                .userFullName("Test User")
                .status("pending")
                .message("I want to join")
                .createdAt(LocalDateTime.now())
                .build();

        when(groupService.createJoinRequest(eq(userId), any(CreateJoinRequestRequest.class)))
                .thenReturn(response);

        // Act & Assert
        mockMvc.perform(post("/api/groups/join-requests")
                        .with(csrf())
                        .param("userId", userId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("pending"))
                .andExpect(jsonPath("$.message").value("Join request sent successfully"));

        verify(groupService).createJoinRequest(eq(userId), any(CreateJoinRequestRequest.class));
    }

    @Test
    void acceptJoinRequest_Success() throws Exception {
        // Arrange
        doNothing().when(groupService).acceptJoinRequest(1L, userId);

        // Act & Assert
        mockMvc.perform(put("/api/groups/join-requests/1/accept")
                        .with(csrf())
                        .param("adminUserId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Join request accepted"));

        verify(groupService).acceptJoinRequest(1L, userId);
    }

    @Test
    void declineJoinRequest_Success() throws Exception {
        // Arrange
        doNothing().when(groupService).declineJoinRequest(1L, userId);

        // Act & Assert
        mockMvc.perform(put("/api/groups/join-requests/1/decline")
                        .with(csrf())
                        .param("adminUserId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Join request declined"));

        verify(groupService).declineJoinRequest(1L, userId);
    }

    @Test
    void getGroupJoinRequests_Success() throws Exception {
        // Arrange
        JoinRequestResponse response = JoinRequestResponse.builder()
                .id(1L)
                .groupId(1L)
                .userId(UUID.randomUUID())
                .status("pending")
                .build();

        Page<JoinRequestResponse> page = new PageImpl<>(List.of(response), 
                org.springframework.data.domain.PageRequest.of(0, 10), 1);
        when(groupService.getGroupJoinRequests(eq(1L), eq(userId), any())).thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/groups/1/join-requests")
                        .param("adminUserId", userId.toString())
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].status").value("pending"));

        verify(groupService).getGroupJoinRequests(eq(1L), eq(userId), any());
    }

    @Test
    void getUserJoinRequests_Success() throws Exception {
        // Arrange
        JoinRequestResponse response = JoinRequestResponse.builder()
                .id(1L)
                .groupId(1L)
                .userId(userId)
                .status("pending")
                .build();

        Page<JoinRequestResponse> page = new PageImpl<>(List.of(response), 
                org.springframework.data.domain.PageRequest.of(0, 10), 1);
        when(groupService.getUserJoinRequests(eq(userId), any())).thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/groups/join-requests/user/" + userId)
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        verify(groupService).getUserJoinRequests(eq(userId), any());
    }

    @Test
    void getMemberSentInvitations_Success() throws Exception {
        // B8 — confirms the controller/JSON wiring for the real, revised contract: no `status`
        // query param, both pending_owner and pending_user rows returned together in one page
        // (GroupServiceImplSpec exercises the service-level branching; GroupService is mocked
        // here, so this is purely about what the HTTP layer actually serializes).
        GroupInvitationResponse pendingOwner = GroupInvitationResponse.builder()
                .id(1L)
                .groupId(1L)
                .groupName("Test Group")
                .inviterId(userId)
                .inviterFullName("Test User")
                .inviteeId(UUID.randomUUID())
                .inviteeFullName("Friend One")
                .status("pending_owner")
                .build();
        GroupInvitationResponse pendingUser = GroupInvitationResponse.builder()
                .id(2L)
                .groupId(1L)
                .groupName("Test Group")
                .inviterId(userId)
                .inviterFullName("Test User")
                .inviteeId(UUID.randomUUID())
                .inviteeFullName("Friend Two")
                .status("pending_user")
                .build();

        Page<GroupInvitationResponse> page = new PageImpl<>(List.of(pendingOwner, pendingUser),
                org.springframework.data.domain.PageRequest.of(0, 10), 2);
        when(groupService.getMemberSentInvitations(eq(1L), eq(userId), any())).thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/groups/1/invitations/sent")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].status").value("pending_owner"))
                .andExpect(jsonPath("$.data.content[1].status").value("pending_user"));

        verify(groupService).getMemberSentInvitations(eq(1L), eq(userId), any());
    }

    @Test
    void getMemberSentInvitations_NotAMember_ReturnsBadRequest() throws Exception {
        // Confirms the controller/GlobalExceptionHandler wiring for this endpoint's one error
        // path, same precedent as getGroup_PrivateGroupNonMember_ReturnsBadRequest (A9).
        when(groupService.getMemberSentInvitations(eq(1L), eq(userId), any()))
                .thenThrow(new BadRequestException("Only group members can view their sent invitations"));

        mockMvc.perform(get("/api/groups/1/invitations/sent"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Only group members can view their sent invitations"));

        verify(groupService).getMemberSentInvitations(eq(1L), eq(userId), any());
    }

    @Test
    void getGroupSettings_Success() throws Exception {
        // Arrange
        GroupSettingsResponse response = GroupSettingsResponse.builder()
                .id(1L)
                .groupId(1L)
                .allowMemberPosts(true)
                .requirePostApproval(false)
                .allowMemberInvites(false)
                .build();

        when(groupService.getGroupSettings(1L, userId)).thenReturn(response);

        // Act & Assert
        mockMvc.perform(get("/api/groups/1/settings")
                        .param("userId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.allowMemberPosts").value(true));

        verify(groupService).getGroupSettings(1L, userId);
    }

    @Test
    void updateGroupSettings_Success() throws Exception {
        // Arrange
        UpdateGroupSettingsRequest request = UpdateGroupSettingsRequest.builder()
                .allowMemberPosts(false)
                .requirePostApproval(true)
                .build();

        GroupSettingsResponse response = GroupSettingsResponse.builder()
                .id(1L)
                .groupId(1L)
                .allowMemberPosts(false)
                .requirePostApproval(true)
                .build();

        when(groupService.updateGroupSettings(eq(1L), eq(userId), any(UpdateGroupSettingsRequest.class)))
                .thenReturn(response);

        // Act & Assert
        mockMvc.perform(put("/api/groups/1/settings")
                        .with(csrf())
                        .param("userId", userId.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Settings updated successfully"));

        verify(groupService).updateGroupSettings(eq(1L), eq(userId), any(UpdateGroupSettingsRequest.class));
    }

    @Test
    void isGroupOwner_ReturnsTrue() throws Exception {
        // Arrange
        when(groupService.isGroupOwner(1L, userId)).thenReturn(true);

        // Act & Assert
        mockMvc.perform(get("/api/groups/1/permissions/is-owner")
                        .param("userId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").value(true));

        verify(groupService).isGroupOwner(1L, userId);
    }

    @Test
    void isGroupAdmin_ReturnsFalse() throws Exception {
        // Arrange
        when(groupService.isGroupAdmin(1L, userId)).thenReturn(false);

        // Act & Assert
        mockMvc.perform(get("/api/groups/1/permissions/is-admin")
                        .param("userId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").value(false));

        verify(groupService).isGroupAdmin(1L, userId);
    }

    @Test
    void isGroupMember_ReturnsTrue() throws Exception {
        // Arrange
        when(groupService.isGroupMember(1L, userId)).thenReturn(true);

        // Act & Assert
        mockMvc.perform(get("/api/groups/1/permissions/is-member")
                        .param("userId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").value(true));

        verify(groupService).isGroupMember(1L, userId);
    }

    @Test
    void getUserRole_ReturnsRole() throws Exception {
        // Arrange
        when(groupService.getUserRoleInGroup(1L, userId)).thenReturn("group_owner");

        // Act & Assert
        mockMvc.perform(get("/api/groups/1/permissions/user-role")
                        .param("userId", userId.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").value("group_owner"));

        verify(groupService).getUserRoleInGroup(1L, userId);
    }
}
