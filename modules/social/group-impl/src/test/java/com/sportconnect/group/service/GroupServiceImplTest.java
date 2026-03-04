package com.sportconnect.group.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.group.api.dto.*;
import com.sportconnect.group.entity.*;
import com.sportconnect.group.repository.*;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GroupServiceImplTest {

    @Mock
    private GroupRepository groupRepository;

    @Mock
    private GroupMemberRepository groupMemberRepository;

    @Mock
    private GroupJoinRequestRepository joinRequestRepository;

    @Mock
    private GroupSettingsRepository groupSettingsRepository;

    @Mock
    private GroupRoleRepository groupRoleRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private GroupServiceImpl groupService;

    private UUID userId;
    private UUID otherUserId;
    private Group testGroup;
    private GroupRole ownerRole;
    private GroupRole adminRole;
    private GroupRole memberRole;
    private User testUser;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        otherUserId = UUID.randomUUID();

        testUser = User.builder()
                .id(userId)
                .email("test@example.com")
                .firstName("Test")
                .lastName("User")
                .build();

        testGroup = Group.builder()
                .id(1L)
                .groupName("Test Group")
                .description("Test Description")
                .isPrivate(false)
                .isActive(true)
                .createdBy(userId)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        ownerRole = GroupRole.builder()
                .id(1)
                .roleName("group_owner")
                .level(3)
                .build();

        adminRole = GroupRole.builder()
                .id(2)
                .roleName("group_admin")
                .level(2)
                .build();

        memberRole = GroupRole.builder()
                .id(3)
                .roleName("group_member")
                .level(1)
                .build();
    }

    @Test
    void createGroup_Success() {
        // Arrange
        CreateGroupRequest request = CreateGroupRequest.builder()
                .groupName("New Group")
                .description("New Description")
                .isPrivate(false)
                .build();

        when(groupRepository.existsByGroupName(request.getGroupName())).thenReturn(false);
        when(groupRepository.save(any(Group.class))).thenReturn(testGroup);
        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));
        when(groupMemberRepository.save(any(GroupMember.class))).thenReturn(new GroupMember());
        when(groupSettingsRepository.save(any(GroupSettings.class))).thenReturn(new GroupSettings());
        when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));
        when(groupMemberRepository.countByGroupId(testGroup.getId())).thenReturn(1L);
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(GroupMember.builder().roleId(ownerRole.getId()).build()));
        when(groupRoleRepository.findById(ownerRole.getId())).thenReturn(Optional.of(ownerRole));

        // Act
        GroupResponse response = groupService.createGroup(userId, request);

        // Assert
        assertNotNull(response);
        assertEquals(testGroup.getId(), response.getId());
        assertEquals(testGroup.getGroupName(), response.getGroupName());
        verify(groupRepository).save(any(Group.class));
        verify(groupMemberRepository).save(any(GroupMember.class));
        verify(groupSettingsRepository).save(any(GroupSettings.class));
    }

    @Test
    void createGroup_DuplicateName_ThrowsException() {
        // Arrange
        CreateGroupRequest request = CreateGroupRequest.builder()
                .groupName("Existing Group")
                .build();

        when(groupRepository.existsByGroupName(request.getGroupName())).thenReturn(true);

        // Act & Assert
        assertThrows(BadRequestException.class, () -> groupService.createGroup(userId, request));
        verify(groupRepository, never()).save(any(Group.class));
    }

    @Test
    void getGroup_Success() {
        // Arrange
        when(groupRepository.findByIdAndIsActiveTrue(testGroup.getId())).thenReturn(Optional.of(testGroup));
        when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));
        when(groupMemberRepository.countByGroupId(testGroup.getId())).thenReturn(5L);
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(GroupMember.builder().roleId(memberRole.getId()).build()));
        when(groupRoleRepository.findById(memberRole.getId())).thenReturn(Optional.of(memberRole));

        // Act
        GroupResponse response = groupService.getGroup(testGroup.getId(), userId);

        // Assert
        assertNotNull(response);
        assertEquals(testGroup.getId(), response.getId());
        assertEquals(5, response.getMemberCount());
    }

    @Test
    void getGroup_NotFound_ThrowsException() {
        // Arrange
        when(groupRepository.findByIdAndIsActiveTrue(999L)).thenReturn(Optional.empty());

        // Act & Assert
        assertThrows(NotFoundException.class, () -> groupService.getGroup(999L, userId));
    }

    @Test
    void updateGroup_Success() {
        // Arrange
        UpdateGroupRequest request = UpdateGroupRequest.builder()
                .description("Updated Description")
                .build();

        GroupMember ownerMember = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(ownerRole.getId())
                .build();

        when(groupRepository.findByIdAndIsActiveTrue(testGroup.getId())).thenReturn(Optional.of(testGroup));
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(ownerMember));
        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));
        when(groupRoleRepository.findByRoleName("group_admin")).thenReturn(Optional.of(adminRole));
        when(groupRepository.save(any(Group.class))).thenReturn(testGroup);
        when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));
        when(groupMemberRepository.countByGroupId(testGroup.getId())).thenReturn(1L);
        when(groupRoleRepository.findById(ownerRole.getId())).thenReturn(Optional.of(ownerRole));

        // Act
        GroupResponse response = groupService.updateGroup(testGroup.getId(), userId, request);

        // Assert
        assertNotNull(response);
        verify(groupRepository).save(any(Group.class));
    }

    @Test
    void updateGroup_NotOwnerOrAdmin_ThrowsException() {
        // Arrange
        UpdateGroupRequest request = UpdateGroupRequest.builder()
                .description("Updated Description")
                .build();

        GroupMember regularMember = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(memberRole.getId())
                .build();

        when(groupRepository.findByIdAndIsActiveTrue(testGroup.getId())).thenReturn(Optional.of(testGroup));
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(regularMember));
        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));
        when(groupRoleRepository.findByRoleName("group_admin")).thenReturn(Optional.of(adminRole));

        // Act & Assert
        assertThrows(BadRequestException.class, 
                () -> groupService.updateGroup(testGroup.getId(), userId, request));
    }

    @Test
    void deleteGroup_Success() {
        // Arrange
        GroupMember ownerMember = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(ownerRole.getId())
                .build();

        when(groupRepository.findByIdAndIsActiveTrue(testGroup.getId())).thenReturn(Optional.of(testGroup));
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(ownerMember));
        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));

        // Act
        groupService.deleteGroup(testGroup.getId(), userId);

        // Assert
        verify(groupRepository).save(argThat(group -> !group.getIsActive()));
    }

    @Test
    void deleteGroup_NotOwner_ThrowsException() {
        // Arrange
        GroupMember adminMember = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(adminRole.getId())
                .build();

        when(groupRepository.findByIdAndIsActiveTrue(testGroup.getId())).thenReturn(Optional.of(testGroup));
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(adminMember));
        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));

        // Act & Assert
        assertThrows(BadRequestException.class, () -> groupService.deleteGroup(testGroup.getId(), userId));
    }

    @Test
    void createJoinRequest_Success() {
        // Arrange
        CreateJoinRequestRequest request = CreateJoinRequestRequest.builder()
                .groupName("Test Group")
                .message("I want to join")
                .build();

        GroupJoinRequest savedRequest = GroupJoinRequest.builder()
                .id(1L)
                .groupId(testGroup.getId())
                .userId(userId)
                .status("pending")
                .message(request.getMessage())
                .createdAt(LocalDateTime.now())
                .build();

        when(groupRepository.findByGroupName(request.getGroupName())).thenReturn(Optional.of(testGroup));
        when(groupMemberRepository.existsByGroupIdAndUserId(testGroup.getId(), userId)).thenReturn(false);
        when(joinRequestRepository.existsByGroupIdAndUserIdAndStatus(testGroup.getId(), userId, "pending"))
                .thenReturn(false);
        when(joinRequestRepository.save(any(GroupJoinRequest.class))).thenReturn(savedRequest);
        when(groupRepository.findById(testGroup.getId())).thenReturn(Optional.of(testGroup));
        when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));

        // Act
        JoinRequestResponse response = groupService.createJoinRequest(userId, request);

        // Assert
        assertNotNull(response);
        assertEquals("pending", response.getStatus());
        verify(joinRequestRepository).save(any(GroupJoinRequest.class));
    }

    @Test
    void createJoinRequest_AlreadyMember_ThrowsException() {
        // Arrange
        CreateJoinRequestRequest request = CreateJoinRequestRequest.builder()
                .groupName("Test Group")
                .build();

        when(groupRepository.findByGroupName(request.getGroupName())).thenReturn(Optional.of(testGroup));
        when(groupMemberRepository.existsByGroupIdAndUserId(testGroup.getId(), userId)).thenReturn(true);

        // Act & Assert
        assertThrows(BadRequestException.class, () -> groupService.createJoinRequest(userId, request));
    }

    @Test
    void acceptJoinRequest_Success() {
        // Arrange
        GroupJoinRequest joinRequest = GroupJoinRequest.builder()
                .id(1L)
                .groupId(testGroup.getId())
                .userId(otherUserId)
                .status("pending")
                .build();

        GroupMember adminMember = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(adminRole.getId())
                .build();

        when(joinRequestRepository.findById(1L)).thenReturn(Optional.of(joinRequest));
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(adminMember));
        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));
        when(groupRoleRepository.findByRoleName("group_admin")).thenReturn(Optional.of(adminRole));
        when(groupRoleRepository.findByRoleName("group_member")).thenReturn(Optional.of(memberRole));

        // Act
        groupService.acceptJoinRequest(1L, userId);

        // Assert
        verify(groupMemberRepository).save(any(GroupMember.class));
        verify(joinRequestRepository).save(argThat(req -> "accepted".equals(req.getStatus())));
    }

    @Test
    void acceptJoinRequest_NotAdmin_ThrowsException() {
        // Arrange
        GroupJoinRequest joinRequest = GroupJoinRequest.builder()
                .id(1L)
                .groupId(testGroup.getId())
                .userId(otherUserId)
                .status("pending")
                .build();

        GroupMember regularMember = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(memberRole.getId())
                .build();

        when(joinRequestRepository.findById(1L)).thenReturn(Optional.of(joinRequest));
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(regularMember));
        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));
        when(groupRoleRepository.findByRoleName("group_admin")).thenReturn(Optional.of(adminRole));

        // Act & Assert
        assertThrows(BadRequestException.class, () -> groupService.acceptJoinRequest(1L, userId));
    }

    @Test
    void transferOwnership_Success() {
        // Arrange
        GroupMember currentOwner = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(ownerRole.getId())
                .build();

        GroupMember newOwner = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(otherUserId)
                .roleId(memberRole.getId())
                .build();

        when(groupRepository.existsById(testGroup.getId())).thenReturn(true);
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(currentOwner));
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), otherUserId))
                .thenReturn(Optional.of(newOwner));
        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));
        when(groupRoleRepository.findByRoleName("group_admin")).thenReturn(Optional.of(adminRole));

        // Act
        groupService.transferOwnership(testGroup.getId(), userId, otherUserId);

        // Assert
        verify(groupMemberRepository, times(2)).save(any(GroupMember.class));
        assertEquals(ownerRole.getId(), newOwner.getRoleId());
        assertEquals(adminRole.getId(), currentOwner.getRoleId());
    }

    @Test
    void isGroupOwner_ReturnsTrue() {
        // Arrange
        GroupMember ownerMember = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(ownerRole.getId())
                .build();

        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(ownerMember));

        // Act
        boolean result = groupService.isGroupOwner(testGroup.getId(), userId);

        // Assert
        assertTrue(result);
    }

    @Test
    void isGroupOwner_ReturnsFalse() {
        // Arrange
        GroupMember regularMember = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(memberRole.getId())
                .build();

        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(regularMember));

        // Act
        boolean result = groupService.isGroupOwner(testGroup.getId(), userId);

        // Assert
        assertFalse(result);
    }

    @Test
    void getUserGroups_ReturnsPageOfGroups() {
        // Arrange
        Pageable pageable = PageRequest.of(0, 10);
        GroupMember membership = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(memberRole.getId())
                .build();

        Page<GroupMember> memberships = new PageImpl<>(List.of(membership));

        when(groupMemberRepository.findByUserId(userId, pageable)).thenReturn(memberships);
        when(groupRepository.findById(testGroup.getId())).thenReturn(Optional.of(testGroup));
        when(userRepository.findById(userId)).thenReturn(Optional.of(testUser));
        when(groupMemberRepository.countByGroupId(testGroup.getId())).thenReturn(1L);
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(membership));
        when(groupRoleRepository.findById(memberRole.getId())).thenReturn(Optional.of(memberRole));

        // Act
        Page<GroupResponse> result = groupService.getUserGroups(userId, pageable);

        // Assert
        assertNotNull(result);
        assertEquals(1, result.getTotalElements());
    }

    @Test
    void updateGroupSettings_Success() {
        // Arrange
        UpdateGroupSettingsRequest request = UpdateGroupSettingsRequest.builder()
                .allowMemberPosts(false)
                .requirePostApproval(true)
                .build();

        GroupSettings settings = GroupSettings.builder()
                .id(1L)
                .groupId(testGroup.getId())
                .allowMemberPosts(true)
                .requirePostApproval(false)
                .build();

        GroupMember ownerMember = GroupMember.builder()
                .groupId(testGroup.getId())
                .userId(userId)
                .roleId(ownerRole.getId())
                .build();

        when(groupRepository.existsById(testGroup.getId())).thenReturn(true);
        when(groupMemberRepository.findByGroupIdAndUserId(testGroup.getId(), userId))
                .thenReturn(Optional.of(ownerMember));
        when(groupRoleRepository.findByRoleName("group_owner")).thenReturn(Optional.of(ownerRole));
        when(groupSettingsRepository.findByGroupId(testGroup.getId())).thenReturn(Optional.of(settings));
        when(groupSettingsRepository.save(any(GroupSettings.class))).thenReturn(settings);

        // Act
        GroupSettingsResponse response = groupService.updateGroupSettings(testGroup.getId(), userId, request);

        // Assert
        assertNotNull(response);
        verify(groupSettingsRepository).save(argThat(s -> 
                !s.getAllowMemberPosts() && s.getRequirePostApproval()));
    }
}
