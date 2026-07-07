package com.sportconnect.group.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.group.api.dto.*
import com.sportconnect.group.entity.*
import com.sportconnect.group.repository.*
import com.sportconnect.social.post.api.dto.PostResponse
import com.sportconnect.social.post.api.dto.PostType
import com.sportconnect.social.post.api.service.PostService
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserFriendService
import com.sportconnect.user.api.service.UserService
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
    UserService userService = Mock()
    UserFriendService userFriendService = Mock()
    UserSportProfileService userSportProfileService = Mock()
    PostService postService = Mock()
    GroupPinnedPostRepository pinnedPostRepository = Mock()
    GroupInvitationRepository invitationRepository = Mock()

    @Subject
    GroupServiceImpl groupService = new GroupServiceImpl(
            groupRepository,
            groupMemberRepository,
            joinRequestRepository,
            groupSettingsRepository,
            groupRoleRepository,
            userService,
            userFriendService,
            userSportProfileService,
            postService,
            pinnedPostRepository,
            invitationRepository
    )

    UUID userId = UUID.randomUUID()
    UUID otherUserId = UUID.randomUUID()
    Group testGroup
    GroupRole ownerRole
    GroupRole adminRole
    GroupRole memberRole
    UserResponse testUser

    def setup() {
        testUser = UserResponse.builder()
                .id(userId)
                .email("test@example.com")
                .firstName("Test")
                .lastName("User")
                .build()

        testGroup = Group.builder()
                .id(1L)
                .sportId(1L)
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
        given: "a create group request with a sport the user has a profile for"
        def request = CreateGroupRequest.builder()
                .sportId(1L)
                .groupName("New Group")
                .description("New Description")
                .isPrivate(false)
                .build()

        when: "creating a group"
        def response = groupService.createGroup(userId, request)

        then: "group is created"
        1 * groupRepository.existsByGroupName(request.groupName) >> false
        1 * userSportProfileService.hasProfileForSport(userId, 1L) >> true
        1 * groupRepository.save(_ as Group) >> testGroup
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.save(_ as GroupMember) >> new GroupMember()
        1 * groupSettingsRepository.save(_ as GroupSettings) >> new GroupSettings()
        1 * userService.getUsersByIds(_) >> [(userId): testUser]
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >>
                Optional.of(GroupMember.builder().roleId(ownerRole.id).build())
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)

        and: "response is correct"
        response != null
        response.id == testGroup.id
        response.groupName == testGroup.groupName
    }

    def "createGroup should throw BadRequestException when user has no sport profile"() {
        given: "a request for a sport the user has no profile for"
        def request = CreateGroupRequest.builder()
                .sportId(99L)
                .groupName("New Group")
                .build()

        when: "trying to create group"
        groupService.createGroup(userId, request)

        then: "name check passes but sport profile check fails"
        1 * groupRepository.existsByGroupName(request.groupName) >> false
        1 * userSportProfileService.hasProfileForSport(userId, 99L) >> false
        0 * groupRepository.save(_ as Group)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "createGroup should throw BadRequestException when group name already exists"() {
        given: "a request with existing group name"
        def request = CreateGroupRequest.builder()
                .sportId(1L)
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

    def "getGroup should return group when found with pinned posts"() {
        given: "a pinned post"
        def pin = GroupPinnedPost.builder()
                .postId(10L).groupId(testGroup.id).pinnedBy(userId)
                .pinnedAt(LocalDateTime.now()).build()
        def pinnedPostResponse = PostResponse.builder().id(10L).groupId(testGroup.id)
                .postType(PostType.GROUP_POST).content("Pinned content").build()

        when: "getting a group"
        def response = groupService.getGroup(testGroup.id, userId)

        then: "group is retrieved with pinned posts"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * userService.getUsersByIds(_) >> [(userId): testUser]
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 5L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >>
                Optional.of(GroupMember.builder().roleId(memberRole.id).build())
        1 * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
        1 * pinnedPostRepository.findTop3ByGroupIdOrderByPinnedAtDesc(testGroup.id) >> [pin]
        1 * postService.getPostById(10L, userId) >> pinnedPostResponse

        and: "response is correct"
        response != null
        response.id == testGroup.id
        response.memberCount == 5
        response.pinnedPosts.size() == 1
        response.pinnedPosts[0].id == 10L
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
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        1 * groupRepository.save(_ as Group) >> testGroup
        1 * userService.getUsersByIds(_) >> [(userId): testUser]
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)

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
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)

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
        _ * userService.getUsersByIds(_) >> [(userId): testUser]

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
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
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
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)

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
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(currentOwner)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.of(newOwner)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
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
        1 * groupMemberRepository.findByUserIdAndGroupIsActiveTrue(userId, pageable) >> memberships
        // page-level batching: one findGroupsWithMemberCounts call, one getUsersByIds call, one findAllById call
        1 * groupRepository.findGroupsWithMemberCounts([testGroup.id]) >> [[testGroup, 1L] as Object[]]
        1 * userService.getUsersByIds([userId]) >> [(userId): testUser]
        1 * groupRoleRepository.findAllById([memberRole.id]) >> [memberRole]

        and: "result contains groups"
        result != null
        result.totalElements == 1
    }

    def "getGroupInfo should return rules and schedule when group exists"() {
        given: "a group with rules and schedule"
        def groupWithInfo = Group.builder()
                .id(1L)
                .groupName("Test Group")
                .rules("No spamming")
                .schedule("Every Sunday 9am")
                .isActive(true)
                .createdBy(userId)
                .updatedAt(java.time.LocalDateTime.now())
                .build()

        when: "getting group info"
        def result = groupService.getGroupInfo(1L)

        then: "group is found and info is returned"
        1 * groupRepository.findByIdAndIsActiveTrue(1L) >> Optional.of(groupWithInfo)

        and: "result contains correct fields"
        result != null
        result.groupId == 1L
        result.groupName == "Test Group"
        result.rules == "No spamming"
        result.schedule == "Every Sunday 9am"
    }

    def "getGroupInfo should throw NotFoundException when group does not exist"() {
        when: "getting info for a non-existent group"
        groupService.getGroupInfo(999L)

        then: "group not found"
        1 * groupRepository.findByIdAndIsActiveTrue(999L) >> Optional.empty()

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "updateGroup should update rules and schedule when provided"() {
        given: "a request with rules and schedule"
        def request = UpdateGroupRequest.builder()
                .rules("Be respectful")
                .schedule("Weekends only")
                .build()

        and: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        when: "updating group"
        groupService.updateGroup(testGroup.id, userId, request)

        then: "group is found, permission is checked, and rules/schedule are saved"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        // isGroupOwner short-circuits canManageMembers — isGroupAdmin (and group_admin lookup) never called
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRepository.save({ Group g -> g.rules == "Be respectful" && g.schedule == "Weekends only" }) >> testGroup
        1 * userService.getUsersByIds(_) >> [(userId): testUser]
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
    }

    def "cancelJoinRequest should delete request when caller is the requestor and request is pending"() {
        given: "a pending join request owned by the caller"
        def joinRequest = GroupJoinRequest.builder()
                .id(1L)
                .groupId(testGroup.id)
                .userId(userId)
                .status("pending")
                .build()

        when: "cancelling the join request"
        groupService.cancelJoinRequest(1L, userId)

        then: "request is found, group is active, request is deleted"
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * joinRequestRepository.deleteById(1L)
    }

    def "cancelJoinRequest should throw NotFoundException when request does not exist"() {
        when: "cancelling a non-existent request"
        groupService.cancelJoinRequest(999L, userId)

        then: "request is not found"
        1 * joinRequestRepository.findById(999L) >> Optional.empty()

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "cancelJoinRequest should throw BadRequestException when caller is not the requestor"() {
        given: "a pending join request owned by another user"
        def joinRequest = GroupJoinRequest.builder()
                .id(1L)
                .groupId(testGroup.id)
                .userId(otherUserId)
                .status("pending")
                .build()

        when: "a different user tries to cancel"
        groupService.cancelJoinRequest(1L, userId)

        then: "request is found"
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        0 * joinRequestRepository.deleteById(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "cancelJoinRequest should throw BadRequestException when group is inactive"() {
        given: "a pending request for an inactive group"
        def inactiveGroup = Group.builder()
                .id(testGroup.id)
                .groupName("Disbanded Group")
                .isActive(false)
                .build()

        def joinRequest = GroupJoinRequest.builder()
                .id(1L)
                .groupId(testGroup.id)
                .userId(userId)
                .status("pending")
                .build()

        when: "cancelling the request"
        groupService.cancelJoinRequest(1L, userId)

        then: "request is found, group is inactive"
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        1 * groupRepository.findById(testGroup.id) >> Optional.of(inactiveGroup)
        0 * joinRequestRepository.deleteById(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "cancelJoinRequest should throw BadRequestException when request is not pending"() {
        given: "an already-accepted join request"
        def joinRequest = GroupJoinRequest.builder()
                .id(1L)
                .groupId(testGroup.id)
                .userId(userId)
                .status("accepted")
                .build()

        when: "trying to cancel an accepted request"
        groupService.cancelJoinRequest(1L, userId)

        then: "request and group are found, status check fails"
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        0 * joinRequestRepository.deleteById(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "getPublicGroups should return all public groups when no filters provided (anonymous)"() {
        given: "public groups exist"
        def pageable = PageRequest.of(0, 10)
        def rawPage = new PageImpl<Object[]>([[testGroup, 3L] as Object[]])

        when: "getting public groups without any filter, unauthenticated"
        def result = groupService.getPublicGroups(null, null, null, pageable)

        then: "anonymous query is used"
        1 * groupRepository.searchPublicGroupsAnon(null, null, pageable) >> rawPage
        0 * groupRepository.searchPublicGroupsWithCounts(_, _, _, _)
        1 * userService.getUsersByIds({ it.contains(userId) }) >> [(userId): testUser]

        and: "results are returned with isMember false"
        result != null
        result.totalElements == 1
        !result.content[0].isMember
        result.content[0].memberCount == 3
    }

    def "getPublicGroups should filter by sportId when provided (anonymous)"() {
        given: "public groups for a specific sport"
        def pageable = PageRequest.of(0, 10)
        def rawPage = new PageImpl<Object[]>([[testGroup, 2L] as Object[]])

        when: "getting public groups with sport filter, unauthenticated"
        def result = groupService.getPublicGroups(null, 1L, null, pageable)

        then: "anonymous query is called with sportId"
        1 * groupRepository.searchPublicGroupsAnon(1L, null, pageable) >> rawPage
        1 * userService.getUsersByIds(_) >> [(userId): testUser]

        and: "results are returned with correct sportId"
        result != null
        result.totalElements == 1
        result.content[0].sportId == 1L
        result.content[0].memberCount == 2
    }

    // B5 — Group search & discovery

    def "getPublicGroups should filter by keyword on group name"() {
        given: "a group matching keyword"
        def pageable = PageRequest.of(0, 10)
        def matchingGroup = Group.builder()
                .id(2L).sportId(1L).groupName("Football Warriors")
                .isActive(true).isPrivate(false).createdBy(otherUserId).build()
        def rawPage = new PageImpl<Object[]>([[matchingGroup, 5L] as Object[]])

        when: "anonymous search with keyword 'warrior'"
        def result = groupService.getPublicGroups(null, null, "warrior", pageable)

        then: "anonymous query is called with keyword"
        1 * groupRepository.searchPublicGroupsAnon(null, "warrior", pageable) >> rawPage
        1 * userService.getUsersByIds(_) >> [(userId): testUser]

        and: "matching group is returned"
        result.totalElements == 1
        result.content[0].groupName == "Football Warriors"
        result.content[0].memberCount == 5
    }

    def "getPublicGroups should filter by both keyword and sportId"() {
        given: "a group matching both filters"
        def pageable = PageRequest.of(0, 10)
        def rawPage = new PageImpl<Object[]>([[testGroup, 3L] as Object[]])

        when: "anonymous search with keyword and sportId"
        def result = groupService.getPublicGroups(null, 1L, "test", pageable)

        then: "anonymous query is called with both filters"
        1 * groupRepository.searchPublicGroupsAnon(1L, "test", pageable) >> rawPage
        1 * userService.getUsersByIds(_) >> [(userId): testUser]

        and: "result is returned"
        result.totalElements == 1
        result.content[0].sportId == 1L
    }

    def "getPublicGroups should mark isMember true for groups the user belongs to"() {
        given: "an authenticated user who is a member of testGroup (SUM returns 1)"
        def pageable = PageRequest.of(0, 10)
        def rawPage = new PageImpl<Object[]>([[testGroup, 4L, 1L] as Object[]])

        when: "authenticated user searches"
        def result = groupService.getPublicGroups(userId, null, null, pageable)

        then: "authenticated query is called with userId"
        1 * groupRepository.searchPublicGroupsWithCounts(userId, null, null, pageable) >> rawPage
        0 * groupRepository.searchPublicGroupsAnon(_, _, _)
        1 * userService.getUsersByIds(_) >> [(userId): testUser]

        and: "isMember is true"
        result.content[0].isMember == true
        result.content[0].memberCount == 4
    }

    def "getPublicGroups should put member groups before non-member groups"() {
        given: "two groups — user is member of Alpha (SUM=1), not Beta (SUM=0)"
        def pageable = PageRequest.of(0, 10)
        def alphaGroup = Group.builder()
                .id(10L).sportId(1L).groupName("Alpha Group")
                .isActive(true).isPrivate(false).createdBy(otherUserId).build()
        def betaGroup = Group.builder()
                .id(11L).sportId(1L).groupName("Beta Group")
                .isActive(true).isPrivate(false).createdBy(otherUserId).build()
        // DB returns Beta first, Alpha second — sort should flip them
        def rawPage = new PageImpl<Object[]>([
                [betaGroup, 5L, 0L] as Object[],
                [alphaGroup, 3L, 1L] as Object[]
        ])

        when: "authenticated user searches"
        def result = groupService.getPublicGroups(userId, null, null, pageable)

        then:
        1 * groupRepository.searchPublicGroupsWithCounts(userId, null, null, pageable) >> rawPage
        1 * userService.getUsersByIds(_) >> [(userId): testUser]

        and: "Alpha (member) appears before Beta (non-member)"
        result.content[0].groupName == "Alpha Group"
        result.content[0].isMember == true
        result.content[1].groupName == "Beta Group"
        result.content[1].isMember == false
    }

    def "getPublicGroups should return empty page immediately without further queries"() {
        given: "no groups match the search"
        def pageable = PageRequest.of(0, 10)
        def rawPage = new PageImpl<Object[]>([])

        when: "searching with a keyword that matches nothing"
        def result = groupService.getPublicGroups(null, null, "xyznonexistent", pageable)

        then:
        1 * groupRepository.searchPublicGroupsAnon(null, "xyznonexistent", pageable) >> rawPage
        0 * userService.getUsersByIds(_)

        and: "empty page is returned"
        result.totalElements == 0
        result.content.isEmpty()
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

    // B6a — Pinned posts

    def "pinPost should pin post successfully when caller is admin"() {
        given: "an admin and a valid GROUP_POST"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()
        def postResponse = PostResponse.builder()
                .id(42L).groupId(testGroup.id).postType(PostType.GROUP_POST).content("Hello").build()
        def savedPin = GroupPinnedPost.builder()
                .id(1L).groupId(testGroup.id).postId(42L).pinnedBy(userId)
                .pinnedAt(LocalDateTime.now()).build()

        when: "pinning the post"
        def result = groupService.pinPost(testGroup.id, userId, 42L)

        then: "all guards pass and pin is saved"
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        1 * pinnedPostRepository.countByGroupId(testGroup.id) >> 0L
        1 * pinnedPostRepository.existsByGroupIdAndPostId(testGroup.id, 42L) >> false
        1 * postService.getPostById(42L, userId) >> postResponse
        1 * pinnedPostRepository.save(_ as GroupPinnedPost) >> savedPin

        and: "response has correct fields"
        result.postId == 42L
        result.pinnedBy == userId
        result.post.id == 42L
    }

    def "pinPost should throw BadRequestException when pin limit is reached"() {
        given: "caller is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()

        when: "trying to pin an 11th post"
        groupService.pinPost(testGroup.id, userId, 99L)

        then: "pin count is already 10"
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * pinnedPostRepository.countByGroupId(testGroup.id) >> 10L
        0 * pinnedPostRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "pinPost should throw BadRequestException when post is already pinned"() {
        given: "caller is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()

        when: "pinning a post that is already pinned"
        groupService.pinPost(testGroup.id, userId, 42L)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * pinnedPostRepository.countByGroupId(testGroup.id) >> 1L
        1 * pinnedPostRepository.existsByGroupIdAndPostId(testGroup.id, 42L) >> true
        0 * pinnedPostRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "pinPost should throw BadRequestException when post belongs to a different group"() {
        given: "caller is owner, post belongs to group 99"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()
        def foreignPost = PostResponse.builder()
                .id(42L).groupId(99L).postType(PostType.GROUP_POST).build()

        when: "pinning a post from another group"
        groupService.pinPost(testGroup.id, userId, 42L)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * pinnedPostRepository.countByGroupId(testGroup.id) >> 0L
        1 * pinnedPostRepository.existsByGroupIdAndPostId(testGroup.id, 42L) >> false
        1 * postService.getPostById(42L, userId) >> foreignPost
        0 * pinnedPostRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "pinPost should throw BadRequestException when post is not GROUP_POST type"() {
        given: "caller is owner, post is USER_FEED"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()
        def feedPost = PostResponse.builder()
                .id(42L).groupId(testGroup.id).postType(PostType.USER_FEED).build()

        when: "pinning a USER_FEED post"
        groupService.pinPost(testGroup.id, userId, 42L)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * pinnedPostRepository.countByGroupId(testGroup.id) >> 0L
        1 * pinnedPostRepository.existsByGroupIdAndPostId(testGroup.id, 42L) >> false
        1 * postService.getPostById(42L, userId) >> feedPost
        0 * pinnedPostRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "pinPost should throw BadRequestException when caller is regular member"() {
        given: "caller is regular member"
        def regularMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(memberRole.id).build()

        when: "member tries to pin"
        groupService.pinPost(testGroup.id, userId, 42L)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        0 * pinnedPostRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "unpinPost should delete pin when caller is owner or admin"() {
        given: "caller is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()

        when: "unpinning post 42"
        groupService.unpinPost(testGroup.id, userId, 42L)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * pinnedPostRepository.deleteByGroupIdAndPostId(testGroup.id, 42L)
    }

    def "unpinPost should throw BadRequestException when caller is regular member"() {
        given: "caller is regular member"
        def regularMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(memberRole.id).build()

        when: "member tries to unpin"
        groupService.unpinPost(testGroup.id, userId, 42L)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        0 * pinnedPostRepository.deleteByGroupIdAndPostId(_, _)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "getPinnedPosts should return all pinned posts ordered by pinnedAt desc for a member"() {
        given: "two pins and their post data"
        def pin1 = GroupPinnedPost.builder()
                .postId(10L).groupId(testGroup.id).pinnedBy(userId)
                .pinnedAt(LocalDateTime.now().minusHours(1)).build()
        def pin2 = GroupPinnedPost.builder()
                .postId(20L).groupId(testGroup.id).pinnedBy(userId)
                .pinnedAt(LocalDateTime.now()).build()
        def post1 = PostResponse.builder().id(10L).content("First").build()
        def post2 = PostResponse.builder().id(20L).content("Second").build()

        and: "caller is a member"
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true

        when: "fetching pinned posts"
        def result = groupService.getPinnedPosts(testGroup.id, userId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * pinnedPostRepository.findByGroupIdOrderByPinnedAtDesc(testGroup.id) >> [pin2, pin1]
        1 * postService.getPostById(20L, userId) >> post2
        1 * postService.getPostById(10L, userId) >> post1

        and: "both pinned posts are returned in order"
        result.size() == 2
        result[0].postId == 20L
        result[1].postId == 10L
    }

    def "getPinnedPosts should throw BadRequestException when caller is not a member"() {
        when: "a non-member tries to fetch pinned posts"
        groupService.getPinnedPosts(testGroup.id, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        0 * pinnedPostRepository.findByGroupIdOrderByPinnedAtDesc(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    // ─── Invitation tests ─────────────────────────────────────────────────────

    def "createInvitation should create invitation when all guards pass"() {
        given:
        def inviteeId = UUID.randomUUID()
        def request = CreateInvitationRequest.builder().inviteeId(inviteeId).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).allowMemberInvites(true).build()
        def savedInvitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(inviteeId)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()

        when:
        def response = groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, inviteeId) >> false
        1 * userFriendService.areFriends(userId, inviteeId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, inviteeId, _) >> false
        1 * invitationRepository.save(_ as GroupInvitation) >> savedInvitation
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (inviteeId): testUser]
        response.status == "pending_owner"
        response.groupId == testGroup.id
    }

    def "createInvitation should throw when inviter is not a member"() {
        given:
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()

        when:
        groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> false
        thrown(BadRequestException)
    }

    def "createInvitation should throw when allowMemberInvites is false"() {
        given:
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).allowMemberInvites(false).build()

        when:
        groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        thrown(BadRequestException)
    }

    def "createInvitation should throw when invitee is already a member"() {
        given:
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).allowMemberInvites(true).build()

        when:
        groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> true
        thrown(BadRequestException)
    }

    def "createInvitation should throw when inviter and invitee are not friends"() {
        given:
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).allowMemberInvites(true).build()

        when:
        groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> false
        0 * invitationRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "createInvitation should silently return existing invitation when duplicate pending exists"() {
        given:
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).allowMemberInvites(true).build()
        def existing = GroupInvitation.builder()
                .id(99L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()

        when:
        def response = groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> true
        1 * invitationRepository.findByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> Optional.of(existing)
        0 * invitationRepository.save(_)
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser]
        response.id == 99L
    }

    def "approveInvitation should move status to pending_user"() {
        given:
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(UUID.randomUUID())
                .status("pending_owner").build()

        when:
        groupService.approveInvitation(1L, userId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build())
        1 * invitationRepository.save({ it.status == "pending_user" })
    }

    def "approveInvitation should throw when caller is not owner or admin"() {
        given:
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(UUID.randomUUID())
                .status("pending_owner").build()

        when:
        groupService.approveInvitation(1L, otherUserId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        2 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.empty()
        thrown(BadRequestException)
    }

    def "approveInvitation should throw when invitation is not in pending_owner status"() {
        given:
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(UUID.randomUUID())
                .status("pending_user").build()

        when:
        groupService.approveInvitation(1L, userId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build())
        thrown(BadRequestException)
    }

    def "acceptInvitation should add invitee as group_member"() {
        given:
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_user").build()

        when:
        groupService.acceptInvitation(1L, inviteeId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.save({ it.userId == inviteeId && it.roleId == memberRole.id })
        1 * invitationRepository.save({ it.status == "accepted" })
    }

    def "acceptInvitation should throw when caller is not the invitee"() {
        given:
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(UUID.randomUUID())
                .status("pending_user").build()

        when:
        groupService.acceptInvitation(1L, userId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        thrown(BadRequestException)
    }

    def "rejectInvitation should set status to declined_by_user"() {
        given:
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_user").build()

        when:
        groupService.rejectInvitation(1L, inviteeId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * invitationRepository.save({ it.status == "declined_by_user" })
    }

    def "rejectInvitation should throw when invitation is not in pending_user status"() {
        given:
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_owner").build()

        when:
        groupService.rejectInvitation(1L, inviteeId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        thrown(BadRequestException)
    }

    def "declineInvitation should set status to declined_by_owner"() {
        given:
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(UUID.randomUUID())
                .status("pending_owner").build()

        when:
        groupService.declineInvitation(1L, userId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build())
        1 * invitationRepository.save({ it.status == "declined_by_owner" })
    }

    def "getGroupInvitations should throw when caller is not owner or admin"() {
        given:
        def pageable = PageRequest.of(0, 10)

        when:
        groupService.getGroupInvitations(testGroup.id, otherUserId, pageable)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        2 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.empty()
        thrown(BadRequestException)
    }

    def "getMemberSentInvitations should throw when caller is not a member"() {
        given:
        def pageable = PageRequest.of(0, 10)

        when:
        groupService.getMemberSentInvitations(testGroup.id, otherUserId, pageable)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        thrown(BadRequestException)
    }

    // ─── removeMember ─────────────────────────────────────────────────────────

    def "removeMember should delete membership when caller is admin"() {
        given: "admin removes a regular member"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()
        def targetMember = GroupMember.builder()
                .groupId(testGroup.id).userId(otherUserId).roleId(memberRole.id).build()

        when:
        groupService.removeMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.of(targetMember)
        1 * groupMemberRepository.deleteByGroupIdAndUserId(testGroup.id, otherUserId)
    }

    def "removeMember should throw NotFoundException when group does not exist"() {
        when:
        groupService.removeMember(999L, userId, otherUserId)

        then:
        1 * groupRepository.existsById(999L) >> false
        0 * groupMemberRepository.deleteByGroupIdAndUserId(_, _)
        thrown(NotFoundException)
    }

    def "removeMember should throw BadRequestException when caller is not admin or owner"() {
        given: "caller is regular member"
        def callerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(memberRole.id).build()

        when:
        groupService.removeMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(callerMember)
        0 * groupMemberRepository.deleteByGroupIdAndUserId(_, _)
        thrown(BadRequestException)
    }

    def "removeMember should throw BadRequestException when target is group owner"() {
        given: "admin tries to remove the group owner"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(otherUserId).roleId(ownerRole.id).build()

        when:
        groupService.removeMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.of(ownerMember)
        0 * groupMemberRepository.deleteByGroupIdAndUserId(_, _)
        thrown(BadRequestException)
    }

    // ─── leaveMember ──────────────────────────────────────────────────────────

    def "leaveMember should delete membership when caller is regular member"() {
        given: "regular member wants to leave"
        def callerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(memberRole.id).build()

        when:
        groupService.leaveMember(testGroup.id, userId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(callerMember)
        1 * groupMemberRepository.deleteByGroupIdAndUserId(testGroup.id, userId)
    }

    def "leaveMember should throw NotFoundException when group does not exist"() {
        when:
        groupService.leaveMember(999L, userId)

        then:
        1 * groupRepository.existsById(999L) >> false
        0 * groupMemberRepository.deleteByGroupIdAndUserId(_, _)
        thrown(NotFoundException)
    }

    def "leaveMember should throw BadRequestException when caller is the group owner"() {
        given: "owner tries to leave without transferring first"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()

        when:
        groupService.leaveMember(testGroup.id, userId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        0 * groupMemberRepository.deleteByGroupIdAndUserId(_, _)
        thrown(BadRequestException)
    }

    // ─── declineJoinRequest ───────────────────────────────────────────────────

    def "declineJoinRequest should set status to declined when caller is admin"() {
        given: "a pending join request and an admin caller"
        def joinRequest = GroupJoinRequest.builder()
                .id(1L).groupId(testGroup.id).userId(otherUserId).status("pending").build()
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()

        when:
        groupService.declineJoinRequest(1L, userId)

        then:
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * joinRequestRepository.save({
            GroupJoinRequest req -> req.status == "declined" && req.reviewedBy == userId
        })
    }

    def "declineJoinRequest should throw NotFoundException when request does not exist"() {
        when:
        groupService.declineJoinRequest(999L, userId)

        then:
        1 * joinRequestRepository.findById(999L) >> Optional.empty()
        0 * joinRequestRepository.save(_)
        thrown(NotFoundException)
    }

    def "declineJoinRequest should throw BadRequestException when caller is not admin"() {
        given: "a pending request and a regular-member caller"
        def joinRequest = GroupJoinRequest.builder()
                .id(1L).groupId(testGroup.id).userId(otherUserId).status("pending").build()
        def callerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(memberRole.id).build()

        when:
        groupService.declineJoinRequest(1L, userId)

        then:
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(callerMember)
        0 * joinRequestRepository.save(_)
        thrown(BadRequestException)
    }

    def "declineJoinRequest should throw BadRequestException when request is not pending"() {
        given: "an already-accepted request and an admin caller"
        def joinRequest = GroupJoinRequest.builder()
                .id(1L).groupId(testGroup.id).userId(otherUserId).status("accepted").build()
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()

        when:
        groupService.declineJoinRequest(1L, userId)

        then:
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        0 * joinRequestRepository.save(_)
        thrown(BadRequestException)
    }

    // ─── addMember ────────────────────────────────────────────────────────────

    def "addMember should create membership when caller is admin"() {
        given: "admin adds a new user as group_member"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()

        when:
        groupService.addMember(testGroup.id, userId, otherUserId, "group_member")

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.save({
            GroupMember m -> m.userId == otherUserId && m.roleId == memberRole.id
        })
    }

    def "addMember should throw NotFoundException when group does not exist"() {
        when:
        groupService.addMember(999L, userId, otherUserId, "group_member")

        then:
        1 * groupRepository.existsById(999L) >> false
        0 * groupMemberRepository.save(_)
        thrown(NotFoundException)
    }

    def "addMember should throw BadRequestException when caller is not admin or owner"() {
        given: "regular member tries to add someone"
        def callerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(memberRole.id).build()

        when:
        groupService.addMember(testGroup.id, userId, otherUserId, "group_member")

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(callerMember)
        0 * groupMemberRepository.save(_)
        thrown(BadRequestException)
    }

    def "addMember should throw BadRequestException when target is already a member"() {
        given: "admin tries to add a user who is already a member"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()

        when:
        groupService.addMember(testGroup.id, userId, otherUserId, "group_member")

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> true
        0 * groupMemberRepository.save(_)
        thrown(BadRequestException)
    }

    // ─── updateMemberRole ─────────────────────────────────────────────────────

    def "updateMemberRole should promote member to admin when caller is owner"() {
        given: "owner promotes a regular member to admin"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()
        def targetMember = GroupMember.builder()
                .groupId(testGroup.id).userId(otherUserId).roleId(memberRole.id).build()

        when:
        groupService.updateMemberRole(testGroup.id, userId, otherUserId, "group_admin")

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.of(targetMember)
        1 * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        1 * groupMemberRepository.save({ GroupMember m -> m.roleId == adminRole.id })
    }

    def "updateMemberRole should throw BadRequestException when caller is not owner"() {
        given: "admin tries to change another member's role"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()

        when:
        groupService.updateMemberRole(testGroup.id, userId, otherUserId, "group_member")

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        0 * groupMemberRepository.save(_)
        thrown(BadRequestException)
    }

    def "updateMemberRole should throw BadRequestException when target is the owner"() {
        given: "owner tries to change the ownership target's role directly"
        def callerOwnerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()
        def targetOwnerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(otherUserId).roleId(ownerRole.id).build()

        when:
        groupService.updateMemberRole(testGroup.id, userId, otherUserId, "group_admin")

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(callerOwnerMember)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.of(targetOwnerMember)
        0 * groupMemberRepository.save(_)
        thrown(BadRequestException)
    }

    def "updateMemberRole should throw BadRequestException when assigning group_owner role directly"() {
        given: "owner tries to assign the owner role via updateMemberRole instead of transferOwnership"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()
        def targetMember = GroupMember.builder()
                .groupId(testGroup.id).userId(otherUserId).roleId(memberRole.id).build()

        when:
        groupService.updateMemberRole(testGroup.id, userId, otherUserId, "group_owner")

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.of(targetMember)
        0 * groupMemberRepository.save(_)
        thrown(BadRequestException)
    }

    // ─── getGroupMembers ──────────────────────────────────────────────────────

    def "getGroupMembers should return page of members when group exists"() {
        given: "a group with one member"
        def pageable = PageRequest.of(0, 10)
        def membership = GroupMember.builder()
                .id(1L).groupId(testGroup.id).userId(otherUserId).roleId(memberRole.id).build()
        def membersPage = new PageImpl<>([membership])

        when:
        def result = groupService.getGroupMembers(testGroup.id, userId, pageable)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.findByGroupId(testGroup.id, pageable) >> membersPage
        // page-level batching: one getUsersByIds call and one findAllById call for the whole page
        1 * userService.getUsersByIds([otherUserId]) >> [(otherUserId): testUser]
        1 * groupRoleRepository.findAllById([memberRole.id]) >> [memberRole]

        and:
        result.totalElements == 1
        result.content[0].userId == otherUserId
        result.content[0].roleName == "group_member"
    }

    def "getGroupMembers should throw NotFoundException when group does not exist"() {
        given:
        def pageable = PageRequest.of(0, 10)

        when:
        groupService.getGroupMembers(999L, userId, pageable)

        then:
        1 * groupRepository.existsById(999L) >> false
        0 * groupMemberRepository.findByGroupId(_, _)
        thrown(NotFoundException)
    }

    // ─── getGroupSettings ─────────────────────────────────────────────────────

    def "getGroupSettings should return settings when caller is a member"() {
        given: "existing settings for the group"
        def settings = GroupSettings.builder()
                .id(1L).groupId(testGroup.id)
                .allowMemberPosts(true).requirePostApproval(false).allowMemberInvites(false)
                .build()

        when:
        def result = groupService.getGroupSettings(testGroup.id, userId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)

        and:
        result != null
        result.allowMemberPosts == true
        result.requirePostApproval == false
    }

    def "getGroupSettings should throw NotFoundException when group does not exist"() {
        when:
        groupService.getGroupSettings(999L, userId)

        then:
        1 * groupRepository.existsById(999L) >> false
        0 * groupSettingsRepository.findByGroupId(_)
        thrown(NotFoundException)
    }

    def "getGroupSettings should throw BadRequestException when caller is not a member"() {
        when:
        groupService.getGroupSettings(testGroup.id, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        0 * groupSettingsRepository.findByGroupId(_)
        thrown(BadRequestException)
    }

    // ─── getUserJoinRequests ──────────────────────────────────────────────────

    def "getUserJoinRequests should return pending requests for the caller"() {
        given: "a pending join request with no reviewedBy"
        def pageable = PageRequest.of(0, 10)
        def joinRequest = GroupJoinRequest.builder()
                .id(1L).groupId(testGroup.id).userId(userId).status("pending")
                .message("Let me in").createdAt(LocalDateTime.now()).build()
        def requestsPage = new PageImpl<>([joinRequest])

        when:
        def result = groupService.getUserJoinRequests(userId, pageable)

        then:
        1 * joinRequestRepository.findByUserIdAndStatus(userId, "pending", pageable) >> requestsPage
        // page-level batching: one findAllById call (groupName) and one batched getUsersByIds call
        1 * groupRepository.findAllById([testGroup.id]) >> [testGroup]
        1 * userService.getUsersByIds([userId]) >> [(userId): testUser]

        and:
        result.totalElements == 1
        result.content[0].status == "pending"
        result.content[0].groupName == testGroup.groupName
    }

    def "getUserJoinRequests should return empty page when user has no pending requests"() {
        given:
        def pageable = PageRequest.of(0, 10)

        when:
        def result = groupService.getUserJoinRequests(userId, pageable)

        then:
        1 * joinRequestRepository.findByUserIdAndStatus(userId, "pending", pageable) >> new PageImpl<>([])
        0 * groupRepository.findAllById(_)
        0 * userService.getUsersByIds(_)

        and:
        result.totalElements == 0
        result.content.isEmpty()
    }
}
