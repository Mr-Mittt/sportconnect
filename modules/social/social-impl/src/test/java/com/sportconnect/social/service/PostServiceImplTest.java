package com.sportconnect.social.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.social.api.dto.CreatePostRequest;
import com.sportconnect.social.api.dto.PostResponse;
import com.sportconnect.social.entity.Post;
import com.sportconnect.social.entity.PostLike;
import com.sportconnect.social.repository.CommentRepository;
import com.sportconnect.social.repository.PostLikeRepository;
import com.sportconnect.social.repository.PostRepository;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PostServiceImplTest {

    @Mock
    private PostRepository postRepository;

    @Mock
    private PostLikeRepository postLikeRepository;

    @Mock
    private CommentRepository commentRepository;

    @InjectMocks
    private PostServiceImpl postService;

    private UUID userId;
    private Long postId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        postId = 1L;
    }

    @Test
    void createPost_ShouldCreatePostSuccessfully() {
        // Given
        CreatePostRequest request = CreatePostRequest.builder()
                .content("Test post content")
                .latitude(37.7749)
                .longitude(-122.4194)
                .locationName("San Francisco")
                .sportId(1L)
                .visibility("public")
                .build();

        Post savedPost = Post.builder()
                .id(postId)
                .userId(userId)
                .content(request.getContent())
                .locationName(request.getLocationName())
                .sportId(request.getSportId())
                .visibility(request.getVisibility())
                .media(new ArrayList<>())
                .hashtags(new ArrayList<>())
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        when(postRepository.save(any(Post.class))).thenReturn(savedPost);
        when(postLikeRepository.countByPostId(postId)).thenReturn(0L);
        when(commentRepository.countByPostIdAndIsActiveTrue(postId)).thenReturn(0L);
        when(postLikeRepository.existsByPostIdAndUserId(postId, userId)).thenReturn(false);

        // When
        PostResponse result = postService.createPost(userId, request);

        // Then
        assertNotNull(result);
        assertEquals(userId, result.getUserId());
        assertEquals(request.getContent(), result.getContent());
        verify(postRepository, times(1)).save(any(Post.class));
    }

    @Test
    void createPost_ShouldDefaultVisibilityToPublic() {
        // Given
        CreatePostRequest request = CreatePostRequest.builder()
                .content("Test post")
                .build();

        Post savedPost = Post.builder()
                .id(postId)
                .userId(userId)
                .content(request.getContent())
                .visibility("public")
                .media(new ArrayList<>())
                .hashtags(new ArrayList<>())
                .createdAt(LocalDateTime.now())
                .build();

        when(postRepository.save(any(Post.class))).thenReturn(savedPost);
        when(postLikeRepository.countByPostId(postId)).thenReturn(0L);
        when(commentRepository.countByPostIdAndIsActiveTrue(postId)).thenReturn(0L);
        when(postLikeRepository.existsByPostIdAndUserId(postId, userId)).thenReturn(false);

        // When
        PostResponse result = postService.createPost(userId, request);

        // Then
        assertEquals("public", result.getVisibility());
    }

    @Test
    void getPostById_ShouldReturnPost_WhenFound() {
        // Given
        Post post = Post.builder()
                .id(postId)
                .userId(userId)
                .content("Test content")
                .visibility("public")
                .media(new ArrayList<>())
                .hashtags(new ArrayList<>())
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        when(postRepository.findByIdAndIsActiveTrue(postId)).thenReturn(Optional.of(post));
        when(postLikeRepository.countByPostId(postId)).thenReturn(5L);
        when(commentRepository.countByPostIdAndIsActiveTrue(postId)).thenReturn(3L);
        when(postLikeRepository.existsByPostIdAndUserId(postId, userId)).thenReturn(true);

        // When
        PostResponse result = postService.getPostById(postId, userId);

        // Then
        assertNotNull(result);
        assertEquals(postId, result.getId());
        assertEquals(5L, result.getLikeCount());
        assertEquals(3L, result.getCommentCount());
        assertTrue(result.getIsLikedByCurrentUser());
    }

    @Test
    void getPostById_ShouldThrowNotFoundException_WhenNotFound() {
        // Given
        when(postRepository.findByIdAndIsActiveTrue(postId)).thenReturn(Optional.empty());

        // When & Then
        assertThrows(NotFoundException.class, () -> postService.getPostById(postId, userId));
    }

    @Test
    void updatePost_ShouldUpdatePost_WhenUserIsOwner() {
        // Given
        Post post = Post.builder()
                .id(postId)
                .userId(userId)
                .content("Old content")
                .visibility("public")
                .media(new ArrayList<>())
                .hashtags(new ArrayList<>())
                .build();

        CreatePostRequest request = CreatePostRequest.builder()
                .content("Updated content")
                .locationName("New Location")
                .build();

        when(postRepository.findByIdAndIsActiveTrue(postId)).thenReturn(Optional.of(post));
        when(postRepository.save(any(Post.class))).thenReturn(post);
        when(postLikeRepository.countByPostId(postId)).thenReturn(0L);
        when(commentRepository.countByPostIdAndIsActiveTrue(postId)).thenReturn(0L);
        when(postLikeRepository.existsByPostIdAndUserId(postId, userId)).thenReturn(false);

        // When
        PostResponse result = postService.updatePost(postId, userId, request);

        // Then
        assertNotNull(result);
        verify(postRepository, times(1)).save(any(Post.class));
    }

    @Test
    void updatePost_ShouldThrowBadRequestException_WhenUserIsNotOwner() {
        // Given
        UUID otherUserId = UUID.randomUUID();
        Post post = Post.builder()
                .id(postId)
                .userId(otherUserId)
                .content("Content")
                .build();

        CreatePostRequest request = CreatePostRequest.builder()
                .content("Updated content")
                .build();

        when(postRepository.findByIdAndIsActiveTrue(postId)).thenReturn(Optional.of(post));

        // When & Then
        assertThrows(BadRequestException.class, () -> postService.updatePost(postId, userId, request));
    }

    @Test
    void deletePost_ShouldSoftDeletePost_WhenUserIsOwner() {
        // Given
        Post post = Post.builder()
                .id(postId)
                .userId(userId)
                .content("Content")
                .isActive(true)
                .build();

        when(postRepository.findByIdAndIsActiveTrue(postId)).thenReturn(Optional.of(post));
        when(postRepository.save(any(Post.class))).thenReturn(post);

        // When
        postService.deletePost(postId, userId);

        // Then
        verify(postRepository, times(1)).save(argThat(p -> !p.getIsActive()));
    }

    @Test
    void likePost_ShouldCreateLike_WhenNotAlreadyLiked() {
        // Given
        when(postRepository.existsById(postId)).thenReturn(true);
        when(postLikeRepository.existsByPostIdAndUserId(postId, userId)).thenReturn(false);
        when(postLikeRepository.save(any(PostLike.class))).thenReturn(new PostLike());

        // When
        postService.likePost(postId, userId);

        // Then
        verify(postLikeRepository, times(1)).save(any(PostLike.class));
    }

    @Test
    void likePost_ShouldThrowBadRequestException_WhenAlreadyLiked() {
        // Given
        when(postRepository.existsById(postId)).thenReturn(true);
        when(postLikeRepository.existsByPostIdAndUserId(postId, userId)).thenReturn(true);

        // When & Then
        assertThrows(BadRequestException.class, () -> postService.likePost(postId, userId));
    }

    @Test
    void unlikePost_ShouldRemoveLike_WhenLiked() {
        // Given
        when(postLikeRepository.existsByPostIdAndUserId(postId, userId)).thenReturn(true);

        // When
        postService.unlikePost(postId, userId);

        // Then
        verify(postLikeRepository, times(1)).deleteByPostIdAndUserId(postId, userId);
    }

    @Test
    void getPublicFeed_ShouldReturnPublicPosts() {
        // Given
        Post post = Post.builder()
                .id(postId)
                .userId(userId)
                .content("Public post")
                .visibility("public")
                .media(new ArrayList<>())
                .hashtags(new ArrayList<>())
                .createdAt(LocalDateTime.now())
                .build();

        Pageable pageable = PageRequest.of(0, 20);
        Page<Post> page = new PageImpl<>(List.of(post));

        when(postRepository.findPublicPosts(pageable)).thenReturn(page);
        when(postLikeRepository.countByPostId(postId)).thenReturn(10L);
        when(commentRepository.countByPostIdAndIsActiveTrue(postId)).thenReturn(5L);
        when(postLikeRepository.existsByPostIdAndUserId(postId, userId)).thenReturn(false);

        // When
        Page<PostResponse> result = postService.getPublicFeed(userId, pageable);

        // Then
        assertEquals(1, result.getContent().size());
        assertEquals(10L, result.getContent().get(0).getLikeCount());
        assertEquals(5L, result.getContent().get(0).getCommentCount());
    }
}
