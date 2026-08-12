package com.sportconnect.social.post.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.social.post.access.PostGate
import com.sportconnect.social.post.api.dto.CreatePostRequest
import com.sportconnect.social.post.api.dto.PostType
import com.sportconnect.social.post.entity.Post
import com.sportconnect.social.post.entity.PostLike
import com.sportconnect.social.post.api.service.HashtagService
import com.sportconnect.social.post.repository.CommentRepository
import com.sportconnect.social.post.repository.PostHashtagRepository
import com.sportconnect.social.post.repository.PostLikeRepository
import com.sportconnect.social.post.repository.PostRepository
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserFriendService
import com.sportconnect.user.api.service.UserService
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.ValueOperations
import org.springframework.data.redis.core.ZSetOperations
import org.springframework.data.redis.core.script.RedisScript
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

class PostServiceImplSpec extends Specification {

    PostRepository postRepository = Mock()
    PostLikeRepository postLikeRepository = Mock()
    CommentRepository commentRepository = Mock()
    PostHashtagRepository postHashtagRepository = Mock()
    GroupService groupService = Mock()
    UserFriendService userFriendService = Mock()
    UserService userService = Mock()
    HashtagService hashtagService = Mock()
    StringRedisTemplate stringRedisTemplate = Mock()
    ValueOperations<String, String> valueOps = Mock()
    ZSetOperations<String, String> zSetOps = Mock()
    ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules()
    PostGate postGate = Mock()

    @Subject
    PostServiceImpl postService = new PostServiceImpl(postRepository, postLikeRepository, commentRepository, postHashtagRepository, groupService, userFriendService, userService, hashtagService, stringRedisTemplate, objectMapper, postGate)

    def setup() {
        stringRedisTemplate.opsForValue() >> valueOps
        stringRedisTemplate.opsForZSet() >> zSetOps
        zSetOps.reverseRange(_, _, _) >> []
        commentRepository.findTop3ByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(_) >> []
        hashtagService.getTagsForPost(_) >> []
        hashtagService.getTagsForPosts(_) >> [:]
        hashtagService.extractAndSaveHashtags(_, _) >> {}
        hashtagService.decrementHashtagsForPost(_) >> {}
        // Default: no author resolves — existing tests don't assert on this field, so they
        // keep passing unchanged with the "Unknown User" fallback (A9).
        userService.getUsersByIds(_) >> [:]
    }

    UUID userId = UUID.randomUUID()
    Long postId = 1L
    Long groupId = 5L

    // ── helpers ──────────────────────────────────────────────────────────────

    private Post savedPost(PostType type = PostType.USER_FEED, Long gId = null) {
        Post.builder()
                .id(postId)
                .userId(userId)
                .groupId(gId)
                .postType(type)
                .content("content")
                .visibility("public")
                .media([])
                .hashtags([])
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build()
    }

    private void stubCounts() {
        postLikeRepository.countByPostId(postId) >> 0L
        commentRepository.countByPostIdAndIsActiveTrue(postId) >> 0L
        postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false
    }

    // ── createPost — USER_FEED ────────────────────────────────────────────────

    def "createPost defaults to USER_FEED when postType is null"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Hello world")
                .build()

        when:
        def result = postService.createPost(userId, request)

