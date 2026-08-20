package com.sportconnect.group.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.group.api.dto.*
import com.sportconnect.group.entity.*
import com.sportconnect.group.repository.*
import com.sportconnect.location.api.dto.LocationResponse
import com.sportconnect.location.api.service.LocationService
import com.sportconnect.social.post.api.dto.PostResponse
import com.sportconnect.social.post.api.dto.PostType
import com.sportconnect.social.post.api.service.PostService
import com.sportconnect.sport.api.dto.SportResponse
import com.sportconnect.sport.api.service.SportService
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserFriendService
import com.sportconnect.user.api.service.UserService
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import org.springframework.data.redis.connection.stream.MapRecord
import org.springframework.data.redis.core.StreamOperations
import org.springframework.data.redis.core.StringRedisTemplate
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

class GroupServiceImplSpec extends Specification {

    GroupRepository groupRepository = Mock()
    GroupMemberRepository groupMemberRepository = Mock()
    GroupJoinRequestRepository joinRequestRepository = Mock()
    GroupSettingsRepository groupSettingsRepository = Mock()
    GroupRoleRepository groupRoleRepository = Mock()
    GroupTypeRepository groupTypeRepository = Mock()
    UserService userService = Mock()
    UserFriendService userFriendService = Mock()
    SportService sportService = Mock()
    UserSportProfileService userSportProfileService = Mock()
    PostService postService = Mock()
    GroupPinnedPostRepository pinnedPostRepository = Mock()
    GroupInvitationRepository invitationRepository = Mock()
    GroupInvitationInviterRepository invitationInviterRepository = Mock()
    StringRedisTemplate stringRedisTemplate = Mock()
    // Real instance, not a Mock() — a pure value-converter with no side effects, and using the
    // real one lets tests assert on the actual serialized payload publishDomainEvent produces.
    ObjectMapper objectMapper = new ObjectMapper()
    LocationService locationService = Mock()

    @Subject
    GroupServiceImpl groupService = new GroupServiceImpl(
            groupRepository,
            groupMemberRepository,
            joinRequestRepository,
            groupSettingsRepository,
            groupRoleRepository,
            groupTypeRepository,
            userService,
            userFriendService,
            sportService,
            userSportProfileService,
            postService,
            pinnedPostRepository,
            invitationRepository,
            invitationInviterRepository,
            stringRedisTemplate,
            objectMapper,
            locationService
    )

    // A7: createGroup now resolves the sport before the profile gate, so every createGroup
    // test has to stub SportService. Two fixtures cover the only distinction that matters.
    SportResponse activeSport = SportResponse.builder().id(1L).name("Badminton").isActive(true).build()

    UUID userId = UUID.randomUUID()
    UUID otherUserId = UUID.randomUUID()
    Group testGroup
    GroupRole ownerRole
    GroupRole adminRole
    GroupRole memberRole
    GroupType defaultGroupType
    UserResponse testUser

