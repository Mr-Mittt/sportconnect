package com.sportconnect.integration;

import com.sportconnect.group.api.dto.*;
import com.sportconnect.group.api.service.GroupService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

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
                .groupName("New Group")
                .description("New Description")
                .isPrivate(false)
                .build();
    }

    @Test
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
    void getGroup_WithoutUserId_Success() throws Exception {
        // Arrange
        when(groupService.getGroup(1L, null)).thenReturn(groupResponse);

        // Act & Assert
        mockMvc.perform(get("/api/groups/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        verify(groupService).getGroup(1L, null);
    }

    @Test
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
    void getPublicGroups_Success() throws Exception {
        // Arrange
        Page<GroupResponse> page = new PageImpl<>(List.of(groupResponse), 
                org.springframework.data.domain.PageRequest.of(0, 10), 1);
        when(groupService.getPublicGroups(any())).thenReturn(page);

        // Act & Assert
        mockMvc.perform(get("/api/groups/public")
                        .param("page", "0")
                        .param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].groupName").value("Test Group"));

        verify(groupService).getPublicGroups(any());
    }

    @Test
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
    @WithMockUser(roles = "USER")
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
