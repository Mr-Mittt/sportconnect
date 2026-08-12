package com.sportconnect.social.post.access

import com.sportconnect.group.api.service.GroupService
import com.sportconnect.social.post.api.dto.PostType
import com.sportconnect.social.post.entity.Post
import com.sportconnect.user.api.service.UserFriendService
import spock.lang.Specification
import spock.lang.Subject
import spock.lang.Unroll

class PostGateSpec extends Specification {

    GroupService groupService = Mock()
    UserFriendService userFriendService = Mock()

    @Subject
    PostGate postGate = new PostGate(groupService, userFriendService)

    UUID ownerId = UUID.randomUUID()
    UUID viewerId = UUID.randomUUID()
    Long groupId = 5L

    private Post post(PostType type = PostType.USER_FEED, String visibility = "public", Long gId = null) {
        Post.builder()
                .id(1L)
                .userId(ownerId)
                .groupId(gId)
                .postType(type)
                .visibility(visibility)
                .isActive(true)
                .build()
    }

    // ── isAvailable ──────────────────────────────────────────────────────────

    def "isAvailable is false for null"() {
        expect:
        !postGate.isAvailable(null)
    }

    def "isAvailable is false for a soft-deleted post"() {
        given:
        def p = post()
        p.setIsActive(false)

        expect:
        !postGate.isAvailable(p)
    }

    def "isAvailable is true for a non-group post that is active"() {
        expect:
        postGate.isAvailable(post())
    }

    def "isAvailable defers to groupService.isGroupActive for a group-scoped post"() {
        given:
        def p = post(PostType.GROUP_POST, "public", groupId)

        when:
        def result = postGate.isAvailable(p)

        then:
        1 * groupService.isGroupActive(groupId) >> active
        result == active

        where:
        active << [true, false]
    }

    // ── isVisibleTo — USER_FEED ─────────────────────────────────────────────

    def "USER_FEED is visible to its owner regardless of visibility"() {
        given:
        def p = post(PostType.USER_FEED, "private")

        expect:
        postGate.isVisibleTo(p, ownerId)
    }

    def "USER_FEED public post is visible to any viewer"() {
        given:
        def p = post(PostType.USER_FEED, "public")

        expect:
        postGate.isVisibleTo(p, viewerId)
    }

    def "USER_FEED public post is visible to an unauthenticated viewer"() {
        given:
        def p = post(PostType.USER_FEED, "public")

        expect:
        postGate.isVisibleTo(p, null)
    }

    def "USER_FEED private post is not visible to a non-owner"() {
        given:
        def p = post(PostType.USER_FEED, "private")

        expect:
        !postGate.isVisibleTo(p, viewerId)
    }

    def "USER_FEED private post is not visible to an unauthenticated viewer"() {
        given:
        def p = post(PostType.USER_FEED, "private")

        expect:
        !postGate.isVisibleTo(p, null)
    }

    def "USER_FEED friends post is visible to an accepted friend"() {
        given:
        def p = post(PostType.USER_FEED, "friends")

        when:
        def result = postGate.isVisibleTo(p, viewerId)

        then:
        1 * userFriendService.areFriends(ownerId, viewerId) >> true
        result
    }

    def "USER_FEED friends post is not visible to a non-friend"() {
        given:
        def p = post(PostType.USER_FEED, "friends")

        when:
        def result = postGate.isVisibleTo(p, viewerId)

        then:
        1 * userFriendService.areFriends(ownerId, viewerId) >> false
        !result
    }

    def "USER_FEED friends post is not visible to an unauthenticated viewer"() {
        given:
        def p = post(PostType.USER_FEED, "friends")

        when:
        def result = postGate.isVisibleTo(p, null)

        then:
        !result
        0 * userFriendService.areFriends(_, _)
    }

    // ── isVisibleTo — group-scoped types ────────────────────────────────────

    @Unroll
    def "#type is visible only to a group member"() {
        given:
        def p = post(type, "public", groupId)

        when:
        def result = postGate.isVisibleTo(p, viewerId)

        then:
        1 * groupService.isGroupMember(groupId, viewerId) >> isMember
        result == isMember

        where:
        type                     | isMember
        PostType.GROUP_POST      | true
        PostType.GROUP_POST      | false
        PostType.GROUP_BROADCAST | true
        PostType.GROUP_BROADCAST | false
        PostType.GROUP_SYSTEM    | true
        PostType.GROUP_SYSTEM    | false
    }

    def "group-scoped post is not visible to an unauthenticated viewer"() {
        given:
        def p = post(PostType.GROUP_POST, "public", groupId)

        when:
        def result = postGate.isVisibleTo(p, null)

        then:
        !result
        0 * groupService.isGroupMember(_, _)
    }

    // ── isAvailable / isVisibleTo — SESSION_POST ────────────────────────────
    // SESSION-10/A17: deliberately unconditional — post-impl has no session-api dependency, so
    // there's nothing to delegate to. A SESSION_POST is invisible via /api/posts/** for every
    // caller, including an actual session participant; session-api's own comment-proxy endpoints
    // are the only path in (see SessionGate in session-impl).

    def "SESSION_POST is never available, regardless of active flag"() {
        given:
        def p = post(PostType.SESSION_POST)

        when:
        def result = postGate.isAvailable(p)

        then:
        !result
        0 * groupService._
    }

    def "SESSION_POST is never visible, even to its own author"() {
        given:
        def p = post(PostType.SESSION_POST)

        when:
        def resultOwner = postGate.isVisibleTo(p, ownerId)
        def resultViewer = postGate.isVisibleTo(p, viewerId)
        def resultAnonymous = postGate.isVisibleTo(p, null)

        then:
        !resultOwner
        !resultViewer
        !resultAnonymous
        0 * groupService._
        0 * userFriendService._
    }
}