    def setup() {
        // Default every test's group to active — isGroupOwner/isGroupAdmin/isGroupMember (B18) all
        // gate on this first. Tests exercising the soft-deleted-group path override this per-test
        // with a more specific stub, which Spock resolves in declaration order (last wins).
        groupRepository.existsByIdAndIsActiveTrue(_) >> true

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

        defaultGroupType = GroupType.builder()
                .id(1L)
                .typeName("DEFAULT")
                .maxMembers(50)
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
        1 * sportService.requireActiveSportById(1L) >> activeSport
        1 * userSportProfileService.hasActiveProfileForActiveSport(userId, 1L) >> true
        1 * groupRepository.save(_ as Group) >> testGroup
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.save(_ as GroupMember) >> new GroupMember()
        1 * groupTypeRepository.findByTypeName("DEFAULT") >> Optional.of(defaultGroupType)
        1 * groupSettingsRepository.save({ GroupSettings s -> s.groupTypeId == defaultGroupType.id }) >> new GroupSettings()
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

    def "createGroup should throw BadRequestException when the sport is deactivated"() {
        given: "a create group request naming a sport an admin has deactivated"
        def request = CreateGroupRequest.builder()
                .sportId(1L)
                .groupName("New Group")
                .isPrivate(false)
                .build()

        when: "creating a group"
        groupService.createGroup(userId, request)

        then: "a deactivated sport is indistinguishable from a missing one (A7)"
        1 * groupRepository.existsByGroupName(request.groupName) >> false
        1 * sportService.requireActiveSportById(1L) >> { throw new ResourceNotFoundException("Sport", "id", 1L) }
        0 * userSportProfileService.hasActiveProfileForActiveSport(_, _)

        and: "nothing is persisted"
        0 * groupRepository.save(_)
        0 * groupMemberRepository.save(_)

        and: "it surfaces as not-found, not as the user lacking a profile"
        thrown(ResourceNotFoundException)
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
        1 * sportService.requireActiveSportById(99L) >> SportResponse.builder().id(99L).name("Squash").isActive(true).build()
        1 * userSportProfileService.hasActiveProfileForActiveSport(userId, 99L) >> false
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
        1 * postService.getPostsByIds([10L], userId) >> [(10L): pinnedPostResponse]

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

    // A9 — privacy/membership check on getGroup

    def "getGroup should throw BadRequestException when group is private and caller is not a member"() {
        given: "a private group"
        testGroup.isPrivate = true
        def privateGroup = testGroup

        when: "a non-member requests the group"
        groupService.getGroup(privateGroup.id, otherUserId)

        then: "membership is checked and denied"
        1 * groupRepository.findByIdAndIsActiveTrue(privateGroup.id) >> Optional.of(privateGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(privateGroup.id, otherUserId) >> false

        and: "exception is thrown before any response data is built"
        thrown(BadRequestException)
        0 * userService.getUsersByIds(_)
        0 * pinnedPostRepository.findTop3ByGroupIdOrderByPinnedAtDesc(_)
    }

    def "getGroup should throw BadRequestException when group is private and caller is anonymous"() {
        given: "a private group"
        testGroup.isPrivate = true
        def privateGroup = testGroup

        when: "an unauthenticated caller requests the group"
        groupService.getGroup(privateGroup.id, null)

        then: "denied without a membership lookup"
        1 * groupRepository.findByIdAndIsActiveTrue(privateGroup.id) >> Optional.of(privateGroup)
        0 * groupMemberRepository.existsByGroupIdAndUserId(_, _)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "getGroup should return group when private and caller is a member"() {
        given: "a private group and a pinned post"
        testGroup.isPrivate = true
        def privateGroup = testGroup
        def pin = GroupPinnedPost.builder()
                .postId(10L).groupId(privateGroup.id).pinnedBy(userId)
                .pinnedAt(LocalDateTime.now()).build()
        def pinnedPostResponse = PostResponse.builder().id(10L).groupId(privateGroup.id)
                .postType(PostType.GROUP_POST).content("Pinned content").build()

        when: "a member requests the group"
        def response = groupService.getGroup(privateGroup.id, userId)

        then: "membership is confirmed and full details are returned"
        1 * groupRepository.findByIdAndIsActiveTrue(privateGroup.id) >> Optional.of(privateGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(privateGroup.id, userId) >> true
        1 * userService.getUsersByIds(_) >> [(userId): testUser]
        1 * groupMemberRepository.countByGroupId(privateGroup.id) >> 5L
        1 * groupMemberRepository.findByGroupIdAndUserId(privateGroup.id, userId) >>
                Optional.of(GroupMember.builder().roleId(memberRole.id).build())
        1 * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
        1 * pinnedPostRepository.findTop3ByGroupIdOrderByPinnedAtDesc(privateGroup.id) >> [pin]
        1 * postService.getPostsByIds([10L], userId) >> [(10L): pinnedPostResponse]

        and: "response is correct"
        response != null
        response.pinnedPosts.size() == 1
    }

    def "getGroup should return group when public and caller is not a member"() {
        when: "a non-member requests a public group"
        def response = groupService.getGroup(testGroup.id, otherUserId)

        then: "no membership check is performed and full details are returned"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        0 * groupMemberRepository.existsByGroupIdAndUserId(_, _)
        1 * userService.getUsersByIds(_) >> [(otherUserId): testUser]
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 5L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.empty()
        1 * pinnedPostRepository.findTop3ByGroupIdOrderByPinnedAtDesc(testGroup.id) >> []
        1 * postService.getPostsByIds([], otherUserId) >> [:]

        and: "response is correct"
        response != null
        response.currentUserRole == null
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
        _ * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "updateGroup should update group when user is admin"() {
        given: "an update request"
        def request = UpdateGroupRequest.builder()
                .description("Updated Description")
                .build()

        and: "user is admin"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(adminRole.id)
                .build()

        when: "updating group"
        def response = groupService.updateGroup(testGroup.id, userId, request)

        then: "group is updated"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        1 * groupRepository.save(_ as Group) >> testGroup
        1 * userService.getUsersByIds(_) >> [(userId): testUser]
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)

        and: "response is returned"
        response != null
    }

    def "updateGroup should persist isPrivate when provided"() {
        given: "a request toggling privacy"
        def request = UpdateGroupRequest.builder()
                .isPrivate(true)
                .build()

        and: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        when: "updating group"
        groupService.updateGroup(testGroup.id, userId, request)

        then: "isPrivate is set on the saved group"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        1 * groupRepository.save({ Group g -> g.isPrivate == true }) >> testGroup
        1 * userService.getUsersByIds(_) >> [(userId): testUser]
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
    }

    def "updateGroup should throw BadRequestException when new group name already exists"() {
        given: "a request renaming to a name already taken by another group"
        def request = UpdateGroupRequest.builder()
                .groupName("Taken Name")
                .build()

        and: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        when: "updating group"
        groupService.updateGroup(testGroup.id, userId, request)

        then: "the pre-check catches the conflict"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        1 * groupRepository.existsByGroupName("Taken Name") >> true
        0 * groupRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "updateGroup should translate a concurrent groupName conflict at save-time into BadRequestException"() {
        given: "a rename that passes the pre-check but loses a race to a concurrent rename"
        def request = UpdateGroupRequest.builder()
                .groupName("Racing Name")
                .build()

        and: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        when: "updating group"
        groupService.updateGroup(testGroup.id, userId, request)

        then: "the pre-check passes, but the DB unique constraint catches the race at save time"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        1 * groupRepository.existsByGroupName("Racing Name") >> false
        1 * groupRepository.save(_ as Group) >> { throw new org.springframework.dao.DataIntegrityViolationException("duplicate key") }

        and: "translated into the same friendly error the pre-check would have thrown"
        BadRequestException ex = thrown(BadRequestException)
        ex.message == "Group name already exists"
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

        and: "group has room under its type cap"
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()

        when: "creating join request"
        def response = groupService.createJoinRequest(userId, request)

        then: "join request is created"
        1 * groupRepository.findByGroupName(request.groupName) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> false
        1 * invitationRepository.findByGroupIdAndInviteeIdAndStatusIn(testGroup.id, userId, ["pending_user"]) >> Optional.empty()
        1 * joinRequestRepository.existsByGroupIdAndUserIdAndStatus(testGroup.id, userId, "pending") >> false
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * joinRequestRepository.save(_ as GroupJoinRequest) >> savedRequest
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        _ * userService.getUsersByIds(_) >> [(userId): testUser]

        and: "response is correct"
        response != null
        response.status == "pending"
    }

    def "createJoinRequest should throw BadRequestException when group is at its member cap"() {
        given: "a join request for a full group"
        def request = CreateJoinRequestRequest.builder()
                .groupName("Test Group")
                .message("I want to join")
                .build()
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()

        when: "creating join request"
        groupService.createJoinRequest(userId, request)

        then: "request is rejected before it is ever persisted"
        1 * groupRepository.findByGroupName(request.groupName) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> false
        1 * invitationRepository.findByGroupIdAndInviteeIdAndStatusIn(testGroup.id, userId, ["pending_user"]) >> Optional.empty()
        1 * joinRequestRepository.existsByGroupIdAndUserIdAndStatus(testGroup.id, userId, "pending") >> false
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> defaultGroupType.maxMembers
        0 * joinRequestRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
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

    def "createJoinRequest should auto-accept a pending_user invitation instead of creating an ordinary pending request (B11 rule 3)"() {
        given: "an invitation already awaiting the requester's response"
        def request = CreateJoinRequestRequest.builder()
                .groupName("Test Group")
                .message("I want to join")
                .build()
        def approverId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(7L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(userId)
                .status("pending_user").reviewedBy(approverId).reviewedAt(LocalDateTime.now()).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()
        def ownerMember = GroupMember.builder().groupId(testGroup.id).userId(approverId).roleId(ownerRole.id).build()
        def savedJoinRequest = GroupJoinRequest.builder()
                .id(20L).groupId(testGroup.id).userId(userId).status("accepted")
                .message(request.message).reviewedBy(approverId).reviewedAt(LocalDateTime.now())
                .createdAt(LocalDateTime.now()).build()

        when:
        def response = groupService.createJoinRequest(userId, request)

        then:
        1 * groupRepository.findByGroupName(request.groupName) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> false
        1 * invitationRepository.findByGroupIdAndInviteeIdAndStatusIn(testGroup.id, userId, ["pending_user"]) >> Optional.of(invitation)

        and: "finalizeMembership runs: capacity, member insert, welcome post"
        1 * groupSettingsRepository.findByGroupIdForUpdate(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.save({ it.userId == userId && it.roleId == memberRole.id })
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndRoleId(testGroup.id, ownerRole.id) >> [ownerMember]
        1 * postService.createSystemPost(testGroup.id, approverId, _ as String)

        and: "invitation is accepted and the join request is recorded as accepted, crediting the invitation's approver"
        1 * invitationRepository.save({ it.status == "accepted" })
        1 * joinRequestRepository.save({ it.status == "accepted" && it.reviewedBy == approverId }) >> savedJoinRequest
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * userService.getUsersByIds([userId, otherUserId]) >> [(userId): testUser, (otherUserId): testUser]
        1 * userService.getUsersByIds([userId, approverId]) >> [(userId): testUser, (approverId): testUser]

        and: "no ordinary pending join request is ever created"
        0 * joinRequestRepository.existsByGroupIdAndUserIdAndStatus(_, _, _)

        and: "response reflects the already-accepted state"
        response.status == "accepted"
        response.reviewedBy == approverId
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

        and: "group has room under its type cap"
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()

        and: "the owner membership, for the welcome post"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()

        when: "accepting join request"
        groupService.acceptJoinRequest(1L, userId)

        then: "request is accepted"
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        1 * groupSettingsRepository.findByGroupIdForUpdate(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.save(_ as GroupMember)
        1 * joinRequestRepository.save({ GroupJoinRequest req -> req.status == "accepted" })

        and: "welcome post is created, authored by the owner"
        1 * userService.getUsersByIds([otherUserId]) >> [(otherUserId): testUser]
        1 * groupMemberRepository.findByGroupIdAndRoleId(testGroup.id, ownerRole.id) >> [ownerMember]
        1 * postService.createSystemPost(testGroup.id, userId, _ as String)
    }

    def "acceptJoinRequest should throw BadRequestException when group is at its member cap"() {
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

        and: "group is already at its DEFAULT-type cap"
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()

        when: "accepting join request"
        groupService.acceptJoinRequest(1L, userId)

        then: "request is rejected before any membership row is created"
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        1 * groupSettingsRepository.findByGroupIdForUpdate(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> defaultGroupType.maxMembers
        0 * groupMemberRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
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
        _ * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)

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

    def "isGroupOwner should return false when the group is soft-deleted, even if the user is owner"() {
        when: "checking if user is owner of a soft-deleted group"
        def result = groupService.isGroupOwner(testGroup.id, userId)

        then: "the active check short-circuits before any role lookup"
        1 * groupRepository.existsByIdAndIsActiveTrue(testGroup.id) >> false
        0 * groupRoleRepository.findByRoleName(_)
        0 * groupMemberRepository.findByGroupIdAndUserId(_, _)

        and: "result is false"
        result == false
    }

    def "isGroupAdmin should return true when user is admin"() {
        given: "user is admin"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(adminRole.id)
                .build()

        when: "checking if user is admin"
        def result = groupService.isGroupAdmin(testGroup.id, userId)

        then: "user is admin"
        1 * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)

        and: "result is true"
        result == true
    }

    def "isGroupAdmin should return false when the group is soft-deleted, even if the user is admin"() {
        when: "checking if user is admin of a soft-deleted group"
        def result = groupService.isGroupAdmin(testGroup.id, userId)

        then: "the active check short-circuits before any role lookup"
        1 * groupRepository.existsByIdAndIsActiveTrue(testGroup.id) >> false
        0 * groupRoleRepository.findByRoleName(_)
        0 * groupMemberRepository.findByGroupIdAndUserId(_, _)

        and: "result is false"
        result == false
    }

    def "isGroupMember should return true when user is a member"() {
        when: "checking if user is a member"
        def result = groupService.isGroupMember(testGroup.id, userId)

        then: "membership is confirmed"
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true

        and: "result is true"
        result == true
    }

    def "isGroupMember should return false when the group is soft-deleted, even if the user is a member"() {
        when: "checking membership of a soft-deleted group"
        def result = groupService.isGroupMember(testGroup.id, userId)

        then: "the active check short-circuits before the membership lookup"
        1 * groupRepository.existsByIdAndIsActiveTrue(testGroup.id) >> false
        0 * groupMemberRepository.existsByGroupIdAndUserId(_, _)

        and: "result is false"
        result == false
    }

    def "isGroupActive should return true for an active group"() {
        when: "checking group activity"
        def result = groupService.isGroupActive(testGroup.id)

        then:
        1 * groupRepository.existsByIdAndIsActiveTrue(testGroup.id) >> true

        and:
        result == true
    }

    def "isGroupActive should return false for a soft-deleted group"() {
        when: "checking group activity"
        def result = groupService.isGroupActive(testGroup.id)

        then:
        1 * groupRepository.existsByIdAndIsActiveTrue(testGroup.id) >> false

        and:
        result == false
    }

    def "isGroupActive should return false for a non-existent group"() {
        when: "checking group activity"
        def result = groupService.isGroupActive(999L)

        then:
        1 * groupRepository.existsByIdAndIsActiveTrue(999L) >> false

        and:
        result == false
    }

    // ─── canManageMembers / canManagePosts (B20: both delegate to the private hasManagerRole,
    // a single findByGroupIdAndUserId + findById(roleId) lookup instead of composing
    // isGroupOwner/isGroupAdmin) ──────────────────────────────────────────────

    def "canManageMembers should return true when user is owner"() {
        given: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()

        when:
        def result = groupService.canManageMembers(testGroup.id, userId)

        then:
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)

        and:
        result == true
    }

    def "canManageMembers should return true when user is admin"() {
        given: "user is admin"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()

        when:
        def result = groupService.canManageMembers(testGroup.id, userId)

        then:
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)

        and:
        result == true
    }

    def "canManageMembers should return false when user is a regular member"() {
        given: "user is a regular member"
        def regularMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(memberRole.id).build()

        when:
        def result = groupService.canManageMembers(testGroup.id, userId)

        then:
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)
        1 * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)

        and:
        result == false
    }

    def "canManageMembers should return false when user is not a member"() {
        when:
        def result = groupService.canManageMembers(testGroup.id, userId)

        then: "no membership row, so the role lookup is never reached"
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.empty()
        0 * groupRoleRepository.findById(_)

        and:
        result == false
    }

    def "canManageMembers should return false when the group is soft-deleted, even if the user would otherwise qualify"() {
        when:
        def result = groupService.canManageMembers(testGroup.id, userId)

        then: "the active check short-circuits before any membership/role lookup"
        1 * groupRepository.existsByIdAndIsActiveTrue(testGroup.id) >> false
        0 * groupMemberRepository.findByGroupIdAndUserId(_, _)
        0 * groupRoleRepository.findById(_)

        and:
        result == false
    }

    def "canManagePosts should return true when user is owner"() {
        given: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()

        when:
        def result = groupService.canManagePosts(testGroup.id, userId)

        then:
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)

        and:
        result == true
    }

    def "canManagePosts should return true when user is admin"() {
        given: "user is admin"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()

        when:
        def result = groupService.canManagePosts(testGroup.id, userId)

        then:
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)

        and:
        result == true
    }

    def "canManagePosts should return false when user is a regular member"() {
        given: "user is a regular member"
        def regularMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(memberRole.id).build()

        when:
        def result = groupService.canManagePosts(testGroup.id, userId)

        then:
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)
        1 * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)

        and:
        result == false
    }

    def "canManagePosts should return false when user is not a member"() {
        when:
        def result = groupService.canManagePosts(testGroup.id, userId)

        then: "no membership row, so the role lookup is never reached"
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.empty()
        0 * groupRoleRepository.findById(_)

        and:
        result == false
    }

    def "canManagePosts should return false when the group is soft-deleted, even if the user would otherwise qualify"() {
        when:
        def result = groupService.canManagePosts(testGroup.id, userId)

        then: "the active check short-circuits before any membership/role lookup"
        1 * groupRepository.existsByIdAndIsActiveTrue(testGroup.id) >> false
        0 * groupMemberRepository.findByGroupIdAndUserId(_, _)
        0 * groupRoleRepository.findById(_)

        and:
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

    def "getGroupInfo should return full info when group is public"() {
        given: "a public group with rules and schedule"
        def groupWithInfo = Group.builder()
                .id(1L)
                .groupName("Test Group")
                .description("A group about testing")
                .avatarUrl("https://example.com/avatar.png")
                .coverUrl("https://example.com/cover.png")
                .rules("No spamming")
                .schedule("Every Sunday 9am")
                .isPrivate(false)
                .isActive(true)
                .createdBy(userId)
                .updatedAt(java.time.LocalDateTime.now())
                .build()

        when: "getting group info"
        def result = groupService.getGroupInfo(1L, otherUserId)

        then: "group is found and full info is returned"
        1 * groupRepository.findByIdAndIsActiveTrue(1L) >> Optional.of(groupWithInfo)
        0 * groupMemberRepository.existsByGroupIdAndUserId(_, _)

        and: "result contains correct fields"
        result != null
        result.groupId == 1L
        result.groupName == "Test Group"
        result.isPrivate == false
        result.description == "A group about testing"
        result.avatarUrl == "https://example.com/avatar.png"
        result.coverUrl == "https://example.com/cover.png"
        result.rules == "No spamming"
        result.schedule == "Every Sunday 9am"
    }

    def "getGroupInfo should throw NotFoundException when group does not exist"() {
        when: "getting info for a non-existent group"
        groupService.getGroupInfo(999L, userId)

        then: "group not found"
        1 * groupRepository.findByIdAndIsActiveTrue(999L) >> Optional.empty()

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "getGroupInfo should return only groupName and isPrivate when group is private and caller is not a member"() {
        given: "a private group"
        testGroup.isPrivate = true
        def privateGroup = testGroup

        when: "a non-member requests the group's info"
        def result = groupService.getGroupInfo(privateGroup.id, otherUserId)

        then: "membership is checked and denied"
        1 * groupRepository.findByIdAndIsActiveTrue(privateGroup.id) >> Optional.of(privateGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(privateGroup.id, otherUserId) >> false

        and: "only the stub fields are populated"
        result.groupId == privateGroup.id
        result.groupName == privateGroup.groupName
        result.isPrivate == true
        result.description == null
        result.avatarUrl == null
        result.coverUrl == null
        result.rules == null
        result.schedule == null
        result.updatedAt == null
    }

    def "getGroupInfo should return only groupName and isPrivate when group is private and caller is anonymous"() {
        given: "a private group"
        testGroup.isPrivate = true
        def privateGroup = testGroup

        when: "an unauthenticated caller requests the group's info"
        def result = groupService.getGroupInfo(privateGroup.id, null)

        then: "denied without a membership lookup"
        1 * groupRepository.findByIdAndIsActiveTrue(privateGroup.id) >> Optional.of(privateGroup)
        0 * groupMemberRepository.existsByGroupIdAndUserId(_, _)

        and: "only the stub fields are populated"
        result.groupName == privateGroup.groupName
        result.isPrivate == true
        result.rules == null
    }

    def "getGroupInfo should return full info when group is private and caller is a member"() {
        given: "a private group"
        testGroup.isPrivate = true
        testGroup.rules = "Be respectful"
        def privateGroup = testGroup

        when: "a member requests the group's info"
        def result = groupService.getGroupInfo(privateGroup.id, userId)

        then: "membership is confirmed and full info is returned"
        1 * groupRepository.findByIdAndIsActiveTrue(privateGroup.id) >> Optional.of(privateGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(privateGroup.id, userId) >> true

        and: "result contains full fields"
        result.groupId == privateGroup.id
        result.isPrivate == true
        result.rules == "Be respectful"
    }

    def "getGroupGeneralData should return full data when group is public"() {
        given: "a public group with rules and schedule"
        def groupWithInfo = Group.builder()
                .id(1L)
                .groupName("Test Group")
                .description("A group about testing")
                .avatarUrl("https://example.com/avatar.png")
                .coverUrl("https://example.com/cover.png")
                .rules("No spamming")
                .schedule("Every Sunday 9am")
                .isPrivate(false)
                .isActive(true)
                .createdBy(userId)
                .updatedAt(java.time.LocalDateTime.now())
                .build()

        when: "getting group general data"
        def result = groupService.getGroupGeneralData(1L, otherUserId)

        then: "group is found and full data is returned"
        1 * groupRepository.findByIdAndIsActiveTrue(1L) >> Optional.of(groupWithInfo)
        0 * groupMemberRepository.existsByGroupIdAndUserId(_, _)

        and: "result contains correct fields"
        result != null
        result.groupId == 1L
        result.groupName == "Test Group"
        result.isPrivate == false
        result.description == "A group about testing"
        result.avatarUrl == "https://example.com/avatar.png"
        result.coverUrl == "https://example.com/cover.png"
        result.rules == "No spamming"
        result.schedule == "Every Sunday 9am"
    }

    def "getGroupGeneralData should throw NotFoundException when group does not exist"() {
        when: "getting general data for a non-existent group"
        groupService.getGroupGeneralData(999L, userId)

        then: "group not found"
        1 * groupRepository.findByIdAndIsActiveTrue(999L) >> Optional.empty()

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "getGroupGeneralData should return only groupName and isPrivate when group is private and caller is not a member"() {
        given: "a private group"
        testGroup.isPrivate = true
        def privateGroup = testGroup

        when: "a non-member requests the group's general data"
        def result = groupService.getGroupGeneralData(privateGroup.id, otherUserId)

        then: "membership is checked and denied"
        1 * groupRepository.findByIdAndIsActiveTrue(privateGroup.id) >> Optional.of(privateGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(privateGroup.id, otherUserId) >> false

        and: "only the stub fields are populated"
        result.groupId == privateGroup.id
        result.groupName == privateGroup.groupName
        result.isPrivate == true
        result.description == null
        result.avatarUrl == null
        result.coverUrl == null
        result.rules == null
        result.schedule == null
        result.updatedAt == null
    }

    def "getGroupGeneralData should return only groupName and isPrivate when group is private and caller is anonymous"() {
        given: "a private group"
        testGroup.isPrivate = true
        def privateGroup = testGroup

        when: "an unauthenticated caller requests the group's general data"
        def result = groupService.getGroupGeneralData(privateGroup.id, null)

        then: "denied without a membership lookup"
        1 * groupRepository.findByIdAndIsActiveTrue(privateGroup.id) >> Optional.of(privateGroup)
        0 * groupMemberRepository.existsByGroupIdAndUserId(_, _)

        and: "only the stub fields are populated"
        result.groupName == privateGroup.groupName
        result.isPrivate == true
        result.rules == null
    }

    def "getGroupGeneralData should return full data when group is private and caller is a member"() {
        given: "a private group"
        testGroup.isPrivate = true
        testGroup.rules = "Be respectful"
        def privateGroup = testGroup

        when: "a member requests the group's general data"
        def result = groupService.getGroupGeneralData(privateGroup.id, userId)

        then: "membership is confirmed and full data is returned"
        1 * groupRepository.findByIdAndIsActiveTrue(privateGroup.id) >> Optional.of(privateGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(privateGroup.id, userId) >> true

        and: "result contains full fields"
        result.groupId == privateGroup.id
        result.isPrivate == true
        result.rules == "Be respectful"
    }

    def "updateGroupGeneralData should update group when user is owner"() {
        given: "a request with rules and schedule"
        def request = UpdateGroupGeneralDataRequest.builder()
                .rules("Be respectful")
                .schedule("Weekends only")
                .build()

        and: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        when: "updating general data"
        def response = groupService.updateGroupGeneralData(testGroup.id, userId, request)

        then: "group is found, permission is checked, and rules/schedule are saved"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRepository.save({ Group g -> g.rules == "Be respectful" && g.schedule == "Weekends only" }) >> testGroup

        and: "response is returned"
        response != null
    }

    def "updateGroupGeneralData should update group when user is admin"() {
        given: "a request updating the description"
        def request = UpdateGroupGeneralDataRequest.builder()
                .description("Updated description")
                .build()

        and: "user is admin"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(adminRole.id)
                .build()

        when: "updating general data"
        def response = groupService.updateGroupGeneralData(testGroup.id, userId, request)

        then: "group is updated"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        1 * groupRepository.save({ Group g -> g.description == "Updated description" }) >> testGroup

        and: "response is returned"
        response != null
    }

    def "updateGroupGeneralData should throw BadRequestException when user is a regular member"() {
        given: "a request with a new description"
        def request = UpdateGroupGeneralDataRequest.builder()
                .description("Updated description")
                .build()

        and: "user is a regular member"
        def regularMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(memberRole.id)
                .build()

        when: "trying to update general data"
        groupService.updateGroupGeneralData(testGroup.id, userId, request)

        then: "user is not authorized"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
        0 * groupRepository.save(_ as Group)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "updateGroupGeneralData should throw NotFoundException when group does not exist"() {
        given: "a request"
        def request = UpdateGroupGeneralDataRequest.builder().description("Updated description").build()

        when: "trying to update general data for a non-existent group"
        groupService.updateGroupGeneralData(999L, userId, request)

        then: "group not found"
        1 * groupRepository.findByIdAndIsActiveTrue(999L) >> Optional.empty()
        0 * groupRepository.save(_ as Group)

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "updateGroupGeneralData should throw BadRequestException when new group name already exists"() {
        given: "a request renaming to a name already taken by another group"
        def request = UpdateGroupGeneralDataRequest.builder()
                .groupName("Taken Name")
                .build()

        and: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()

        when: "trying to update general data"
        groupService.updateGroupGeneralData(testGroup.id, userId, request)

        then: "group is found, permission passes, but the name conflicts"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        1 * groupRepository.existsByGroupName("Taken Name") >> true
        0 * groupRepository.save(_ as Group)

        and: "exception is thrown"
        thrown(BadRequestException)
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
        // canManageMembers (B20's hasManagerRole) does a single findById(roleId) lookup, not findByRoleName
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
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
        def result = groupService.getPublicGroups(null, null, null, null, pageable)

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
        def result = groupService.getPublicGroups(null, 1L, null, null, pageable)

        then: "anonymous query is called with sportId"
        1 * groupRepository.searchPublicGroupsAnon([1L], null, pageable) >> rawPage
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
        def result = groupService.getPublicGroups(null, null, null, "warrior", pageable)

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
        def result = groupService.getPublicGroups(null, 1L, null, "test", pageable)

        then: "anonymous query is called with both filters"
        1 * groupRepository.searchPublicGroupsAnon([1L], "test", pageable) >> rawPage
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
        def result = groupService.getPublicGroups(userId, null, null, null, pageable)

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
        def result = groupService.getPublicGroups(userId, null, null, null, pageable)

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
        def result = groupService.getPublicGroups(null, null, null, "xyznonexistent", pageable)

        then:
        1 * groupRepository.searchPublicGroupsAnon(null, "xyznonexistent", pageable) >> rawPage
        0 * userService.getUsersByIds(_)

        and: "empty page is returned"
        result.totalElements == 0
        result.content.isEmpty()
    }

    // A10 — multi-value sportIds filter

    def "getPublicGroups should filter by multiple sportIds when provided (anonymous)"() {
        given: "public groups across multiple sports"
        def pageable = PageRequest.of(0, 10)
        def rawPage = new PageImpl<Object[]>([[testGroup, 2L] as Object[]])

        when: "getting public groups with a multi-sport filter, unauthenticated"
        def result = groupService.getPublicGroups(null, null, [1L, 2L], null, pageable)

        then: "anonymous query is called with the sportIds list"
        1 * groupRepository.searchPublicGroupsAnon([1L, 2L], null, pageable) >> rawPage
        1 * userService.getUsersByIds(_) >> [(userId): testUser]

        and: "results are returned"
        result.totalElements == 1
    }

    def "getPublicGroups should treat an empty sportIds list as no sport filter when sportId is also absent"() {
        given: "public groups exist"
        def pageable = PageRequest.of(0, 10)
        def rawPage = new PageImpl<Object[]>([[testGroup, 3L] as Object[]])

        when: "searching with an explicitly empty sportIds list and no legacy sportId"
        def result = groupService.getPublicGroups(null, null, [], null, pageable)

        then: "the anonymous query receives no sport filter, same as omitting both params"
        1 * groupRepository.searchPublicGroupsAnon(null, null, pageable) >> rawPage
        1 * userService.getUsersByIds(_) >> [(userId): testUser]

        and: "results are returned"
        result.totalElements == 1
    }

    def "getPublicGroups should fall back to the legacy sportId when sportIds is empty"() {
        given: "public groups for a specific sport"
        def pageable = PageRequest.of(0, 10)
        def rawPage = new PageImpl<Object[]>([[testGroup, 2L] as Object[]])

        when: "searching with an empty sportIds list but a legacy sportId present"
        def result = groupService.getPublicGroups(null, 1L, [], null, pageable)

        then: "the legacy sportId is used, wrapped as a single-element list"
        1 * groupRepository.searchPublicGroupsAnon([1L], null, pageable) >> rawPage
        1 * userService.getUsersByIds(_) >> [(userId): testUser]

        and: "results are returned"
        result.totalElements == 1
    }

    def "getPublicGroups should prioritize sportIds over the legacy sportId when both are provided"() {
        given: "public groups across multiple sports"
        def pageable = PageRequest.of(0, 10)
        def rawPage = new PageImpl<Object[]>([[testGroup, 2L] as Object[]])

        when: "both sportId and sportIds are provided"
        def result = groupService.getPublicGroups(null, 99L, [1L, 2L], null, pageable)

        then: "sportIds wins — the legacy sportId is ignored, not combined/ORed"
        1 * groupRepository.searchPublicGroupsAnon([1L, 2L], null, pageable) >> rawPage
        1 * userService.getUsersByIds(_) >> [(userId): testUser]

        and: "results are returned"
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
                .groupTypeId(defaultGroupType.id)
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
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)

        and: "response is returned"
        response != null
        response.maxMembers == defaultGroupType.maxMembers
        response.groupTypeName == "DEFAULT"
    }

    def "updateGroupSettings should throw BadRequestException when user is admin"() {
        given: "an update request"
        def request = UpdateGroupSettingsRequest.builder()
                .allowMemberPosts(false)
                .build()

        and: "user is admin, not owner"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(adminRole.id)
                .build()

        when: "trying to update group settings"
        groupService.updateGroupSettings(testGroup.id, userId, request)

        then: "user is not authorized"
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        0 * groupSettingsRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "updateGroupSettings should throw BadRequestException when user is member"() {
        given: "an update request"
        def request = UpdateGroupSettingsRequest.builder()
                .allowMemberPosts(false)
                .build()

        and: "user is a regular member"
        def regularMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(memberRole.id)
                .build()

        when: "trying to update group settings"
        groupService.updateGroupSettings(testGroup.id, userId, request)

        then: "user is not authorized"
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(regularMember)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        0 * groupSettingsRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
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
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
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
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
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
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
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
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
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
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
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
        _ * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
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
        _ * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
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
        _ * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
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
        1 * postService.getPostsByIds([20L, 10L], userId) >> [(20L): post2, (10L): post1]

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
        def settings = GroupSettings.builder()
                .groupId(testGroup.id).allowMemberInvites(true).groupTypeId(defaultGroupType.id).build()
        def savedInvitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(inviteeId)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()

        when:
        def response = groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        2 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, inviteeId) >> false
        1 * userFriendService.areFriends(userId, inviteeId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, inviteeId, _) >> false
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(memberRole.id).build())
        1 * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
        1 * invitationRepository.save(_ as GroupInvitation) >> savedInvitation
        1 * invitationInviterRepository.save(_)
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt(_) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (inviteeId): testUser]
        response.status == "pending_owner"
        response.groupId == testGroup.id
        response.sportId == testGroup.sportId
    }

    def "createInvitation should throw BadRequestException when group is at its member cap"() {
        given:
        def inviteeId = UUID.randomUUID()
        def request = CreateInvitationRequest.builder().inviteeId(inviteeId).build()
        def settings = GroupSettings.builder()
                .groupId(testGroup.id).allowMemberInvites(true).groupTypeId(defaultGroupType.id).build()

        when:
        groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        2 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, inviteeId) >> false
        1 * userFriendService.areFriends(userId, inviteeId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, inviteeId, _) >> false
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> defaultGroupType.maxMembers
        0 * invitationRepository.save(_)

        and: "exception is thrown"
        thrown(BadRequestException)
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
        1 * invitationInviterRepository.existsByInvitationIdAndInviterId(99L, userId) >> true
        0 * invitationInviterRepository.save(_)
        0 * invitationRepository.save(_)
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt(_) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser]
        response.id == 99L
    }

    def "createInvitation should record a new co-inviter without changing status when a regular member joins a pending_owner invitation (B14)"() {
        given: "member A's invitation is already pending_owner; member B (not owner/admin) also invites the same person"
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).allowMemberInvites(true).build()
        def existing = GroupInvitation.builder()
                .id(99L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def memberBId = UUID.randomUUID()
        def otherTestUser = UserResponse.builder().id(memberBId).firstName("Other").lastName("Member").build()

        when:
        def response = groupService.createInvitation(testGroup.id, memberBId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, memberBId) >> true
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(memberBId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> true
        1 * invitationRepository.findByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> Optional.of(existing)
        1 * invitationInviterRepository.existsByInvitationIdAndInviterId(99L, memberBId) >> false
        1 * invitationInviterRepository.save({ it.invitationId == 99L && it.inviterId == memberBId })

        and: "member B has no approval rights, so the status is untouched — still pending_owner"
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, memberBId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(memberBId).roleId(memberRole.id).build())
        1 * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
        0 * invitationRepository.save(_)

        and: "the response lists both co-inviters, oldest first"
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt([99L]) >> [
                GroupInvitationInviter.builder().invitationId(99L).inviterId(userId).createdAt(LocalDateTime.now().minusMinutes(5)).build(),
                GroupInvitationInviter.builder().invitationId(99L).inviterId(memberBId).createdAt(LocalDateTime.now()).build(),
        ]
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser, (memberBId): otherTestUser]
        response.status == "pending_owner"
        response.inviterFullNames == [testUser.fullName, otherTestUser.fullName]
    }

    def "createInvitation should auto-approve to pending_user when a co-inviting owner/admin joins a pending_owner invitation (B14)"() {
        given: "member A's invitation is pending_owner; the group's admin also invites the same person"
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).allowMemberInvites(true).build()
        def existing = GroupInvitation.builder()
                .id(99L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(otherUserId)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()

        when: "the caller (userId) is the group's admin"
        def response = groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> true
        1 * invitationRepository.findByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> Optional.of(existing)
        1 * invitationInviterRepository.existsByInvitationIdAndInviterId(99L, userId) >> false
        1 * invitationInviterRepository.save({ it.invitationId == 99L && it.inviterId == userId })

        and: "userId is an admin, so joining as a co-inviter auto-approves the still-pending_owner row (B11 rule 1's reasoning, applied to B14)"
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(adminRole.id).build())
        1 * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        1 * joinRequestRepository.findByGroupIdAndUserIdAndStatus(testGroup.id, otherUserId, "pending") >> Optional.empty()
        1 * invitationRepository.save({ it.id == 99L && it.status == "pending_user" && it.reviewedBy == userId }) >> { GroupInvitation inv -> inv }

        and:
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt([99L]) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser]
        response.status == "pending_user"
    }

    def "createInvitation should auto-accept via an existing pending join request when a co-inviting owner/admin joins (B14 + B11 rule 2)"() {
        given: "member A's invitation is pending_owner, the invitee has independently also sent a join request, and the group's admin also invites them"
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).allowMemberInvites(true).build()
        def existing = GroupInvitation.builder()
                .id(99L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(otherUserId)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def pendingJoinRequest = GroupJoinRequest.builder()
                .id(7L).groupId(testGroup.id).userId(otherUserId).status("pending").build()
        def adminMember = GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()
        def settingsForCapacity = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()

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
        1 * invitationInviterRepository.existsByInvitationIdAndInviterId(99L, userId) >> false
        1 * invitationInviterRepository.save({ it.invitationId == 99L && it.inviterId == userId })
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        1 * joinRequestRepository.findByGroupIdAndUserIdAndStatus(testGroup.id, otherUserId, "pending") >> Optional.of(pendingJoinRequest)
        1 * invitationRepository.save({ it.id == 99L && it.status == "accepted" && it.reviewedBy == userId }) >> { GroupInvitation inv -> inv }

        and: "finalizeMembership runs; the welcome post is authored by resolveGroupOwnerId (here, userId), independent of who's credited in its text"
        1 * groupSettingsRepository.findByGroupIdForUpdate(testGroup.id) >> Optional.of(settingsForCapacity)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.save({ it.userId == otherUserId && it.roleId == memberRole.id })
        1 * groupMemberRepository.findByGroupIdAndRoleId(testGroup.id, ownerRole.id) >> [adminMember]
        1 * postService.createSystemPost(testGroup.id, userId, _ as String)
        1 * joinRequestRepository.save({ it.status == "accepted" && it.reviewedBy == userId })

        and:
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt([99L]) >> []
        _ * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser]
        response.status == "accepted"
    }

    def "createInvitation should create a fresh invitation when the invitee's only prior invitation was declined_by_owner (B14)"() {
        given: "yesterday's invitation was declined by the owner, so it no longer counts as pending — a new invite starts a brand-new row, not a merge"
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder()
                .groupId(testGroup.id).allowMemberInvites(true).groupTypeId(defaultGroupType.id).build()
        def savedInvitation = GroupInvitation.builder()
                .id(2L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()

        when:
        def response = groupService.createInvitation(testGroup.id, userId, request)

        then: "the repository's own pending-only status filter already excludes the declined_by_owner row, so this is a normal create"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        2 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> false
        0 * invitationRepository.findByGroupIdAndInviteeIdAndStatusIn(_, _, _)
        0 * invitationInviterRepository.existsByInvitationIdAndInviterId(_, _)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(memberRole.id).build())
        1 * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
        1 * invitationRepository.save(_ as GroupInvitation) >> savedInvitation
        1 * invitationInviterRepository.save({ it.invitationId == 2L && it.inviterId == userId })
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt(_) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser]
        response.status == "pending_owner"
    }

    def "createInvitation should create a fresh invitation when the invitee's only prior invitation was declined_by_user (B14)"() {
        given: "yesterday's invitation was rejected by the invitee themselves, so it no longer counts as pending — a new invite starts a brand-new row, not a merge"
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder()
                .groupId(testGroup.id).allowMemberInvites(true).groupTypeId(defaultGroupType.id).build()
        def savedInvitation = GroupInvitation.builder()
                .id(3L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()

        when:
        def response = groupService.createInvitation(testGroup.id, userId, request)

        then: "the repository's own pending-only status filter already excludes the declined_by_user row, so this is a normal create"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        2 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> false
        0 * invitationRepository.findByGroupIdAndInviteeIdAndStatusIn(_, _, _)
        0 * invitationInviterRepository.existsByInvitationIdAndInviterId(_, _)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(memberRole.id).build())
        1 * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
        1 * invitationRepository.save(_ as GroupInvitation) >> savedInvitation
        1 * invitationInviterRepository.save({ it.invitationId == 3L && it.inviterId == userId })
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt(_) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser]
        response.status == "pending_owner"
    }

