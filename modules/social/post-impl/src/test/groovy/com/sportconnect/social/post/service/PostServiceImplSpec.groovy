package com.sportconnect.social.post.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.social.post.api.dto.CreatePostRequest
import com.sportconnect.social.post.api.dto.PostResponse
import com.sportconnect.social.post.entity.Post
import com.sportconnect.social.post.entity.PostLike
import com.sportconnect.social.post.repository.CommentRepository
import com.sportconnect.social.post.repository.PostLikeRepository
import com.sportconnect.social.post.repository.PostRepository
import org.springframework.data.domain.Page
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

class PostServiceImplSpec extends Specification {

    PostRepository postRepository = Mock()
    PostLikeRepository postLikeRepository = Mock()
    CommentRepository commentRepository = Mock()

    @Subject
    PostServiceImpl postService = new PostServiceImpl(postRepository, postLikeRepository, commentRepository)

    UUID userId = UUID.randomUUID()
    Long postId = 1L

    def "createPost should create post successfully"() {
        given: "a create post request"
        def request = CreatePostRequest.builder()
                .content("Test post content")
                .latitude(37.7749)
                .longitude(-122.4194)
                .locationName("San Francisco")
                .sportId(1L)
                .groupId(null)
                .visibility("public")
                .build()

        and: "a saved post"
        def savedPost = Post.builder()
                .id(postId)
                .userId(userId)
                .content(request.content)
                .locationName(request.locationName)
                .sportId(request.sportId)
                .visibility(request.visibility)
                .media([])
                .hashtags([])
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build()

        when: "creating a post"
        def result = postService.createPost(userId, request)

        then: "post is saved"
        1 * postRepository.save(_ as Post) >> savedPost
        1 * postLikeRepository.countByPostId(postId) >> 0L
        1 * commentRepository.countByPostIdAndIsActiveTrue(postId) >> 0L
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false

        and: "result is correct"
        result != null
        result.userId == userId
        result.content == request.content
    }

    def "createPost should default visibility to public when not specified"() {
        given: "a request without visibility"
        def request = CreatePostRequest.builder()
                .content("Test post")
                .build()

        and: "a saved post with public visibility"
        def savedPost = Post.builder()
                .id(postId)
                .userId(userId)
                .content(request.content)
                .visibility("public")
                .media([])
                .hashtags([])
                .createdAt(LocalDateTime.now())
                .build()

        when: "creating a post"
        def result = postService.createPost(userId, request)

        then: "post is saved with public visibility"
        1 * postRepository.save(_ as Post) >> savedPost
        1 * postLikeRepository.countByPostId(postId) >> 0L
        1 * commentRepository.countByPostIdAndIsActiveTrue(postId) >> 0L
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false

        and: "visibility is public"
        result.visibility == "public"
    }

    def "createPost should set groupId when creating group post"() {
        given: "a request with groupId"
        def groupId = 5L
        def request = CreatePostRequest.builder()
                .content("Group post")
                .groupId(groupId)
                .build()

        and: "a saved post with groupId"
        def savedPost = Post.builder()
                .id(postId)
                .userId(userId)
                .groupId(groupId)
                .content(request.content)
                .visibility("public")
                .media([])
                .hashtags([])
                .createdAt(LocalDateTime.now())
                .build()

        when: "creating a post"
        def result = postService.createPost(userId, request)

        then: "post is saved with groupId"
        1 * postRepository.save({ Post p -> p.groupId == groupId }) >> savedPost
        1 * postLikeRepository.countByPostId(postId) >> 0L
        1 * commentRepository.countByPostIdAndIsActiveTrue(postId) >> 0L
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false

        and: "result contains groupId"
        result.groupId == groupId
    }

    def "getPostById should return post when found"() {
        given: "an existing post"
        def post = Post.builder()
                .id(postId)
                .userId(userId)
                .content("Test content")
                .visibility("public")
                .media([])
                .hashtags([])
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build()

        when: "getting post by id"
        def result = postService.getPostById(postId, userId)

        then: "post is retrieved"
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * postLikeRepository.countByPostId(postId) >> 5L
        1 * commentRepository.countByPostIdAndIsActiveTrue(postId) >> 3L
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> true

        and: "result is correct"
        result != null
        result.id == postId
        result.likeCount == 5L
        result.commentCount == 3L
        result.isLikedByCurrentUser == true
    }

