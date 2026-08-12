package com.sportconnect.social.post.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.social.post.access.PostGate
import com.sportconnect.social.post.api.dto.CommentResponse
import com.sportconnect.social.post.api.dto.CreateCommentRequest
import com.sportconnect.social.post.api.dto.PostType
import com.sportconnect.social.post.entity.Comment
import com.sportconnect.social.post.entity.CommentLike
import com.sportconnect.social.post.entity.Post
import com.sportconnect.social.post.repository.CommentLikeRepository
import com.sportconnect.social.post.repository.CommentRepository
import com.sportconnect.social.post.repository.PostRepository
import com.sportconnect.user.api.dto.UserResponse
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

class CommentServiceImplSpec extends Specification {

    CommentRepository commentRepository = Mock()
    CommentLikeRepository commentLikeRepository = Mock()
    PostRepository postRepository = Mock()
    UserService userService = Mock()
    StringRedisTemplate stringRedisTemplate = Mock()
    ValueOperations<String, String> valueOps = Mock()
    ZSetOperations<String, String> zSetOps = Mock()
    ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules()
    PostGate postGate = Mock()

    @Subject
    CommentServiceImpl commentService = new CommentServiceImpl(
            commentRepository,
            commentLikeRepository,
            postRepository,
            userService,
            stringRedisTemplate,
            objectMapper,
            postGate
    )

    def setup() {
        stringRedisTemplate.opsForValue() >> valueOps
        stringRedisTemplate.opsForZSet() >> zSetOps
    }

    UUID userId = UUID.randomUUID()
    Long postId = 1L
    Long commentId = 1L

    def "createComment should create comment successfully"() {
        given: "a create comment request"
        def request = CreateCommentRequest.builder()
                .content("Test comment")
                .parentCommentId(null)
                .build()

        and: "a post"
        def post = Post.builder().id(postId).isActive(true).build()

        and: "a saved comment"
        def savedComment = Comment.builder()
                .id(commentId)
                .postId(postId)
                .userId(userId)
                .content(request.content)
                .parentCommentId(null)
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build()

        and: "a user"
        def user = UserResponse.builder()
                .id(userId)
                .firstName("Test")
                .lastName("User")
                .build()

        when: "creating a comment"
        def result = commentService.createComment(postId, userId, request)

        then: "post exists"
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * commentRepository.save(_ as Comment) >> savedComment
        1 * stringRedisTemplate.execute(_ as RedisScript, ["post:" + postId + ":comments"])
        // countByCommentId called once from mapToResponse, once from buildPreviewResponse in addToPreviewCache
        2 * commentLikeRepository.countByCommentId(commentId) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        // mapToResponse resolves the author via the batched getUsersByIds (single-id list at this call site);
        // buildPreviewResponse (addToPreviewCache) still uses the single-item getUserById, unchanged
        1 * userService.getUsersByIds([userId]) >> [(userId): user]
        1 * userService.getUserById(userId) >> user
        // a freshly created comment can never have replies yet — createComment passes an empty
        // replies map directly instead of querying
        0 * commentRepository.findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(_)
        0 * commentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc(_)

        and: "result is correct"
        result != null
        result.content == request.content
        result.postId == postId
        result.userId == userId
    }