    def "createInvitation should skip pending_owner when inviter is owner/admin (B11 rule 1)"() {
        given: "the group's owner inviting a friend, with no pending join request in the way"
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder()
                .groupId(testGroup.id).allowMemberInvites(true).groupTypeId(defaultGroupType.id).build()
        def savedInvitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_user").reviewedBy(userId).reviewedAt(LocalDateTime.now())
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()

        when:
        def response = groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        2 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> false
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build())
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        1 * joinRequestRepository.findByGroupIdAndUserIdAndStatus(testGroup.id, otherUserId, "pending") >> Optional.empty()
        1 * invitationRepository.save({ it.status == "pending_user" && it.reviewedBy == userId }) >> savedInvitation
        1 * invitationInviterRepository.save(_)
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt(_) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser]

        and: "no side-effect membership is created — this is still just an invitation awaiting the invitee"
        0 * groupMemberRepository.save(_)
        0 * joinRequestRepository.save(_)

        and:
        response.status == "pending_user"
    }

    def "createInvitation should auto-accept via an existing pending join request when owner/admin invites (B11 rules 1+2)"() {
        given: "the group's owner inviting someone who already asked to join"
        def request = CreateInvitationRequest.builder().inviteeId(otherUserId).build()
        def settings = GroupSettings.builder()
                .groupId(testGroup.id).allowMemberInvites(true).groupTypeId(defaultGroupType.id).build()
        def pendingJoinRequest = GroupJoinRequest.builder()
                .id(5L).groupId(testGroup.id).userId(otherUserId).status("pending").build()
        def savedInvitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("accepted").reviewedBy(userId).reviewedAt(LocalDateTime.now())
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def ownerMember = GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()

        when:
        def response = groupService.createInvitation(testGroup.id, userId, request)

        then:
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        2 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> false
        2 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        2 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        1 * joinRequestRepository.findByGroupIdAndUserIdAndStatus(testGroup.id, otherUserId, "pending") >> Optional.of(pendingJoinRequest)
        1 * invitationRepository.save({ it.status == "accepted" && it.reviewedBy == userId }) >> savedInvitation
        1 * invitationInviterRepository.save(_)
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt(_) >> []

        and: "finalizeMembership runs: capacity, member insert, welcome post crediting the owner"
        1 * groupSettingsRepository.findByGroupIdForUpdate(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.save({ it.userId == otherUserId && it.roleId == memberRole.id })
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.findByGroupIdAndRoleId(testGroup.id, ownerRole.id) >> [ownerMember]
        1 * postService.createSystemPost(testGroup.id, userId, _ as String)

        and: "the pre-existing join request is closed out as accepted, not left dangling"
        1 * joinRequestRepository.save({ it.status == "accepted" && it.reviewedBy == userId })

        and:
        1 * userService.getUsersByIds([otherUserId, userId]) >> [(userId): testUser, (otherUserId): testUser]
        1 * userService.getUsersByIds([userId, otherUserId]) >> [(userId): testUser, (otherUserId): testUser]
        response.status == "accepted"
    }

    def "approveInvitation should move status to pending_user"() {
        given:
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_owner").build()

        when:
        groupService.approveInvitation(1L, userId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build())
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        1 * joinRequestRepository.findByGroupIdAndUserIdAndStatus(testGroup.id, inviteeId, "pending") >> Optional.empty()
        1 * invitationRepository.save({ it.status == "pending_user" }) >> { GroupInvitation inv -> inv }
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
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.empty()
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
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build())
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        thrown(BadRequestException)
    }

    def "approveInvitation should auto-accept via an existing pending join request instead of moving to pending_user (B11 rule 2)"() {
        given: "a member-sent invitation, and the invitee has independently also sent a join request"
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_owner").build()
        def pendingJoinRequest = GroupJoinRequest.builder()
                .id(9L).groupId(testGroup.id).userId(inviteeId).status("pending").build()
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()
        def ownerMember = GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()

        when:
        groupService.approveInvitation(1L, userId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        1 * joinRequestRepository.findByGroupIdAndUserIdAndStatus(testGroup.id, inviteeId, "pending") >> Optional.of(pendingJoinRequest)
        1 * invitationRepository.save({ it.status == "accepted" && it.reviewedBy == userId }) >> { GroupInvitation inv -> inv }

        and: "finalizeMembership runs, crediting the invitation's original inviter (a regular member), not the approving owner"
        1 * groupSettingsRepository.findByGroupIdForUpdate(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.save({ it.userId == inviteeId && it.roleId == memberRole.id })
        1 * groupMemberRepository.findByGroupIdAndRoleId(testGroup.id, ownerRole.id) >> [ownerMember]
        1 * postService.createSystemPost(testGroup.id, userId, _ as String)
        1 * userService.getUsersByIds([inviteeId, otherUserId]) >> [(inviteeId): testUser, (otherUserId): testUser]

        and: "the pre-existing join request is closed out as accepted by the approving owner, not left dangling"
        1 * joinRequestRepository.save({ it.status == "accepted" && it.reviewedBy == userId })
    }

    def "acceptInvitation should add invitee as group_member"() {
        given:
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_user").build()
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()

        when:
        groupService.acceptInvitation(1L, inviteeId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * groupSettingsRepository.findByGroupIdForUpdate(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.save({ it.userId == inviteeId && it.roleId == memberRole.id })
        1 * invitationRepository.save({ it.status == "accepted" })

        and: "welcome post mentions the inviter, authored by the owner"
        1 * userService.getUsersByIds([inviteeId, otherUserId]) >> [(inviteeId): testUser, (otherUserId): testUser]
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndRoleId(testGroup.id, ownerRole.id) >> [ownerMember]
        1 * postService.createSystemPost(testGroup.id, userId, _ as String)
    }

    def "acceptInvitation should throw BadRequestException when group is at its member cap"() {
        given:
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_user").build()
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()

        when:
        groupService.acceptInvitation(1L, inviteeId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * groupSettingsRepository.findByGroupIdForUpdate(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> defaultGroupType.maxMembers
        0 * groupMemberRepository.save(_)
        thrown(BadRequestException)
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

    def "rejectInvitation should set status to declined_by_user and persist the given reason"() {
        given:
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_user").build()

        when:
        groupService.rejectInvitation(1L, inviteeId, "Schedule doesn't work for me")

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * invitationRepository.save({
            it.status == "declined_by_user" && it.rejectReason == "Schedule doesn't work for me"
        })
    }

    def "rejectInvitation should allow a null reason (B13: optional at the API layer)"() {
        given:
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_user").build()

        when:
        groupService.rejectInvitation(1L, inviteeId, null)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * invitationRepository.save({ it.status == "declined_by_user" && it.rejectReason == null })
    }

    def "rejectInvitation should throw when invitation is not in pending_user status"() {
        given:
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_owner").build()

        when:
        groupService.rejectInvitation(1L, inviteeId, null)

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
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(
                GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build())
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        1 * invitationRepository.save({ it.status == "declined_by_owner" })
    }

    def "getGroupInvitations should throw when caller is not owner or admin"() {
        given:
        def pageable = PageRequest.of(0, 10)

        when:
        groupService.getGroupInvitations(testGroup.id, otherUserId, pageable)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.empty()
        thrown(BadRequestException)
    }

    def "getGroupInvitations should return pending_owner rows with the group's sportId (B15) for an owner caller"() {
        given: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()
        def pageable = PageRequest.of(0, 10)
        def inviteeId = UUID.randomUUID()
        def pendingInvitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(inviteeId)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def page = new PageImpl<GroupInvitation>([pendingInvitation], pageable, 1)

        when:
        def response = groupService.getGroupInvitations(testGroup.id, userId, pageable)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * invitationRepository.findByGroupIdAndStatus(testGroup.id, "pending_owner", pageable) >> page
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt([1L]) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (inviteeId): testUser]
        response.content.size() == 1
        response.content[0].sportId == testGroup.sportId
    }

    def "getDeclinedInvitations should throw NotFoundException when group does not exist"() {
        given:
        def pageable = PageRequest.of(0, 10)

        when:
        groupService.getDeclinedInvitations(999L, userId, pageable)

        then:
        1 * groupRepository.existsById(999L) >> false
        thrown(NotFoundException)
    }

    def "getDeclinedInvitations should throw when caller is not owner or admin"() {
        given:
        def pageable = PageRequest.of(0, 10)

        when:
        groupService.getDeclinedInvitations(testGroup.id, otherUserId, pageable)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.empty()
        thrown(BadRequestException)
    }

    def "getDeclinedInvitations should return declined_by_user rows with their rejectReason for an owner caller"() {
        given: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id)
                .userId(userId)
                .roleId(ownerRole.id)
                .build()
        def pageable = PageRequest.of(0, 10)
        def inviteeId = UUID.randomUUID()
        def declinedInvitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(inviteeId)
                .status("declined_by_user").rejectReason("Schedule doesn't work for me")
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def page = new PageImpl<GroupInvitation>([declinedInvitation], pageable, 1)

        when:
        def response = groupService.getDeclinedInvitations(testGroup.id, userId, pageable)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        // canManageMembers (B20's hasManagerRole) does a single findById(roleId) lookup, not findByRoleName
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * invitationRepository.findByGroupIdAndStatus(testGroup.id, "declined_by_user", pageable) >> page
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt([1L]) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (inviteeId): testUser]
        response.content.size() == 1
        response.content[0].rejectReason == "Schedule doesn't work for me"
        response.content[0].sportId == testGroup.sportId
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

    def "getMemberSentInvitations should return both pending_owner and pending_user rows in one page"() {
        given:
        def pageable = PageRequest.of(0, 10)
        def inviteeId1 = UUID.randomUUID()
        def inviteeId2 = UUID.randomUUID()
        def pendingOwnerInvitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(inviteeId1)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def pendingUserInvitation = GroupInvitation.builder()
                .id(2L).groupId(testGroup.id).inviterId(userId).inviteeId(inviteeId2)
                .status("pending_user").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def page = new PageImpl<GroupInvitation>([pendingOwnerInvitation, pendingUserInvitation], pageable, 2)

        when:
        def response = groupService.getMemberSentInvitations(testGroup.id, userId, pageable)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * invitationRepository.findByGroupIdAndCoInviterIdAndStatusIn(
                testGroup.id, userId, ["pending_owner", "pending_user"], pageable) >> page
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt([1L, 2L]) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (inviteeId1): testUser, (inviteeId2): testUser]
        response.content.size() == 2
        response.content*.status as Set == ["pending_owner", "pending_user"] as Set
        response.content.every { it.sportId == testGroup.sportId }
    }

    def "getMemberSentInvitations should include an invitation where the caller is a co-inviter, not the original inviter (B14)"() {
        given: "otherUserId originally created the invitation; userId later joined it as a co-inviter"
        def pageable = PageRequest.of(0, 10)
        def inviteeId = UUID.randomUUID()
        def invitation = GroupInvitation.builder()
                .id(5L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(inviteeId)
                .status("pending_owner").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def page = new PageImpl<GroupInvitation>([invitation], pageable, 1)

        when: "userId (the co-inviter, not the original inviter) checks their own sent invitations"
        def response = groupService.getMemberSentInvitations(testGroup.id, userId, pageable)

        then: "the query itself is scoped to co-inviters, not GroupInvitation.inviterId — this row is found via userId's group_invitation_inviters entry"
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * invitationRepository.findByGroupIdAndCoInviterIdAndStatusIn(
                testGroup.id, userId, ["pending_owner", "pending_user"], pageable) >> page
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt([5L]) >> [
                GroupInvitationInviter.builder().invitationId(5L).inviterId(otherUserId).createdAt(LocalDateTime.now().minusMinutes(3)).build(),
                GroupInvitationInviter.builder().invitationId(5L).inviterId(userId).createdAt(LocalDateTime.now()).build(),
        ]
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser, (inviteeId): testUser]
        response.content.size() == 1
        response.content[0].inviterFullNames.size() == 2
    }

    def "getUserPendingInvitations should resolve each row's own group's sportId (B15) across multiple groups in one page"() {
        given: "two pending_user invitations to the same invitee from two different groups/sports"
        def otherGroup = Group.builder()
                .id(42L).sportId(7L).groupName("Basketball Crew")
                .isPrivate(false).isActive(true).createdBy(userId)
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def pageable = PageRequest.of(0, 10)
        def invitationInTestGroup = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_user").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def invitationInOtherGroup = GroupInvitation.builder()
                .id(2L).groupId(otherGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_user").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def page = new PageImpl<GroupInvitation>([invitationInTestGroup, invitationInOtherGroup], pageable, 2)

        when:
        def response = groupService.getUserPendingInvitations(otherUserId, pageable)

        then:
        1 * invitationRepository.findByInviteeIdAndStatus(otherUserId, "pending_user", pageable) >> page
        1 * groupRepository.findAllById([testGroup.id, otherGroup.id]) >> [testGroup, otherGroup]
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt([1L, 2L]) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser]
        response.content.size() == 2
        response.content.find { it.groupId == testGroup.id }.sportId == testGroup.sportId
        response.content.find { it.groupId == otherGroup.id }.sportId == otherGroup.sportId
    }

    def "getUserPendingInvitations should default sportId to null when the invitation's group is missing from the batch"() {
        given: "a pending_user invitation whose group lookup misses (defensive fallback, shouldn't happen in practice)"
        def pageable = PageRequest.of(0, 10)
        def orphanInvitation = GroupInvitation.builder()
                .id(9L).groupId(999L).inviterId(userId).inviteeId(otherUserId)
                .status("pending_user").createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def page = new PageImpl<GroupInvitation>([orphanInvitation], pageable, 1)

        when:
        def response = groupService.getUserPendingInvitations(otherUserId, pageable)

        then:
        1 * invitationRepository.findByInviteeIdAndStatus(otherUserId, "pending_user", pageable) >> page
        1 * groupRepository.findAllById([999L]) >> []
        1 * invitationInviterRepository.findByInvitationIdInOrderByCreatedAt([9L]) >> []
        1 * userService.getUsersByIds(_) >> [(userId): testUser, (otherUserId): testUser]
        response.content.size() == 1
        response.content[0].groupName == "Unknown Group"
        response.content[0].sportId == null
    }

    def "cancelInvitation should delete invitation when caller is the inviter and status is pending_owner"() {
        given: "a pending_owner invitation sent by the caller, with no other co-inviters"
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_owner").build()

        when: "cancelling the invitation"
        groupService.cancelInvitation(1L, userId)

        then: "invitation is found, caller is a co-inviter, group is active"
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * invitationInviterRepository.existsByInvitationIdAndInviterId(1L, userId) >> true
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)

        and: "B14: the caller's own co-inviter row is removed, and since they were the last one, the invitation itself is deleted too"
        1 * invitationInviterRepository.deleteByInvitationIdAndInviterId(1L, userId)
        1 * invitationInviterRepository.countByInvitationId(1L) >> 0L
        1 * invitationRepository.deleteById(1L)
    }

    def "cancelInvitation should withdraw the caller's own co-invite without deleting the invitation when other co-inviters remain"() {
        given: "a pending_owner invitation with two co-inviters"
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_owner").build()

        when: "one of the two co-inviters withdraws"
        groupService.cancelInvitation(1L, userId)

        then:
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * invitationInviterRepository.existsByInvitationIdAndInviterId(1L, userId) >> true
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * invitationInviterRepository.deleteByInvitationIdAndInviterId(1L, userId)
        1 * invitationInviterRepository.countByInvitationId(1L) >> 1L
        0 * invitationRepository.deleteById(_)
    }

    def "cancelInvitation should throw NotFoundException when invitation does not exist"() {
        when: "cancelling a non-existent invitation"
        groupService.cancelInvitation(999L, userId)

        then: "invitation is not found"
        1 * invitationRepository.findById(999L) >> Optional.empty()

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "cancelInvitation should throw BadRequestException when caller is not a recorded co-inviter"() {
        given: "a pending_owner invitation sent by another user, with the caller never having co-invited"
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(otherUserId).inviteeId(userId)
                .status("pending_owner").build()

        when: "a different user tries to cancel"
        groupService.cancelInvitation(1L, userId)

        then: "invitation is found"
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * invitationInviterRepository.existsByInvitationIdAndInviterId(1L, userId) >> false
        0 * invitationInviterRepository.deleteByInvitationIdAndInviterId(_, _)
        0 * invitationRepository.deleteById(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "cancelInvitation should throw BadRequestException when group is inactive"() {
        given: "a pending_owner invitation for an inactive group"
        def inactiveGroup = Group.builder()
                .id(testGroup.id)
                .groupName("Disbanded Group")
                .isActive(false)
                .build()

        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_owner").build()

        when: "cancelling the invitation"
        groupService.cancelInvitation(1L, userId)

        then: "invitation is found, caller is a co-inviter, group is inactive"
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * invitationInviterRepository.existsByInvitationIdAndInviterId(1L, userId) >> true
        1 * groupRepository.findById(testGroup.id) >> Optional.of(inactiveGroup)
        0 * invitationRepository.deleteById(_)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "cancelInvitation should throw BadRequestException when invitation is not pending_owner"() {
        given: "an already-approved invitation"
        def invitation = GroupInvitation.builder()
                .id(1L).groupId(testGroup.id).inviterId(userId).inviteeId(otherUserId)
                .status("pending_user").build()

        when: "trying to cancel a pending_user invitation"
        groupService.cancelInvitation(1L, userId)

        then: "invitation and group are found, caller is a co-inviter, status check fails"
        1 * invitationRepository.findById(1L) >> Optional.of(invitation)
        1 * invitationInviterRepository.existsByInvitationIdAndInviterId(1L, userId) >> true
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        0 * invitationRepository.deleteById(_)

        and: "exception is thrown"
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
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
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
        _ * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
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
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
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

    // ─── domain event publishing (chat sync) ─────────────────────────────────
    // Regression coverage for services/chat's sync mechanism (services/chat/docs/SYNC_DESIGN.md)
    // — added 2026-07-27 after an audit found the Redis-publish call sites had zero assertions of
    // their own beyond "the constructor still compiles." publishDomainEvent's own try/catch means
    // a mis-stubbed stringRedisTemplate silently swallows the resulting exception rather than
    // failing the test loudly — these tests exist specifically to catch a wrong event_type or a
    // wrong/missing payload field, which nothing else would.

    def "createGroup publishes a group.member_added event for the owner"() {
        given: "a create group request with a sport the user has a profile for"
        def request = CreateGroupRequest.builder()
                .sportId(1L).groupName("New Group").description("New Description").isPrivate(false)
                .build()
        def streamOps = Mock(StreamOperations)

        when: "creating a group"
        groupService.createGroup(userId, request)

        then: "the usual createGroup collaborators"
        1 * groupRepository.existsByGroupName(request.groupName) >> false
        1 * sportService.requireActiveSportById(1L) >> activeSport
        1 * userSportProfileService.hasActiveProfileForActiveSport(userId, 1L) >> true
        1 * groupRepository.save(_ as Group) >> testGroup
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.save(_ as GroupMember) >> new GroupMember()
        1 * groupTypeRepository.findByTypeName("DEFAULT") >> Optional.of(defaultGroupType)
        1 * groupSettingsRepository.save(_ as GroupSettings) >> new GroupSettings()
        1 * userService.getUsersByIds(_) >> [(userId): testUser]
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >>
                Optional.of(GroupMember.builder().roleId(ownerRole.id).build())
        1 * groupRoleRepository.findById(ownerRole.id) >> Optional.of(ownerRole)

        and: "a group.member_added event is published for the owner"
        1 * stringRedisTemplate.opsForStream() >> streamOps
        1 * streamOps.add({ MapRecord record ->
            def payload = objectMapper.readValue(record.value['payload'] as String, Map)
            record.value['event_type'] == 'group.member_added' &&
                    payload['group_id'] == testGroup.id &&
                    payload['user_id'] == userId.toString() &&
                    payload['role'] == 'group_owner'
        })
    }

    def "finalizeMembership (via acceptJoinRequest) publishes a group.member_added event for the new member"() {
        given: "a pending join request"
        def joinRequest = GroupJoinRequest.builder()
                .id(1L).groupId(testGroup.id).userId(otherUserId).status("pending").build()
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()
        def streamOps = Mock(StreamOperations)

        when: "accepting join request"
        groupService.acceptJoinRequest(1L, userId)

        then: "the usual acceptJoinRequest collaborators"
        1 * joinRequestRepository.findById(1L) >> Optional.of(joinRequest)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        1 * groupSettingsRepository.findByGroupIdForUpdate(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.save(_ as GroupMember)
        1 * joinRequestRepository.save({ GroupJoinRequest req -> req.status == "accepted" })
        1 * userService.getUsersByIds([otherUserId]) >> [(otherUserId): testUser]
        1 * groupMemberRepository.findByGroupIdAndRoleId(testGroup.id, ownerRole.id) >> [ownerMember]
        1 * postService.createSystemPost(testGroup.id, userId, _ as String)

        and: "a group.member_added event is published for the new member, not the admin who approved it"
        1 * stringRedisTemplate.opsForStream() >> streamOps
        1 * streamOps.add({ MapRecord record ->
            def payload = objectMapper.readValue(record.value['payload'] as String, Map)
            record.value['event_type'] == 'group.member_added' &&
                    payload['group_id'] == testGroup.id &&
                    payload['user_id'] == otherUserId.toString() &&
                    payload['role'] == 'group_member'
        })
    }

    def "deleteGroup publishes a group.deleted event"() {
        given: "user is owner"
        def ownerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()
        def streamOps = Mock(StreamOperations)

        when: "deleting group"
        groupService.deleteGroup(testGroup.id, userId)

        then: "group is soft deleted"
        1 * groupRepository.findByIdAndIsActiveTrue(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(ownerMember)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupRepository.save({ Group g -> !g.isActive }) >> testGroup

        and: "a group.deleted event is published"
        1 * stringRedisTemplate.opsForStream() >> streamOps
        1 * streamOps.add({ MapRecord record ->
            def payload = objectMapper.readValue(record.value['payload'] as String, Map)
            record.value['event_type'] == 'group.deleted' && payload['group_id'] == testGroup.id
        })
    }

    def "removeMember publishes a group.member_removed event for the removed user"() {
        given: "admin removes a regular member"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()
        def targetMember = GroupMember.builder()
                .groupId(testGroup.id).userId(otherUserId).roleId(memberRole.id).build()
        def streamOps = Mock(StreamOperations)

        when:
        groupService.removeMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.of(targetMember)
        1 * groupMemberRepository.deleteByGroupIdAndUserId(testGroup.id, otherUserId)

        and: "a group.member_removed event is published for the removed user, not the admin"
        1 * stringRedisTemplate.opsForStream() >> streamOps
        1 * streamOps.add({ MapRecord record ->
            def payload = objectMapper.readValue(record.value['payload'] as String, Map)
            record.value['event_type'] == 'group.member_removed' &&
                    payload['group_id'] == testGroup.id &&
                    payload['user_id'] == otherUserId.toString()
        })
    }

    def "leaveMember publishes a group.member_removed event for the leaving member"() {
        given: "regular member wants to leave"
        def callerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(memberRole.id).build()
        def streamOps = Mock(StreamOperations)

        when:
        groupService.leaveMember(testGroup.id, userId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(callerMember)
        1 * groupMemberRepository.deleteByGroupIdAndUserId(testGroup.id, userId)

        and: "a group.member_removed event is published for the leaving member"
        1 * stringRedisTemplate.opsForStream() >> streamOps
        1 * streamOps.add({ MapRecord record ->
            def payload = objectMapper.readValue(record.value['payload'] as String, Map)
            record.value['event_type'] == 'group.member_removed' &&
                    payload['group_id'] == testGroup.id &&
                    payload['user_id'] == userId.toString()
        })
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
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
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
        _ * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
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
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        0 * joinRequestRepository.save(_)
        thrown(BadRequestException)
    }

    // ─── addMember ────────────────────────────────────────────────────────────
    // B9: addMember no longer inserts a GroupMember row directly — it creates a self-approved
    // (pending_user) GroupInvitation that the target must still accept.

    def "addMember should create a self-approved pending_user invitation when caller is admin"() {
        given: "admin invites a friend, auto-approved"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()

        when:
        groupService.addMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> false
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * joinRequestRepository.findByGroupIdAndUserIdAndStatus(testGroup.id, otherUserId, "pending") >> Optional.empty()
        1 * invitationRepository.save({
            GroupInvitation inv -> inv.groupId == testGroup.id && inv.inviterId == userId &&
                    inv.inviteeId == otherUserId && inv.status == "pending_user" && inv.reviewedBy == userId
        }) >> { GroupInvitation inv -> inv.id = 42L; inv }
        1 * invitationInviterRepository.save(_)

        and: "no side-effect membership is created — this is still just an invitation awaiting the target"
        0 * groupMemberRepository.save(_)
        0 * joinRequestRepository.save(_)
    }

    def "addMember should auto-accept via an existing pending join request instead of creating pending_user (B11 rule 2)"() {
        given: "admin adds someone who already independently asked to join"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()
        def pendingJoinRequest = GroupJoinRequest.builder()
                .id(11L).groupId(testGroup.id).userId(otherUserId).status("pending").build()

        when:
        groupService.addMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> false
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        2 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        2 * groupMemberRepository.countByGroupId(testGroup.id) >> 1L
        1 * joinRequestRepository.findByGroupIdAndUserIdAndStatus(testGroup.id, otherUserId, "pending") >> Optional.of(pendingJoinRequest)
        1 * invitationRepository.save({ it.status == "accepted" && it.reviewedBy == userId }) >> { GroupInvitation inv -> inv.id = 43L; inv }
        1 * invitationInviterRepository.save(_)

        and: "finalizeMembership runs: capacity, member insert, welcome post crediting the admin"
        1 * groupSettingsRepository.findByGroupIdForUpdate(testGroup.id) >> Optional.of(settings)
        1 * groupMemberRepository.save({ it.userId == otherUserId && it.roleId == memberRole.id })
        1 * groupRoleRepository.findByRoleName("group_member") >> Optional.of(memberRole)
        1 * groupMemberRepository.findByGroupIdAndRoleId(testGroup.id, ownerRole.id) >> [adminMember]
        1 * postService.createSystemPost(testGroup.id, userId, _ as String)
        1 * userService.getUsersByIds([otherUserId, userId]) >> [(userId): testUser, (otherUserId): testUser]

        and: "the pre-existing join request is closed out as accepted, not left dangling"
        1 * joinRequestRepository.save({ it.status == "accepted" && it.reviewedBy == userId })
    }

    def "addMember should throw BadRequestException when group is at its member cap"() {
        given: "admin tries to invite a friend to a full group"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()
        def settings = GroupSettings.builder().groupId(testGroup.id).groupTypeId(defaultGroupType.id).build()

        when:
        groupService.addMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> false
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)
        1 * groupMemberRepository.countByGroupId(testGroup.id) >> defaultGroupType.maxMembers
        0 * invitationRepository.save(_)
        thrown(BadRequestException)
    }

    def "addMember should throw NotFoundException when group does not exist"() {
        when:
        groupService.addMember(999L, userId, otherUserId)

        then:
        1 * groupRepository.existsById(999L) >> false
        0 * invitationRepository.save(_)
        thrown(NotFoundException)
    }

    def "addMember should throw BadRequestException when caller is not admin or owner"() {
        given: "regular member tries to invite someone"
        def callerMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(memberRole.id).build()

        when:
        groupService.addMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(memberRole.id) >> Optional.of(memberRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(callerMember)
        0 * invitationRepository.save(_)
        thrown(BadRequestException)
    }

    def "addMember should throw BadRequestException when target is already a member"() {
        given: "admin tries to invite a user who is already a member"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()

        when:
        groupService.addMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> true
        0 * invitationRepository.save(_)
        thrown(BadRequestException)
    }

    def "addMember should throw BadRequestException when admin and target are not friends"() {
        given: "admin tries to invite a non-friend"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()

        when:
        groupService.addMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> false
        0 * invitationRepository.save(_)
        thrown(BadRequestException)
    }

    def "addMember should throw BadRequestException when target already has a pending invitation"() {
        given: "target already has an in-flight invitation to this group"
        def adminMember = GroupMember.builder()
                .groupId(testGroup.id).userId(userId).roleId(adminRole.id).build()

        when:
        groupService.addMember(testGroup.id, userId, otherUserId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        _ * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        _ * groupRoleRepository.findByRoleName("group_admin") >> Optional.of(adminRole)
        _ * groupRoleRepository.findById(adminRole.id) >> Optional.of(adminRole)
        _ * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >> Optional.of(adminMember)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        1 * userFriendService.areFriends(userId, otherUserId) >> true
        1 * invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(testGroup.id, otherUserId, _) >> true
        0 * invitationRepository.save(_)
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
                .groupTypeId(defaultGroupType.id)
                .build()

        when:
        def result = groupService.getGroupSettings(testGroup.id, userId)

        then:
        1 * groupRepository.existsById(testGroup.id) >> true
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        1 * groupSettingsRepository.findByGroupId(testGroup.id) >> Optional.of(settings)
        1 * groupTypeRepository.findById(defaultGroupType.id) >> Optional.of(defaultGroupType)

        and:
        result != null
        result.allowMemberPosts == true
        result.requirePostApproval == false
        result.maxMembers == defaultGroupType.maxMembers
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

    // ─── getGroupRecurrence / updateGroupRecurrence / getGroupsWithAutoGenerateSessionsEnabled ──

    def "getGroupRecurrence should return the schedule when caller is a member"() {
        given:
        testGroup.recurrenceDayOfWeek = java.time.DayOfWeek.TUESDAY
        testGroup.recurrenceTime = java.time.LocalTime.of(19, 0)
        testGroup.recurrenceLocationId = 5L
        def group = testGroup

        when:
        def result = groupService.getGroupRecurrence(testGroup.id, userId)

        then:
        1 * groupRepository.findById(testGroup.id) >> Optional.of(group)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, userId) >> true
        result.recurrenceDayOfWeek == java.time.DayOfWeek.TUESDAY
        result.recurrenceLocationId == 5L
    }

    def "getGroupRecurrence should throw BadRequestException when caller is not a member"() {
        when:
        groupService.getGroupRecurrence(testGroup.id, otherUserId)

        then:
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * groupMemberRepository.existsByGroupIdAndUserId(testGroup.id, otherUserId) >> false
        thrown(BadRequestException)
    }

    def "updateGroupRecurrence should require owner"() {
        when:
        groupService.updateGroupRecurrence(testGroup.id, otherUserId, UpdateGroupRecurrenceRequest.builder().build())

        then:
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, otherUserId) >> Optional.empty()
        thrown(BadRequestException)
        0 * groupRepository.save(_)
    }

    def "updateGroupRecurrence should reject a recurrenceLocationId whose sport doesn't match the group"() {
        given:
        def request = UpdateGroupRecurrenceRequest.builder().recurrenceLocationId(5L).build()
        def mismatchedLocation = LocationResponse.builder().id(5L).sportId(99L).build()

        when:
        groupService.updateGroupRecurrence(testGroup.id, userId, request)

        then:
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >>
                Optional.of(GroupMember.builder().roleId(ownerRole.id).build())
        1 * locationService.getLocation(5L) >> mismatchedLocation
        thrown(BadRequestException)
        0 * groupRepository.save(_)
    }

    def "updateGroupRecurrence should update fields when the location's sport matches"() {
        given:
        def request = UpdateGroupRecurrenceRequest.builder()
                .recurrenceDayOfWeek(java.time.DayOfWeek.TUESDAY)
                .recurrenceTime(java.time.LocalTime.of(19, 0))
                .recurrenceDurationMinutes(90)
                .recurrenceLocationId(5L)
                .recurrenceLocationNote("Court 3")
                .build()
        def matchingLocation = LocationResponse.builder().id(5L).sportId(testGroup.sportId).build()

        when:
        def result = groupService.updateGroupRecurrence(testGroup.id, userId, request)

        then:
        1 * groupRepository.findById(testGroup.id) >> Optional.of(testGroup)
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdAndUserId(testGroup.id, userId) >>
                Optional.of(GroupMember.builder().roleId(ownerRole.id).build())
        1 * locationService.getLocation(5L) >> matchingLocation
        1 * groupRepository.save({ Group g ->
            g.recurrenceDayOfWeek == java.time.DayOfWeek.TUESDAY &&
            g.recurrenceDurationMinutes == 90 &&
            g.recurrenceLocationId == 5L &&
            g.recurrenceLocationNote == "Court 3"
        }) >> { Group g -> g }
        result.recurrenceLocationId == 5L
        result.recurrenceLocationNote == "Court 3"
    }

    def "getGroupsWithAutoGenerateSessionsEnabled returns only groups with a resolvable owner"() {
        given:
        def enabledSettings = GroupSettings.builder().id(1L).groupId(testGroup.id)
                .groupTypeId(defaultGroupType.id).autoGenerateSessions(true).build()

        when:
        def result = groupService.getGroupsWithAutoGenerateSessionsEnabled()

        then:
        1 * groupSettingsRepository.findByAutoGenerateSessionsTrue() >> [enabledSettings]
        1 * groupRepository.findAllById([testGroup.id]) >> [testGroup]
        1 * groupRoleRepository.findByRoleName("group_owner") >> Optional.of(ownerRole)
        1 * groupMemberRepository.findByGroupIdInAndRoleId([testGroup.id], ownerRole.id) >>
                [GroupMember.builder().groupId(testGroup.id).userId(userId).roleId(ownerRole.id).build()]
        result.size() == 1
        result[0].groupId == testGroup.id
        result[0].ownerId == userId
    }

    def "getGroupsWithAutoGenerateSessionsEnabled returns an empty list when nothing is enabled"() {
        when:
        def result = groupService.getGroupsWithAutoGenerateSessionsEnabled()

        then:
        1 * groupSettingsRepository.findByAutoGenerateSessionsTrue() >> []
        0 * groupRepository.findAllById(_)
        result.isEmpty()
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