        then:
        1 * postRepository.save({ Post p -> p.postType == PostType.USER_FEED }) >> savedPost()
        stubCounts()
        result.postType == PostType.USER_FEED
    }

    def "createPost USER_FEED succeeds with no groupId"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Test post")
                .postType(PostType.USER_FEED)
                .visibility("public")
                .build()

        when:
        def result = postService.createPost(userId, request)

        then:
        1 * postRepository.save(_ as Post) >> savedPost()
        stubCounts()
        result != null
        result.postType == PostType.USER_FEED
    }

    // ── A9: userFullName/userAvatarUrl/shareCount ──────────────────────────────

    def "createPost resolves userFullName/userAvatarUrl from the batch-resolved author"() {
        given:
        def request = CreatePostRequest.builder().content("Hello world").build()
        def author = UserResponse.builder()
                .id(userId)
                .firstName("Jordan")
                .lastName("Lee")
                .avatarUrl("https://example.com/avatar.png")
                .build()

        when:
        def result = postService.createPost(userId, request)

        then:
        1 * postRepository.save(_ as Post) >> savedPost()
        stubCounts()
        userService.getUsersByIds([userId]) >> [(userId): author]
        result.userFullName == "Jordan Lee"
        result.userAvatarUrl == "https://example.com/avatar.png"
    }

    def "createPost falls back to Unknown User when the author is not found"() {
        given:
        def request = CreatePostRequest.builder().content("Hello world").build()

        when:
        def result = postService.createPost(userId, request)

        then:
        1 * postRepository.save(_ as Post) >> savedPost()
        stubCounts()
        // setup()'s default userService.getUsersByIds(_) >> [:] applies — no override needed
        result.userFullName == "Unknown User"
        result.userAvatarUrl == null
    }

    def "createPost defaults shareCount to 0, never null"() {
        given:
        def request = CreatePostRequest.builder().content("Hello world").build()

        when:
        def result = postService.createPost(userId, request)

        then:
        1 * postRepository.save(_ as Post) >> savedPost()
        stubCounts()
        result.shareCount == 0L
    }

    def "createPost USER_FEED with groupId throws BadRequestException"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Bad request")
                .postType(PostType.USER_FEED)
                .groupId(groupId)
                .build()

        when:
        postService.createPost(userId, request)

        then:
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "createPost rejects caller-supplied GROUP_SYSTEM postType"() {
        given: "a caller tries to self-author a system post (B9 spoofing guard)"
        def request = CreatePostRequest.builder()
                .content("fake system message")
                .postType(PostType.GROUP_SYSTEM)
                .groupId(groupId)
                .build()

        when:
        postService.createPost(userId, request)

        then:
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    // ── createSystemPost (B9) ─────────────────────────────────────────────────

    def "createSystemPost creates a GROUP_SYSTEM post authored by the given user"() {
        when:
        postService.createSystemPost(groupId, userId, "Alice joined the group 👋")

        then:
        1 * postRepository.save({
            Post p -> p.postType == PostType.GROUP_SYSTEM && p.groupId == groupId &&
                    p.userId == userId && p.content == "Alice joined the group 👋"
        })
    }

    // ── createSessionPost (SESSION-10/A17) ────────────────────────────────────

    def "createPost rejects caller-supplied SESSION_POST postType"() {
        given: "a caller tries to self-author a session post"
        def request = CreatePostRequest.builder()
                .content("fake session post")
                .postType(PostType.SESSION_POST)
                .build()

        when:
        postService.createPost(userId, request)

        then:
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "createSessionPost creates a SESSION_POST authored by the given user, never groupId-scoped"() {
        when:
        def resultId = postService.createSessionPost(userId, "Session: Sunday badminton")

        then:
        1 * postRepository.save({
            Post p -> p.postType == PostType.SESSION_POST && p.groupId == null &&
                    p.userId == userId && p.content == "Session: Sunday badminton"
        }) >> savedPost(PostType.SESSION_POST)
        resultId == postId
    }

    // ── createPost — GROUP_POST ───────────────────────────────────────────────

    def "createPost GROUP_POST without groupId throws BadRequestException"() {
        given:
        def request = CreatePostRequest.builder()
                .content("No group")
                .postType(PostType.GROUP_POST)
                .build()

        when:
        postService.createPost(userId, request)

        then:
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "createPost GROUP_POST throws BadRequestException when user is not a member"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Group post")
                .postType(PostType.GROUP_POST)
                .groupId(groupId)
                .build()

        when:
        postService.createPost(userId, request)

        then:
        1 * groupService.isGroupMember(groupId, userId) >> false
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "createPost GROUP_POST succeeds when user is a member"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Group post")
                .postType(PostType.GROUP_POST)
                .groupId(groupId)
                .build()

        when:
        def result = postService.createPost(userId, request)

        then:
        1 * groupService.isGroupMember(groupId, userId) >> true
        1 * postRepository.save({ Post p -> p.postType == PostType.GROUP_POST && p.groupId == groupId }) >> savedPost(PostType.GROUP_POST, groupId)
        stubCounts()
        result.postType == PostType.GROUP_POST
        result.groupId == groupId
    }

    // ── createPost — GROUP_BROADCAST ──────────────────────────────────────────

    def "createPost GROUP_BROADCAST without groupId throws BadRequestException"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Broadcast no group")
                .postType(PostType.GROUP_BROADCAST)
                .build()

        when:
        postService.createPost(userId, request)

        then:
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "createPost GROUP_BROADCAST throws BadRequestException when user is not owner or admin"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Broadcast")
                .postType(PostType.GROUP_BROADCAST)
                .groupId(groupId)
                .build()

        when:
        postService.createPost(userId, request)

        then:
        1 * groupService.canManagePosts(groupId, userId) >> false
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "createPost GROUP_BROADCAST succeeds when user is owner"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Broadcast by owner")
                .postType(PostType.GROUP_BROADCAST)
                .groupId(groupId)
                .build()

        when:
        def result = postService.createPost(userId, request)

        then:
        1 * groupService.canManagePosts(groupId, userId) >> true
        1 * postRepository.save({ Post p -> p.postType == PostType.GROUP_BROADCAST }) >> savedPost(PostType.GROUP_BROADCAST, groupId)
        stubCounts()
        result.postType == PostType.GROUP_BROADCAST
    }

    def "createPost GROUP_BROADCAST succeeds when user is admin"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Broadcast by admin")
                .postType(PostType.GROUP_BROADCAST)
                .groupId(groupId)
                .build()

        when:
        def result = postService.createPost(userId, request)

        then:
        1 * groupService.canManagePosts(groupId, userId) >> true
        1 * postRepository.save(_ as Post) >> savedPost(PostType.GROUP_BROADCAST, groupId)
        stubCounts()
        result.postType == PostType.GROUP_BROADCAST
    }

    def "createPost GROUP_BROADCAST throws BadRequestException when an active broadcast already exists"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Broadcast")
                .postType(PostType.GROUP_BROADCAST)
                .groupId(groupId)
                .build()

        when:
        postService.createPost(userId, request)

        then:
        1 * groupService.canManagePosts(groupId, userId) >> true
        1 * postRepository.existsActiveGroupBroadcast(groupId) >> true
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "createPost GROUP_BROADCAST defaults broadcastEndTime to now plus 24 hours when not provided"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Broadcast")
                .postType(PostType.GROUP_BROADCAST)
                .groupId(groupId)
                .build()

        when:
        def result = postService.createPost(userId, request)

        then:
        1 * groupService.canManagePosts(groupId, userId) >> true
        1 * postRepository.existsActiveGroupBroadcast(groupId) >> false
        1 * postRepository.save({ Post p ->
            p.broadcastEndTime.isAfter(LocalDateTime.now().plusHours(23)) &&
            p.broadcastEndTime.isBefore(LocalDateTime.now().plusHours(25))
        }) >> savedPost(PostType.GROUP_BROADCAST, groupId)
        stubCounts()
        result.postType == PostType.GROUP_BROADCAST
    }

    def "createPost GROUP_BROADCAST throws BadRequestException when broadcastEndTime is not in the future"() {
        given:
        def request = CreatePostRequest.builder()
                .content("Broadcast")
                .postType(PostType.GROUP_BROADCAST)
                .groupId(groupId)
                .broadcastEndTime(LocalDateTime.now())
                .build()

        when:
        postService.createPost(userId, request)

        then:
        1 * groupService.canManagePosts(groupId, userId) >> true
        1 * postRepository.existsActiveGroupBroadcast(groupId) >> false
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "createPost GROUP_BROADCAST persists an explicit future broadcastEndTime"() {
        given:
        def futureTime = LocalDateTime.now().plusHours(2)
        def request = CreatePostRequest.builder()
                .content("Broadcast")
                .postType(PostType.GROUP_BROADCAST)
                .groupId(groupId)
                .broadcastEndTime(futureTime)
                .build()
        def saved = savedPost(PostType.GROUP_BROADCAST, groupId)
        saved.broadcastEndTime = futureTime

        when:
        def result = postService.createPost(userId, request)

        then:
        1 * groupService.canManagePosts(groupId, userId) >> true
        1 * postRepository.existsActiveGroupBroadcast(groupId) >> false
        1 * postRepository.save({ Post p -> p.broadcastEndTime == futureTime }) >> saved
        stubCounts()
        result.broadcastEndTime == futureTime
    }

    // ── getPostById ───────────────────────────────────────────────────────────

    def "getPostById returns likeCount and commentCount from DB on cache miss"() {
        given:
        def post = savedPost()

        when:
        def result = postService.getPostById(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        // Redis cache miss → DB fallback
        1 * postLikeRepository.countByPostId(postId) >> 5L
        1 * commentRepository.countByPostIdAndIsActiveTrue(postId) >> 3L
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> true
        result.id == postId
        result.likeCount == 5L
        result.commentCount == 3L
        result.isLikedByCurrentUser == true
    }

    def "getPostById reads likeCount and commentCount from Redis on cache hit"() {
        given:
        def post = savedPost()

        when:
        def result = postService.getPostById(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        valueOps.get("post:" + postId + ":likes") >> "7"
        valueOps.get("post:" + postId + ":comments") >> "2"
        0 * postLikeRepository.countByPostId(_)
        0 * commentRepository.countByPostIdAndIsActiveTrue(_)
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false
        result.likeCount == 7L
        result.commentCount == 2L
    }

    def "getPostById throws NotFoundException when post not found"() {
        when:
        postService.getPostById(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.empty()
        1 * postGate.require(null, userId, _, _) >> { throw new NotFoundException("Post not found") }
        thrown(NotFoundException)
    }

    def "getPostById throws ForbiddenException when caller cannot view the post"() {
        given:
        def post = savedPost()

        when:
        postService.getPostById(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> { throw new ForbiddenException("You don't have access to this post") }
        thrown(ForbiddenException)
    }

    // ── getUserPosts ──────────────────────────────────────────────────────────

    def "getUserPosts returns user's posts"() {
        given:
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([savedPost()])

        when:
        def result = postService.getUserPosts(userId, userId, pageable)

        then:
        1 * postRepository.findByUserIdAndIsActiveTrue(userId, pageable) >> page
        stubCounts()
        result.content.size() == 1
    }

    // ── getPersonalizedFeed ───────────────────────────────────────────────────

    def "getPersonalizedFeed returns caller's own USER_FEED posts"() {
        given:
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([savedPost(PostType.USER_FEED)])

        when:
        def result = postService.getPersonalizedFeed(userId, pageable)

        then:
        1 * userFriendService.getAcceptedFriendIds(userId) >> []
        1 * groupService.getGroupIdsBySportProfiles(userId) >> []
        1 * postRepository.findPersonalizedFeed(userId, [new UUID(0, 0)], [-1L], pageable) >> page
        stubCounts()
        result.content.size() == 1
        result.content[0].postType == PostType.USER_FEED
    }

    def "getPersonalizedFeed includes friends' USER_FEED posts"() {
        given:
        def friendId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)
        def friendPost = Post.builder()
                .id(2L).userId(friendId).postType(PostType.USER_FEED)
                .content("friend post").visibility("public")
                .media([]).hashtags([]).createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def page = new PageImpl<>([friendPost])

        when:
        def result = postService.getPersonalizedFeed(userId, pageable)

        then:
        1 * userFriendService.getAcceptedFriendIds(userId) >> [friendId]
        1 * groupService.getGroupIdsBySportProfiles(userId) >> []
        1 * postRepository.findPersonalizedFeed(userId, [friendId], [-1L], pageable) >> page
        postLikeRepository.countByPostId(2L) >> 0L
        commentRepository.countByPostIdAndIsActiveTrue(2L) >> 0L
        postLikeRepository.existsByPostIdAndUserId(2L, userId) >> false
        result.content.size() == 1
        result.content[0].userId == friendId
    }

    def "getPersonalizedFeed includes GROUP_POSTs from sport-matched groups"() {
        given:
        def pageable = PageRequest.of(0, 20)
        def groupPost = savedPost(PostType.GROUP_POST, groupId)
        def page = new PageImpl<>([groupPost])

        when:
        def result = postService.getPersonalizedFeed(userId, pageable)

        then:
        1 * userFriendService.getAcceptedFriendIds(userId) >> []
        1 * groupService.getGroupIdsBySportProfiles(userId) >> [groupId]
        1 * postRepository.findPersonalizedFeed(userId, [new UUID(0, 0)], [groupId], pageable) >> page
        stubCounts()
        result.content.size() == 1
        result.content[0].postType == PostType.GROUP_POST
    }

    def "getPersonalizedFeed returns empty page when user has no friends or groups"() {
        given:
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([])

        when:
        def result = postService.getPersonalizedFeed(userId, pageable)

        then:
        1 * userFriendService.getAcceptedFriendIds(userId) >> []
        1 * groupService.getGroupIdsBySportProfiles(userId) >> []
        1 * postRepository.findPersonalizedFeed(userId, [new UUID(0, 0)], [-1L], pageable) >> page
        result.content.isEmpty()
    }

    // ── getGroupPosts ─────────────────────────────────────────────────────────

    def "getGroupPosts returns posts for group member"() {
        given:
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([savedPost(PostType.GROUP_POST, groupId)])

        when:
        def result = postService.getGroupPosts(groupId, userId, pageable)

        then:
        1 * groupService.isGroupMember(groupId, userId) >> true
        1 * postRepository.findByGroupIdAndIsActiveTrue(groupId, pageable) >> page
        stubCounts()
        result.content.size() == 1
        result.content[0].groupId == groupId
    }

    def "getGroupPosts throws ForbiddenException for non-member"() {
        given:
        def nonMember = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)

        when:
        postService.getGroupPosts(groupId, nonMember, pageable)

        then:
        1 * groupService.isGroupMember(groupId, nonMember) >> false
        thrown(ForbiddenException)
    }

    def "getGroupPosts throws ForbiddenException for unauthenticated caller"() {
        given:
        def pageable = PageRequest.of(0, 20)

        when:
        postService.getGroupPosts(groupId, null, pageable)

        then:
        0 * groupService.isGroupMember(_, _)
        thrown(ForbiddenException)
    }

    // ── updatePost ────────────────────────────────────────────────────────────

    def "updatePost succeeds when user is owner"() {
        given:
        def post = savedPost()
        def request = CreatePostRequest.builder()
                .content("Updated")
                .build()

        when:
        def result = postService.updatePost(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * postRepository.save(_ as Post) >> post
        stubCounts()
        result != null
    }

    def "updatePost throws BadRequestException when user is not owner"() {
        given:
        def post = Post.builder().id(postId).userId(UUID.randomUUID()).content("X").build()
        def request = CreatePostRequest.builder().content("Updated").build()

        when:
        postService.updatePost(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        thrown(BadRequestException)
    }

    def "updatePost allows group owner to edit GROUP_BROADCAST content as non-creator"() {
        given:
        def creatorId = UUID.randomUUID()
        def post = Post.builder()
                .id(postId).userId(creatorId).groupId(groupId).postType(PostType.GROUP_BROADCAST)
                .content("old").visibility("public").media([]).hashtags([])
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def request = CreatePostRequest.builder().content("Updated broadcast").build()

        when:
        def result = postService.updatePost(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * groupService.canManagePosts(groupId, userId) >> true
        1 * postRepository.save(_ as Post) >> post
        stubCounts()
        result != null
    }

    def "updatePost allows group admin to edit GROUP_BROADCAST content as non-creator"() {
        given:
        def creatorId = UUID.randomUUID()
        def post = Post.builder()
                .id(postId).userId(creatorId).groupId(groupId).postType(PostType.GROUP_BROADCAST)
                .content("old").visibility("public").media([]).hashtags([])
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def request = CreatePostRequest.builder().content("Updated broadcast").build()

        when:
        def result = postService.updatePost(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * groupService.canManagePosts(groupId, userId) >> true
        1 * postRepository.save(_ as Post) >> post
        stubCounts()
        result != null
    }

    def "updatePost throws BadRequestException when caller is neither creator nor group owner/admin for GROUP_BROADCAST"() {
        given:
        def creatorId = UUID.randomUUID()
        def post = Post.builder()
                .id(postId).userId(creatorId).groupId(groupId).postType(PostType.GROUP_BROADCAST)
                .content("old").visibility("public").media([]).hashtags([])
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def request = CreatePostRequest.builder().content("Updated broadcast").build()

        when:
        postService.updatePost(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * groupService.canManagePosts(groupId, userId) >> false
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "updatePost still restricts GROUP_POST edits to the creator"() {
        given:
        def creatorId = UUID.randomUUID()
        def post = Post.builder()
                .id(postId).userId(creatorId).groupId(groupId).postType(PostType.GROUP_POST)
                .content("old").visibility("public").media([]).hashtags([])
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now()).build()
        def request = CreatePostRequest.builder().content("Updated").build()

        when:
        postService.updatePost(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * groupService._
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "updatePost rejects GROUP_SYSTEM posts even for the nominal author"() {
        given: "the post is authored (per B9) by the current owner, who tries to edit it"
        def post = savedPost(PostType.GROUP_SYSTEM, groupId)
        def request = CreatePostRequest.builder().content("rewritten").build()

        when:
        postService.updatePost(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * groupService._
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "updatePost rejects SESSION_POST posts even for the nominal author"() {
        given:
        def post = savedPost(PostType.SESSION_POST)
        def request = CreatePostRequest.builder().content("rewritten").build()

        when:
        postService.updatePost(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * groupService._
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    // ── deletePost ────────────────────────────────────────────────────────────

    def "deletePost soft deletes post when user is owner"() {
        given:
        def post = savedPost()

        when:
        postService.deletePost(postId, userId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * postRepository.save({ Post p -> !p.isActive }) >> post
    }

    def "deletePost throws BadRequestException when user is not owner"() {
        given:
        def post = Post.builder().id(postId).userId(UUID.randomUUID()).content("X").build()

        when:
        postService.deletePost(postId, userId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * groupService._
        thrown(BadRequestException)
    }

    def "deletePost allows group owner to delete GROUP_POST"() {
        given:
        def callerId = UUID.randomUUID()
        def post = savedPost(PostType.GROUP_POST, groupId)

        when:
        postService.deletePost(postId, callerId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * groupService.canManagePosts(groupId, callerId) >> true
        1 * postRepository.save({ Post p -> !p.isActive }) >> post
    }

    def "deletePost allows group admin to delete GROUP_BROADCAST"() {
        given:
        def callerId = UUID.randomUUID()
        def post = savedPost(PostType.GROUP_BROADCAST, groupId)

        when:
        postService.deletePost(postId, callerId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * groupService.canManagePosts(groupId, callerId) >> true
        1 * postRepository.save({ Post p -> !p.isActive }) >> post
    }

    def "deletePost throws BadRequestException when non-member tries to delete GROUP_POST"() {
        given:
        def callerId = UUID.randomUUID()
        def post = savedPost(PostType.GROUP_POST, groupId)

        when:
        postService.deletePost(postId, callerId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * groupService.canManagePosts(groupId, callerId) >> false
        thrown(BadRequestException)
    }

    def "deletePost rejects GROUP_SYSTEM posts even for the group owner"() {
        given: "the post is authored (per B9) by the current owner, who tries to delete it"
        def post = savedPost(PostType.GROUP_SYSTEM, groupId)

        when:
        postService.deletePost(postId, userId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * groupService._
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "deletePost rejects SESSION_POST posts even for the nominal author"() {
        given:
        def post = savedPost(PostType.SESSION_POST)

        when:
        postService.deletePost(postId, userId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * groupService._
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    // ── getActiveBroadcasts ───────────────────────────────────────────────────

    def "getActiveBroadcasts returns broadcasts scoped to caller's sport-matched groups"() {
        given:
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([savedPost(PostType.GROUP_BROADCAST, groupId)])

        when:
        def result = postService.getActiveBroadcasts(userId, pageable)

        then:
        1 * groupService.getGroupIdsBySportProfiles(userId) >> [groupId]
        1 * postRepository.findActiveBroadcasts([groupId], pageable) >> page
        stubCounts()
        result.content.size() == 1
        result.content[0].postType == PostType.GROUP_BROADCAST
    }

    def "getActiveBroadcasts uses sentinel group id when caller has no sport-matched groups"() {
        given:
        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([])

        when:
        def result = postService.getActiveBroadcasts(userId, pageable)

        then:
        1 * groupService.getGroupIdsBySportProfiles(userId) >> []
        1 * postRepository.findActiveBroadcasts([-1L], pageable) >> page
        result.content.isEmpty()
    }

    // ── updateBroadcastEndTime ────────────────────────────────────────────────

    def "updateBroadcastEndTime succeeds when caller is group owner"() {
        given:
        def post = savedPost(PostType.GROUP_BROADCAST, groupId)
        def newEndTime = LocalDateTime.now().plusHours(6)

        when:
        def result = postService.updateBroadcastEndTime(postId, userId, newEndTime)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * groupService.canManagePosts(groupId, userId) >> true
        1 * postRepository.save({ Post p -> p.broadcastEndTime == newEndTime }) >> post
        stubCounts()
        result != null
    }

    def "updateBroadcastEndTime succeeds when caller is group admin"() {
        given:
        def post = savedPost(PostType.GROUP_BROADCAST, groupId)
        def newEndTime = LocalDateTime.now().plusHours(6)

        when:
        def result = postService.updateBroadcastEndTime(postId, userId, newEndTime)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * groupService.canManagePosts(groupId, userId) >> true
        1 * postRepository.save(_ as Post) >> post
        stubCounts()
        result != null
    }

    def "updateBroadcastEndTime throws BadRequestException when caller is neither owner nor admin"() {
        given:
        def post = savedPost(PostType.GROUP_BROADCAST, groupId)
        def newEndTime = LocalDateTime.now().plusHours(6)

        when:
        postService.updateBroadcastEndTime(postId, userId, newEndTime)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * groupService.canManagePosts(groupId, userId) >> false
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "updateBroadcastEndTime throws BadRequestException when newEndTime is not strictly future"() {
        given:
        def post = savedPost(PostType.GROUP_BROADCAST, groupId)

        when:
        postService.updateBroadcastEndTime(postId, userId, LocalDateTime.now().minusMinutes(1))

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * groupService.canManagePosts(groupId, userId) >> true
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "updateBroadcastEndTime throws BadRequestException when target post is not GROUP_BROADCAST"() {
        given:
        def post = savedPost(PostType.USER_FEED)

        when:
        postService.updateBroadcastEndTime(postId, userId, LocalDateTime.now().plusHours(1))

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * groupService._
        0 * postRepository.save(_)
        thrown(BadRequestException)
    }

    def "updateBroadcastEndTime throws NotFoundException when post does not exist"() {
        when:
        postService.updateBroadcastEndTime(postId, userId, LocalDateTime.now().plusHours(1))

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.empty()
        thrown(NotFoundException)
    }

    // ── likePost / unlikePost ─────────────────────────────────────────────────

    def "likePost creates like when not already liked"() {
        given:
        def post = savedPost()

        when:
        postService.likePost(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false
        1 * postLikeRepository.save(_ as PostLike) >> new PostLike()
        1 * stringRedisTemplate.execute(_ as RedisScript, ["post:" + postId + ":likes"])
    }

    def "likePost throws BadRequestException when already liked"() {
        given:
        def post = savedPost()

        when:
        postService.likePost(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> true
        thrown(BadRequestException)
    }

    def "likePost throws NotFoundException when post does not exist"() {
        when:
        postService.likePost(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.empty()
        1 * postGate.require(null, userId, _, _) >> { throw new NotFoundException("Post not found") }
        thrown(NotFoundException)
    }

    def "likePost throws ForbiddenException when caller cannot view the post"() {
        given:
        def post = savedPost()

        when:
        postService.likePost(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> { throw new ForbiddenException("You don't have access to this post") }
        thrown(ForbiddenException)
    }

    def "unlikePost removes like when liked"() {
        given:
        def post = savedPost()

        when:
        postService.unlikePost(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> true
        1 * postLikeRepository.deleteByPostIdAndUserId(postId, userId)
        1 * stringRedisTemplate.execute(_ as RedisScript, ["post:" + postId + ":likes"])
    }

    def "unlikePost throws BadRequestException when not liked"() {
        given:
        def post = savedPost()

        when:
        postService.unlikePost(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false
        thrown(BadRequestException)
    }

    def "unlikePost throws NotFoundException when post does not exist"() {
        when:
        postService.unlikePost(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.empty()
        1 * postGate.require(null, userId, _, _) >> { throw new NotFoundException("Post not found") }
        thrown(NotFoundException)
    }

    def "unlikePost throws ForbiddenException when caller cannot view the post"() {
        given:
        def post = savedPost()

        when:
        postService.unlikePost(postId, userId)

        then:
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> { throw new ForbiddenException("You don't have access to this post") }
        thrown(ForbiddenException)
    }

    // ── likeSessionPost / unlikeSessionPost (SESSION-10/A17) — bypass PostGate ─

    def "likeSessionPost bypasses PostGate, only checks the post is an active SESSION_POST"() {
        given:
        def post = savedPost(PostType.SESSION_POST)

        when:
        postService.likeSessionPost(postId, userId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * postGate._
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false
        1 * postLikeRepository.save(_ as PostLike) >> new PostLike()
        1 * stringRedisTemplate.execute(_ as RedisScript, ["post:" + postId + ":likes"])
    }

    def "likeSessionPost throws BadRequestException when already liked"() {
        given:
        def post = savedPost(PostType.SESSION_POST)

        when:
        postService.likeSessionPost(postId, userId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> true
        thrown(BadRequestException)
    }

    def "likeSessionPost throws NotFoundException when the post doesn't exist"() {
        when:
        postService.likeSessionPost(postId, userId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.empty()
        0 * postGate._
        thrown(NotFoundException)
    }

    def "likeSessionPost throws NotFoundException when the post exists but isn't a SESSION_POST"() {
        given:
        def post = savedPost(PostType.USER_FEED)

        when:
        postService.likeSessionPost(postId, userId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * postGate._
        0 * postLikeRepository._
        thrown(NotFoundException)
    }

    def "unlikeSessionPost bypasses PostGate, only checks the post is an active SESSION_POST"() {
        given:
        def post = savedPost(PostType.SESSION_POST)

        when:
        postService.unlikeSessionPost(postId, userId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * postGate._
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> true
        1 * postLikeRepository.deleteByPostIdAndUserId(postId, userId)
        1 * stringRedisTemplate.execute(_ as RedisScript, ["post:" + postId + ":likes"])
    }

    def "unlikeSessionPost throws NotFoundException when the post exists but isn't a SESSION_POST"() {
        given:
        def post = savedPost(PostType.GROUP_POST, groupId)

        when:
        postService.unlikeSessionPost(postId, userId)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * postGate._
        0 * postLikeRepository._
        thrown(NotFoundException)
    }
}