    def "createComment should throw NotFoundException when post does not exist"() {
        given: "a create comment request"
        def request = CreateCommentRequest.builder()
                .content("Test comment")
                .build()

        when: "trying to create comment on non-existent post"
        commentService.createComment(postId, userId, request)

        then: "post not found"
        1 * postRepository.findById(postId) >> Optional.empty()
        1 * postGate.require(null, userId, _, _) >> { throw new NotFoundException("Post not found") }

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "createComment should throw ForbiddenException when caller cannot view the post"() {
        given: "a create comment request"
        def request = CreateCommentRequest.builder()
                .content("Test comment")
                .build()

        and: "a post the caller can't see"
        def post = Post.builder().id(postId).isActive(true).build()

        when: "trying to comment on a post outside the caller's access"
        commentService.createComment(postId, userId, request)

        then: "post exists but is not visible"
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> { throw new ForbiddenException("You don't have access to this post") }

        and: "exception is thrown"
        thrown(ForbiddenException)
    }

    def "createComment should create reply to parent comment"() {
        given: "a reply request"
        def parentCommentId = 5L
        def request = CreateCommentRequest.builder()
                .content("Reply comment")
                .parentCommentId(parentCommentId)
                .build()

        and: "a post"
        def post = Post.builder().id(postId).isActive(true).build()

        and: "a saved reply"
        def savedComment = Comment.builder()
                .id(commentId)
                .postId(postId)
                .userId(userId)
                .content(request.content)
                .parentCommentId(parentCommentId)
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build()

        and: "a user"
        def user = UserResponse.builder()
                .id(userId)
                .firstName("Test")
                .lastName("User")
                .build()

        when: "creating a reply"
        def result = commentService.createComment(postId, userId, request)

        then: "post and parent comment exist"
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * commentRepository.existsById(parentCommentId) >> true
        1 * commentRepository.save(_ as Comment) >> savedComment
        1 * stringRedisTemplate.execute(_ as RedisScript, ["comment:" + parentCommentId + ":replies"])
        1 * commentLikeRepository.countByCommentId(commentId) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        1 * userService.getUsersByIds([userId]) >> [(userId): user]
        0 * userService.getUserById(_)
        0 * commentRepository.findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(_)
        0 * commentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc(_)

        and: "result has parent comment id"
        result.parentCommentId == parentCommentId
    }

    def "createComment should throw NotFoundException when parent comment does not exist"() {
        given: "a reply request with non-existent parent"
        def parentCommentId = 999L
        def request = CreateCommentRequest.builder()
                .content("Reply comment")
                .parentCommentId(parentCommentId)
                .build()
        def post = Post.builder().id(postId).isActive(true).build()

        when: "trying to create reply"
        commentService.createComment(postId, userId, request)

        then: "post exists but parent comment not found"
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * commentRepository.existsById(parentCommentId) >> false

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "getPostComments should return paginated comments"() {
        given: "an active post"
        def post = Post.builder().id(postId).isActive(true).build()

        and: "post comments"
        def comment = Comment.builder()
                .id(commentId)
                .postId(postId)
                .userId(userId)
                .content("Test comment")
                .parentCommentId(null)
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build()

        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([comment])

        and: "a user"
        def user = UserResponse.builder()
                .id(userId)
                .firstName("Test")
                .lastName("User")
                .build()

        when: "getting post comments"
        def result = commentService.getPostComments(postId, userId, pageable)

        then: "post is active"
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post

        and: "comments are retrieved"
        1 * commentRepository.findByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(postId, pageable) >> page
        1 * commentLikeRepository.countByCommentId(commentId) >> 3L
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> true
        1 * commentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc([commentId]) >> []
        1 * userService.getUsersByIds([userId]) >> [(userId): user]

        and: "result is correct"
        result.content.size() == 1
        result.content[0].likeCount == 3L
        result.content[0].replyCount == 0L
        result.content[0].isLikedByCurrentUser == true
    }

    def "getPostComments should throw NotFoundException when post is soft-deleted"() {
        given: "a pageable"
        def pageable = PageRequest.of(0, 20)

        when: "getting comments for a soft-deleted post"
        commentService.getPostComments(postId, userId, pageable)

        then: "post not found as active"
        1 * postRepository.findById(postId) >> Optional.empty()
        1 * postGate.require(null, userId, _, _) >> { throw new NotFoundException("Post not found") }

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "getPostComments should throw ForbiddenException when caller cannot view the post"() {
        given: "a pageable and a post the caller can't see"
        def pageable = PageRequest.of(0, 20)
        def post = Post.builder().id(postId).isActive(true).build()

        when: "getting comments outside the caller's access"
        commentService.getPostComments(postId, userId, pageable)

        then: "post exists but is not visible"
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> { throw new ForbiddenException("You don't have access to this post") }

        and: "exception is thrown"
        thrown(ForbiddenException)
    }

    def "deleteComment should soft delete comment when user is owner"() {
        given: "an active comment"
        def comment = Comment.builder()
                .id(commentId)
                .postId(postId)
                .userId(userId)
                .content("Test comment")
                .isActive(true)
                .build()

        when: "deleting the comment"
        commentService.deleteComment(commentId, userId)

        then: "comment is soft deleted"
        1 * commentRepository.findById(commentId) >> Optional.of(comment)
        1 * commentRepository.save({ Comment c -> !c.isActive }) >> comment
        1 * stringRedisTemplate.execute(_ as RedisScript, ["post:" + postId + ":comments"])
    }

    def "deleteComment should throw NotFoundException when comment not found"() {
        when: "trying to delete non-existent comment"
        commentService.deleteComment(commentId, userId)

        then: "comment not found"
        1 * commentRepository.findById(commentId) >> Optional.empty()

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "deleteComment should throw BadRequestException when user is not owner"() {
        given: "a comment owned by another user"
        def otherUserId = UUID.randomUUID()
        def comment = Comment.builder()
                .id(commentId)
                .postId(postId)
                .userId(otherUserId)
                .content("Test comment")
                .build()

        when: "trying to delete the comment"
        commentService.deleteComment(commentId, userId)

        then: "comment is found"
        1 * commentRepository.findById(commentId) >> Optional.of(comment)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "likeComment should create like when not already liked"() {
        given: "an active comment on a visible post"
        def comment = Comment.builder().id(commentId).postId(postId).isActive(true).build()
        def post = Post.builder().id(postId).isActive(true).build()

        when: "liking a comment"
        commentService.likeComment(commentId, userId)

        then: "like is created"
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.of(comment)
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        1 * commentLikeRepository.save(_ as CommentLike) >> new CommentLike()
        1 * stringRedisTemplate.execute(_ as RedisScript, ["comment:" + commentId + ":likes"])
    }

    def "likeComment should throw NotFoundException when comment does not exist"() {
        when: "trying to like non-existent comment"
        commentService.likeComment(commentId, userId)

        then: "comment not found"
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.empty()

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "likeComment should throw ForbiddenException when caller cannot view the parent post"() {
        given: "an active comment on a post the caller can't see"
        def comment = Comment.builder().id(commentId).postId(postId).isActive(true).build()
        def post = Post.builder().id(postId).isActive(true).build()

        when: "trying to like the comment"
        commentService.likeComment(commentId, userId)

        then: "comment exists but its post is not visible"
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.of(comment)
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> { throw new ForbiddenException("You don't have access to this post") }

        and: "exception is thrown"
        thrown(ForbiddenException)
    }

    def "likeComment should throw BadRequestException when already liked"() {
        given: "an active comment on a visible post"
        def comment = Comment.builder().id(commentId).postId(postId).isActive(true).build()
        def post = Post.builder().id(postId).isActive(true).build()

        when: "trying to like an already liked comment"
        commentService.likeComment(commentId, userId)

        then: "comment exists and is already liked"
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.of(comment)
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> true

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "unlikeComment should remove like when liked"() {
        given: "an active comment on a visible post"
        def comment = Comment.builder().id(commentId).postId(postId).isActive(true).build()
        def post = Post.builder().id(postId).isActive(true).build()

        when: "unliking a comment"
        commentService.unlikeComment(commentId, userId)

        then: "like is removed"
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.of(comment)
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> true
        1 * commentLikeRepository.deleteByCommentIdAndUserId(commentId, userId)
        1 * stringRedisTemplate.execute(_ as RedisScript, ["comment:" + commentId + ":likes"])
    }

    def "unlikeComment should throw NotFoundException when comment does not exist"() {
        when: "trying to unlike a non-existent comment"
        commentService.unlikeComment(commentId, userId)

        then: "comment not found"
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.empty()

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "unlikeComment should throw BadRequestException when not liked"() {
        given: "an active comment on a visible post"
        def comment = Comment.builder().id(commentId).postId(postId).isActive(true).build()
        def post = Post.builder().id(postId).isActive(true).build()

        when: "trying to unlike a comment that wasn't liked"
        commentService.unlikeComment(commentId, userId)

        then: "comment is not liked"
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.of(comment)
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "getPostComments should include nested replies, batched not per-comment"() {
        given: "a root comment with one reply"
        def pageable = PageRequest.of(0, 20)
        def post = Post.builder().id(postId).isActive(true).build()

        def parentComment = Comment.builder()
                .id(1L)
                .postId(postId)
                .userId(userId)
                .content("Parent comment")
                .parentCommentId(null)
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build()

        def replyComment = Comment.builder()
                .id(2L)
                .postId(postId)
                .userId(userId)
                .content("Reply comment")
                .parentCommentId(1L)
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build()

        and: "a user"
        def user = UserResponse.builder()
                .id(userId)
                .firstName("Test")
                .lastName("User")
                .build()

        when: "getting post comments"
        def result = commentService.getPostComments(postId, userId, pageable)

        then: "post is active, root comments and their replies are each fetched once for the whole page"
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * commentRepository.findByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(postId, pageable) >> new PageImpl<>([parentComment])
        1 * commentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc([1L]) >> [replyComment]
        // both parent and reply are authored by the same user here — one batched call covers both
        1 * userService.getUsersByIds([userId]) >> [(userId): user]
        1 * commentLikeRepository.countByCommentId(1L) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(1L, userId) >> false
        1 * commentLikeRepository.countByCommentId(2L) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(2L, userId) >> false

        and: "result includes the nested reply"
        result.content.size() == 1
        result.content[0].replies.size() == 1
        result.content[0].replies[0].content == "Reply comment"
    }

    def "mapToResponse reads replyCount from Redis when cached"() {
        given: "a comment with cached reply count"
        def pageable = PageRequest.of(0, 20)
        def post = Post.builder().id(postId).isActive(true).build()
        def comment = Comment.builder()
                .id(commentId)
                .postId(postId)
                .userId(userId)
                .content("Test comment")
                .parentCommentId(null)
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build()
        def user = UserResponse.builder().id(userId).firstName("Test").lastName("User").build()

        when:
        def result = commentService.getPostComments(postId, userId, pageable)

        then:
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post
        1 * commentRepository.findByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(postId, pageable) >> new PageImpl<>([comment])
        valueOps.get("comment:" + commentId + ":likes") >> "4"
        valueOps.get("comment:" + commentId + ":replies") >> "6"
        0 * commentLikeRepository.countByCommentId(_)
        0 * commentRepository.countByParentCommentIdAndIsActiveTrue(_)
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        1 * commentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc([commentId]) >> []
        1 * userService.getUsersByIds([userId]) >> [(userId): user]
        result.content[0].likeCount == 4L
        result.content[0].replyCount == 6L
    }

    def "getPostComments falls back to Unknown User when the comment author no longer exists"() {
        given: "an active post and a comment authored by a since-deleted user"
        def pageable = PageRequest.of(0, 20)
        def post = Post.builder().id(postId).isActive(true).build()
        def comment = Comment.builder()
                .id(commentId)
                .postId(postId)
                .userId(userId)
                .content("Test comment")
                .parentCommentId(null)
                .isActive(true)
                .createdAt(LocalDateTime.now())
                .build()

        when: "getting post comments"
        def result = commentService.getPostComments(postId, userId, pageable)

        then: "post is active"
        1 * postRepository.findById(postId) >> Optional.of(post)
        1 * postGate.require(post, userId, _, _) >> post

        and: "comments are retrieved, but the author id resolves to nothing (deleted/missing user)"
        1 * commentRepository.findByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(postId, pageable) >> new PageImpl<>([comment])
        1 * commentLikeRepository.countByCommentId(commentId) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        1 * commentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc([commentId]) >> []
        // getUsersByIds never throws — a missing id is simply absent from the returned map
        1 * userService.getUsersByIds([userId]) >> [:]

        and: "the fallback name is used instead of a 500"
        result.content[0].userFullName == "Unknown User"
    }

    // ── SESSION-10/A17 bypass methods — skip PostGate entirely ─────────────────

    def "createSessionComment bypasses PostGate, only checks the post is an active SESSION_POST"() {
        given:
        def request = CreateCommentRequest.builder().content("see you there").build()
        def post = Post.builder().id(postId).postType(PostType.SESSION_POST).isActive(true).build()
        def savedComment = Comment.builder().id(commentId).postId(postId).userId(userId)
                .content(request.content).isActive(true).createdAt(LocalDateTime.now()).build()
        def user = UserResponse.builder().id(userId).firstName("Test").lastName("User").build()

        when:
        def result = commentService.createSessionComment(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * postGate._
        1 * commentRepository.save(_ as Comment) >> savedComment
        // countByCommentId called once from mapToResponse, once from buildPreviewResponse in addToPreviewCache
        2 * commentLikeRepository.countByCommentId(commentId) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        1 * userService.getUsersByIds([userId]) >> [(userId): user]
        1 * userService.getUserById(userId) >> user
        result.content == request.content
    }

    def "createSessionComment throws NotFoundException when the post doesn't exist"() {
        given:
        def request = CreateCommentRequest.builder().content("x").build()

        when:
        commentService.createSessionComment(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.empty()
        0 * postGate._
        thrown(NotFoundException)
    }

    def "createSessionComment throws NotFoundException when the post exists but isn't a SESSION_POST"() {
        given: "an otherwise-valid active post of a different type"
        def request = CreateCommentRequest.builder().content("x").build()
        def post = Post.builder().id(postId).postType(PostType.USER_FEED).isActive(true).build()

        when:
        commentService.createSessionComment(postId, userId, request)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * postGate._
        0 * commentRepository.save(_)
        thrown(NotFoundException)
    }

    def "getSessionPostComments bypasses PostGate, only checks the post is an active SESSION_POST"() {
        given:
        def pageable = PageRequest.of(0, 20)
        def post = Post.builder().id(postId).postType(PostType.SESSION_POST).isActive(true).build()
        def comment = Comment.builder().id(commentId).postId(postId).userId(userId)
                .content("hi").isActive(true).createdAt(LocalDateTime.now()).build()
        def user = UserResponse.builder().id(userId).firstName("Test").lastName("User").build()

        when:
        def result = commentService.getSessionPostComments(postId, userId, pageable)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * postGate._
        1 * commentRepository.findByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(postId, pageable) >> new PageImpl<>([comment])
        1 * commentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc([commentId]) >> []
        1 * commentLikeRepository.countByCommentId(commentId) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        1 * userService.getUsersByIds([userId]) >> [(userId): user]
        result.content.size() == 1
    }

    def "getSessionPostComments throws NotFoundException when the post exists but isn't a SESSION_POST"() {
        given:
        def pageable = PageRequest.of(0, 20)
        def post = Post.builder().id(postId).postType(PostType.GROUP_POST).isActive(true).build()

        when:
        commentService.getSessionPostComments(postId, userId, pageable)

        then:
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * postGate._
        0 * commentRepository._
        thrown(NotFoundException)
    }

    def "likeSessionComment bypasses PostGate, only checks the comment belongs to the given SESSION_POST"() {
        given:
        def comment = Comment.builder().id(commentId).postId(postId).isActive(true).build()
        def post = Post.builder().id(postId).postType(PostType.SESSION_POST).isActive(true).build()

        when:
        commentService.likeSessionComment(postId, commentId, userId)

        then:
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.of(comment)
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * postGate._
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        1 * commentLikeRepository.save(_ as CommentLike) >> new CommentLike()
    }

    def "likeSessionComment throws NotFoundException when the parent post doesn't exist"() {
        given:
        def comment = Comment.builder().id(commentId).postId(postId).isActive(true).build()

        when:
        commentService.likeSessionComment(postId, commentId, userId)

        then:
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.of(comment)
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.empty()
        0 * postGate._
        thrown(NotFoundException)
    }

    def "likeSessionComment throws NotFoundException when the comment belongs to a different post (cross-session IDOR)"() {
        given: "a caller authorized against postId, but commentId actually belongs to some other post"
        def otherPostId = 999L
        def comment = Comment.builder().id(commentId).postId(otherPostId).isActive(true).build()

        when:
        commentService.likeSessionComment(postId, commentId, userId)

        then:
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.of(comment)
        0 * postRepository._
        0 * postGate._
        0 * commentLikeRepository._
        thrown(NotFoundException)
    }

    def "unlikeSessionComment bypasses PostGate, only checks the comment belongs to the given SESSION_POST"() {
        given:
        def comment = Comment.builder().id(commentId).postId(postId).isActive(true).build()
        def post = Post.builder().id(postId).postType(PostType.SESSION_POST).isActive(true).build()

        when:
        commentService.unlikeSessionComment(postId, commentId, userId)

        then:
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.of(comment)
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        0 * postGate._
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> true
        1 * commentLikeRepository.deleteByCommentIdAndUserId(commentId, userId)
    }

    def "unlikeSessionComment throws NotFoundException when the comment belongs to a different post (cross-session IDOR)"() {
        given:
        def otherPostId = 999L
        def comment = Comment.builder().id(commentId).postId(otherPostId).isActive(true).build()

        when:
        commentService.unlikeSessionComment(postId, commentId, userId)

        then:
        1 * commentRepository.findByIdAndIsActiveTrue(commentId) >> Optional.of(comment)
        0 * postRepository._
        0 * postGate._
        0 * commentLikeRepository._
        thrown(NotFoundException)
    }
}
