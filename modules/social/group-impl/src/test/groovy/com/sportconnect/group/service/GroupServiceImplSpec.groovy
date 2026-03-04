package com.sportconnect.group.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.group.api.dto.*
import com.sportconnect.group.entity.*
import com.sportconnect.group.repository.*
import com.sportconnect.user.entity.User
import com.sportconnect.user.repository.UserRepository
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

class GroupServiceImplSpec extends Specification {

    GroupRepository groupRepository = Mock()
    GroupMemberRepository groupMemberRepository = Mock()
    GroupJoinRequestRepository joinRequestRepository = Mock()
    GroupSettingsRepository groupSettingsRepository = Mock()
    GroupRoleRepository groupRoleRepository = Mock()
    UserRepository userRepository = Mock()

    @Subject
    GroupServiceImpl groupService = new GroupServiceImpl(
            groupRepository,
            groupMemberRepository,
            joinRequestRepository,
            groupSettingsRepository,
            groupRoleRepository,
            userRepository
    )

    UUID userId = UUID.randomUUID()
    UUID otherUserId = UUID.randomUUID()
    Group testGroup
    GroupRole ownerRole
    GroupRole adminRole
    GroupRole memberRole
    User testUser

    def setup() {
        testUser = User.builder()
                .id(userId)
                .email("test@example.com")
                .firstName("Test")
                .lastName("User")
                .build()

        testGroup = Group.builder()
                .id(1L)
                .groupName("Test Group")
                .description("Test Description")
                .isPrivate(false)
                .isActive(true)
                .createdBy(userId)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build()

        ownerRole = GroupRole.builder()
                .id(1)
                .roleName("group_owner")
                .level(3)
                .build()

        adminRole = GroupRole.builder()
                .id(2)
                .roleName("group_admin")
                .level(2)
                .build()

        memberRole = GroupRole.builder()
                .id(3)
                .roleName("group_member")
                .level(1)
                .build()
    }

    def "createGroup should create group successfully"() {
        given: "a create group request"
        def request = CreateGroupRequest.builder()
                .groupName("New Group")
                .description("New Description")
                .isPrivate(false)
                .build()

        when: "creating a group"
        def response = groupService.createGroup(userId, request)

        then: "group is created"
        1 * groupRepository.existsByGroupName(request.groupName) >> false
        1 * groupRepository.save(_ as Group) >> testGroup
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.save(_ as GroupMember) >> new GroupMember()
        1 * groupSettingsRepository.save(_ as GroupSettings) >> new GroupSettings()
        1 * userRepository.findById(userId) >> Optional.of(testUser)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> 
                Optional.of(GroupMember.builder().roleId(ownerRole.id).build())
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)

