package com.sportconnect.social.post.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.social.post.api.dto.CommentResponse
import com.sportconnect.social.post.api.dto.CreateCommentRequest
import com.sportconnect.social.post.entity.Comment
import com.sportconnect.social.post.entity.CommentLike
import com.sportconnect.social.post.repository.CommentLikeRepository
import com.sportconnect.social.post.repository.CommentRepository
import com.sportconnect.social.post.repository.PostRepository
import com.sportconnect.user.entity.User
import com.sportconnect.user.repository.UserRepository
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

class CommentServiceImplSpec extends Specification {

    CommentRepository commentRepository = Mock()
    CommentLikeRepository commentLikeRepository = Mock()
    PostRepository postRepository = Mock()
    UserRepository userRepository = Mock()

    @Subject
    CommentServiceImpl commentService = new CommentServiceImpl(
            commentRepository,
            commentLikeRepository,
            postRepository,
            userRepository
    )

    UUID userId = UUID.randomUUID()
    Long postId = 1L
    Long commentId = 1L

    def "createComment should create comment successfully"() {
        given: "a create comment request"
        def request = CreateCommentRequest.builder()
                .content("Test comment")
                .parentCommentId(null)
                .build()

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
        def user = User.builder()
                .id(userId)
                .firstName("Test")
                .lastName("User")
                .build()

        when: "creating a comment"
        def result = commentService.createComment(postId, userId, request)

        then: "post exists"
        1 * postRepository.existsById(postId) >> true
        1 * commentRepository.save(_ as Comment) >> savedComment
        1 * commentLikeRepository.countByCommentId(commentId) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        1 * userRepository.findById(userId) >> Optional.of(user)
        1 * commentRepository.findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(commentId) >> []

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
        1 * postRepository.existsById(postId) >> false

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "createComment should create reply to parent comment"() {
        given: "a reply request"
        def parentCommentId = 5L
        def request = CreateCommentRequest.builder()
                .content("Reply comment")
                .parentCommentId(parentCommentId)
                .build()

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
        def user = User.builder()
                .id(userId)
                .firstName("Test")
                .lastName("User")
                .build()

        when: "creating a reply"
        def result = commentService.createComment(postId, userId, request)

        then: "post and parent comment exist"
        1 * postRepository.existsById(postId) >> true
        1 * commentRepository.existsById(parentCommentId) >> true
        1 * commentRepository.save(_ as Comment) >> savedComment
        1 * commentLikeRepository.countByCommentId(commentId) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        1 * userRepository.findById(userId) >> Optional.of(user)
        1 * commentRepository.findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(commentId) >> []

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

        when: "trying to create reply"
        commentService.createComment(postId, userId, request)

        then: "post exists but parent comment not found"
        1 * postRepository.existsById(postId) >> true
        1 * commentRepository.existsById(parentCommentId) >> false

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "getPostComments should return paginated comments"() {
        given: "post comments"
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
        def user = User.builder()
                .id(userId)
                .firstName("Test")
                .lastName("User")
                .build()

        when: "getting post comments"
        def result = commentService.getPostComments(postId, userId, pageable)

        then: "comments are retrieved"
        1 * commentRepository.findByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(postId, pageable) >> page
        1 * commentLikeRepository.countByCommentId(commentId) >> 3L
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> true
        1 * userRepository.findById(userId) >> Optional.of(user)
        1 * commentRepository.findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(commentId) >> []

        and: "result is correct"
        result.content.size() == 1
        result.content[0].likeCount == 3L
        result.content[0].isLikedByCurrentUser == true
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
        when: "liking a comment"
        commentService.likeComment(commentId, userId)

        then: "like is created"
        1 * commentRepository.existsById(commentId) >> true
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false
        1 * commentLikeRepository.save(_ as CommentLike) >> new CommentLike()
    }

    def "likeComment should throw NotFoundException when comment does not exist"() {
        when: "trying to like non-existent comment"
        commentService.likeComment(commentId, userId)

        then: "comment not found"
        1 * commentRepository.existsById(commentId) >> false

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "likeComment should throw BadRequestException when already liked"() {
        when: "trying to like an already liked comment"
        commentService.likeComment(commentId, userId)

        then: "comment exists and is already liked"
        1 * commentRepository.existsById(commentId) >> true
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> true

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "unlikeComment should remove like when liked"() {
        when: "unliking a comment"
        commentService.unlikeComment(commentId, userId)

        then: "like is removed"
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> true
        1 * commentLikeRepository.deleteByCommentIdAndUserId(commentId, userId)
    }

    def "unlikeComment should throw BadRequestException when not liked"() {
        when: "trying to unlike a comment that wasn't liked"
        commentService.unlikeComment(commentId, userId)

        then: "comment is not liked"
        1 * commentLikeRepository.existsByCommentIdAndUserId(commentId, userId) >> false

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "mapToResponse should include nested replies"() {
        given: "a comment with replies"
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
        def user = User.builder()
                .id(userId)
                .firstName("Test")
                .lastName("User")
                .build()

        and: "a create comment request to trigger mapToResponse"
        def request = CreateCommentRequest.builder()
                .content("Parent comment")
                .build()

        when: "creating a comment with replies"
        def result = commentService.createComment(postId, userId, request)

        then: "comment is saved with replies"
        1 * postRepository.existsById(postId) >> true
        1 * commentRepository.save(_ as Comment) >> parentComment
        1 * commentLikeRepository.countByCommentId(1L) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(1L, userId) >> false
        1 * userRepository.findById(userId) >> Optional.of(user)
        1 * commentRepository.findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(1L) >> [replyComment]
        1 * commentLikeRepository.countByCommentId(2L) >> 0L
        1 * commentLikeRepository.existsByCommentIdAndUserId(2L, userId) >> false
        1 * userRepository.findById(userId) >> Optional.of(user)
        1 * commentRepository.findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(2L) >> []

        and: "result includes replies"
        result.replies.size() == 1
        result.replies[0].content == "Reply comment"
    }
}