    def "getPostById should throw NotFoundException when post not found"() {
        when: "getting non-existent post"
        postService.getPostById(postId, userId)

        then: "post not found"
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.empty()

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "getUserPosts should return user's posts"() {
        given: "user's posts"
        def post = Post.builder()
                .id(postId)
                .userId(userId)
                .content("User post")
                .visibility("public")
                .media([])
                .hashtags([])
                .createdAt(LocalDateTime.now())
                .build()

        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([post])

        when: "getting user posts"
        def result = postService.getUserPosts(userId, userId, pageable)

        then: "posts are retrieved"
        1 * postRepository.findByUserIdAndIsActiveTrue(userId, pageable) >> page
        1 * postLikeRepository.countByPostId(postId) >> 2L
        1 * commentRepository.countByPostIdAndIsActiveTrue(postId) >> 1L
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false

        and: "result contains posts"
        result.content.size() == 1
        result.content[0].userId == userId
    }

    def "getPublicFeed should return public posts excluding group posts"() {
        given: "public posts"
        def post = Post.builder()
                .id(postId)
                .userId(userId)
                .groupId(null)
                .content("Public post")
                .visibility("public")
                .media([])
                .hashtags([])
                .createdAt(LocalDateTime.now())
                .build()

        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([post])

        when: "getting public feed"
        def result = postService.getPublicFeed(userId, pageable)

        then: "public posts are retrieved"
        1 * postRepository.findPublicPosts(pageable) >> page
        1 * postLikeRepository.countByPostId(postId) >> 10L
        1 * commentRepository.countByPostIdAndIsActiveTrue(postId) >> 5L
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false

        and: "result is correct"
        result.content.size() == 1
        result.content[0].likeCount == 10L
        result.content[0].commentCount == 5L
    }

    def "getGroupPosts should return posts for specific group"() {
        given: "group posts"
        def groupId = 5L
        def post = Post.builder()
                .id(postId)
                .userId(userId)
                .groupId(groupId)
                .content("Group post")
                .visibility("public")
                .media([])
                .hashtags([])
                .createdAt(LocalDateTime.now())
                .build()

        def pageable = PageRequest.of(0, 20)
        def page = new PageImpl<>([post])

        when: "getting group posts"
        def result = postService.getGroupPosts(groupId, userId, pageable)

        then: "group posts are retrieved"
        1 * postRepository.findByGroupIdAndIsActiveTrue(groupId, pageable) >> page
        1 * postLikeRepository.countByPostId(postId) >> 3L
        1 * commentRepository.countByPostIdAndIsActiveTrue(postId) >> 2L
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> true

        and: "result contains group posts"
        result.content.size() == 1
        result.content[0].groupId == groupId
    }

    def "updatePost should update post when user is owner"() {
        given: "an existing post"
        def post = Post.builder()
                .id(postId)
                .userId(userId)
                .content("Old content")
                .visibility("public")
                .media([])
                .hashtags([])
                .build()

        and: "an update request"
        def request = CreatePostRequest.builder()
                .content("Updated content")
                .locationName("New Location")
                .build()

        when: "updating the post"
        def result = postService.updatePost(postId, userId, request)

        then: "post is updated"
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * postRepository.save(_ as Post) >> post
        1 * postLikeRepository.countByPostId(postId) >> 0L
        1 * commentRepository.countByPostIdAndIsActiveTrue(postId) >> 0L
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false

        and: "result is returned"
        result != null
    }

    def "updatePost should throw BadRequestException when user is not owner"() {
        given: "a post owned by another user"
        def otherUserId = UUID.randomUUID()
        def post = Post.builder()
                .id(postId)
                .userId(otherUserId)
                .content("Content")
                .build()

        and: "an update request"
        def request = CreatePostRequest.builder()
                .content("Updated content")
                .build()

        when: "trying to update the post"
        postService.updatePost(postId, userId, request)

        then: "post is found"
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "deletePost should soft delete post when user is owner"() {
        given: "an active post"
        def post = Post.builder()
                .id(postId)
                .userId(userId)
                .content("Content")
                .isActive(true)
                .build()

        when: "deleting the post"
        postService.deletePost(postId, userId)

        then: "post is soft deleted"
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)
        1 * postRepository.save({ Post p -> !p.isActive }) >> post
    }

    def "deletePost should throw BadRequestException when user is not owner"() {
        given: "a post owned by another user"
        def otherUserId = UUID.randomUUID()
        def post = Post.builder()
                .id(postId)
                .userId(otherUserId)
                .content("Content")
                .build()

        when: "trying to delete the post"
        postService.deletePost(postId, userId)

        then: "post is found"
        1 * postRepository.findByIdAndIsActiveTrue(postId) >> Optional.of(post)

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "likePost should create like when not already liked"() {
        when: "liking a post"
        postService.likePost(postId, userId)

        then: "like is created"
        1 * postRepository.existsById(postId) >> true
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false
        1 * postLikeRepository.save(_ as PostLike) >> new PostLike()
    }

    def "likePost should throw BadRequestException when already liked"() {
        when: "trying to like an already liked post"
        postService.likePost(postId, userId)

        then: "post exists and is already liked"
        1 * postRepository.existsById(postId) >> true
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> true

        and: "exception is thrown"
        thrown(BadRequestException)
    }

    def "likePost should throw NotFoundException when post does not exist"() {
        when: "trying to like non-existent post"
        postService.likePost(postId, userId)

        then: "post not found"
        1 * postRepository.existsById(postId) >> false

        and: "exception is thrown"
        thrown(NotFoundException)
    }

    def "unlikePost should remove like when liked"() {
        when: "unliking a post"
        postService.unlikePost(postId, userId)

        then: "like is removed"
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> true
        1 * postLikeRepository.deleteByPostIdAndUserId(postId, userId)
    }

    def "unlikePost should throw BadRequestException when not liked"() {
        when: "trying to unlike a post that wasn't liked"
        postService.unlikePost(postId, userId)

        then: "post is not liked"
        1 * postLikeRepository.existsByPostIdAndUserId(postId, userId) >> false

        and: "exception is thrown"
        thrown(BadRequestException)
    }
}