        and: "response is correct"
        response != null
        response.id == testGroup.id
        response.groupName == testGroup.groupName
    }

    def "createGroup should throw BadRequestException when group name already exists"() {
        given: "a request with existing group name"
        def request = CreateGroupRequest.builder()
                .groupName("Existing Group")
                .build()

        when: "trying to create group"
        groupService.createGroup(userId, request)

        then: "group name exists"
        1 * groupRepository.existsByGroupName(request.groupName) >> true
        0 * groupRepository.save(_ as Group)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "getGroup should return group when found"() {
        when: "getting a group"
        def response = groupService.getGroup(testGroup.id, userId)

        then: "group is retrieved"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * userRepository.findById(userId) >> Optional.of(testUser)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 5L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >>
                Optional.of(GroupMember.builder().roleId(memberRole.id).build())
        1 * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)

        and: "response is correct"
        response != null
        response.id == testGroup.id
        response.memberCount == 5
    }

    def "getGroup should throw NotFoundException when group not found"() {
        when: "getting non-existent group"
        groupService.getGroup(999L, userId)

        then: "group not found"
        1 * groupRepository.findByIdAndIsActiveTrue(999L) >> Optional.empty()

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "updateGroup should update group when user is owner or admin"() {
        given: "an update request"
        def request = UpdateGroupRequest.builder()
                .description("Updated Description")
                .build()

        and: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        when: "updating group"
        def response = groupService.updateGroup(testGroup.id, userId, request)

        then: "group is updated"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        1 * groupRepository.save(_ as Group) >> testGroup
        1 * userRepository.findById(userId) >> Optional.of(testUser)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)

        and: "response is returned"
        response != null
    }

    def "updateGroup should throw BadRequestException when user is not owner or admin"() {
        given: "an update request"
        def request = UpdateGroupRequest.builder()
                .description("Updated Description")
                .build()

        and: "user is regular member"
        def regularMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(memberRole.id)
                .build()

        when: "trying to update group"
        groupService.updateGroup(testGroup.id, userId, request)

        then: "user is not authorized"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "deleteGroup should soft delete group when user is owner"() {
        given: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        when: "deleting group"
        groupService.deleteGroup(testGroup.id, userId)

        then: "group is soft deleted"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupRepository.save({ Group g -> !g.isActive }) >> testGroup
    }

    def "deleteGroup should throw BadRequestException when user is not owner"() {
        given: "user is admin"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(adminRole.id)
                .build()

        when: "trying to delete group"
        groupService.deleteGroup(testGroup.id, userId)

        then: "user is not owner"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "createJoinRequest should create join request successfully"() {
        given: "a join request"
        def request = CreateJoinRequestRequest.builder()
                .groupName("Test Group")
                .message("I want to join")
                .build()

        and: "a saved join request"
        def savedRequest = GroupJoinRequest.builder()
                .id(1L)
                .groupId(testGroup.id)
                .userId(userId)
                .status("pending")
                .message(request.message)
                .createdAt(LocalDateTime.now())
                .build()

        when: "creating join request"
        def response = groupService.createJoinRequest(userId, request)

        then: "join request is created"
        1 * groupRepository.findByGroupName(request.groupName) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> false
        1 * joinRequestRepository.existsByGroupIdAndUserIdAndStatus(testGroup.id, userId, "pending") >> false
        1 * joinRequestRepository.save(_ as GroupJoinRequest) >> savedRequest
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * userRepository.findById(userId) >> Optional.of(testUser)

        and: "response is correct"
        response != null
        response.status == "pending"
    }

    def "createJoinRequest should throw BadRequestException when user is already member"() {
        given: "a join request"
        def request = CreateJoinRequestRequest.builder()
                .groupName("Test Group")
                .build()

        when: "trying to create join request"
        groupService.createJoinRequest(userId, request)

        then: "user is already member"
        1 * groupRepository.findByGroupName(request.groupName) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "acceptJoinRequest should accept request when user is admin or owner"() {
        given: "a pending join request"
        def joinRequest = GroupJoinRequest.builder()
                .id(1L)
                .groupId(testGroup.id)
                .userId(otherUserId)
                .status("pending")
                .build()

        and: "user is admin"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(adminRole.id)
                .build()

        when: "accepting join request"
        groupService.acceptJoinRequest(1L, userId)

        then: "request is accepted"
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.save(_ as GroupMember)
        1 * joinRequestRepository.save({ GroupJoinRequest req -> req.status == "accepted" })
    }

    def "acceptJoinRequest should throw BadRequestException when user is not admin"() {
        given: "a pending join request"
        def joinRequest = GroupJoinRequest.builder()
                .id(1L)
                .groupId(testGroup.id)
                .userId(otherUserId)
                .status("pending")
                .build()

        and: "user is regular member"
        def regularMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(memberRole.id)
                .build()

        when: "trying to accept join request"
        groupService.acceptJoinRequest(1L, userId)

        then: "user is not authorized"
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "transferOwnership should transfer ownership successfully"() {
        given: "current owner and new owner"
        def currentOwner = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        def newOwner = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(otherUserId)
                .roleId(memberRole.id)
                .build()

        when: "transferring ownership"
        groupService.transferOwnership(testGroup.id, userId, otherUserId)

        then: "ownership is transferred"
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(currentOwner)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.of(newOwner)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        2 * groupMemberRepository.save(_ as GroupMember)

        and: "roles are swapped"
        newOwner.roleId == ownerRole.id
        currentOwner.roleId == adminRole.id
    }

    def "isGroupOwner should return true when user is owner"() {
        given: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        when: "checking if user is owner"
        def result = groupService.isGroupOwner(testGroup.id, userId)

        then: "user is owner"
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)

        and: "result is true"
        result == true
    }

    def "isGroupOwner should return false when user is not owner"() {
        given: "user is regular member"
        def regularMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(memberRole.id)
                .build()

        when: "checking if user is owner"
        def result = groupService.isGroupOwner(testGroup.id, userId)

        then: "user is not owner"
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)

        and: "result is false"
        result == false
    }

    def "getUserGroups should return page of user's groups"() {
        given: "user's group memberships"
        def pageable = PageRequest.of(0, 10)
        def membership = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(memberRole.id)
                .build()

        def memberships = new PageImpl<>([membership])

        when: "getting user groups"
        def result = groupService.getUserGroups(userId, pageable)

        then: "groups are retrieved"
        1 * groupMemberRepository.findByUserId(userId, pageable) >> memberships
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * userRepository.findById(userId) >> Optional.of(testUser)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(membership)
        1 * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)

        and: "result contains groups"
        result != null
        result.totalElements == 1
    }

    def "updateGroupSettings should update settings when user is owner"() {
        given: "an update request"
        def request = UpdateGroupSettingsRequest.builder()
                .allowMemberPosts(false)
                .requirePostApproval(true)
                .build()

        and: "existing settings"
        def settings = GroupSettings.builder()
                .id(1L)
                .groupId(testGroup.id)
                .allowMemberPosts(true)
                .requirePostApproval(false)
                .build()

        and: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        when: "updating group settings"
        def response = groupService.updateGroupSettings(testGroup.id, userId, request)

        then: "settings are updated"
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupSettingsRepository.save({ GroupSettings s ->
            !s.allowMemberPosts && s.requirePostApproval
        }) >> settings

        and: "response is returned"
        response != null
    }
}
