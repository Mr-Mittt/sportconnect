package com.sportconnect.social.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.social.api.dto.CreatePostRequest;
import com.sportconnect.social.api.dto.PostMediaResponse;
import com.sportconnect.social.api.dto.PostResponse;
import com.sportconnect.social.api.service.PostService;
import com.sportconnect.social.entity.Post;
import com.sportconnect.social.entity.PostLike;
import com.sportconnect.social.entity.PostMedia;
import com.sportconnect.social.repository.CommentRepository;
import com.sportconnect.social.repository.PostLikeRepository;
import com.sportconnect.social.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PostServiceImpl implements PostService {

    private final PostRepository postRepository;
    private final PostLikeRepository postLikeRepository;
    private final CommentRepository commentRepository;
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

    @Override
    @Transactional
    public PostResponse createPost(UUID userId, CreatePostRequest request) {
        Post post = Post.builder()
                .userId(userId)
                .content(request.getContent())
                .locationName(request.getLocationName())
                .sportId(request.getSportId())
                .visibility(request.getVisibility() != null ? request.getVisibility() : "public")
                .build();

        if (request.getLatitude() != null && request.getLongitude() != null) {
            Point location = geometryFactory.createPoint(
                    new Coordinate(request.getLongitude(), request.getLatitude())
            );
            post.setLocation(location);
        }

        if (request.getMediaUrls() != null && !request.getMediaUrls().isEmpty()) {
            int order = 0;
            for (String mediaUrl : request.getMediaUrls()) {
                PostMedia media = PostMedia.builder()
                        .mediaUrl(mediaUrl)
                        .mediaType(mediaUrl.contains("video") ? "video" : "image")
                        .displayOrder(order++)
                        .build();
                post.addMedia(media);
            }
        }

        post = postRepository.save(post);
        log.info("Created post {} for user {}", post.getId(), userId);

        return mapToResponse(post, userId);
    }

    @Override
    @Transactional(readOnly = true)
    public PostResponse getPostById(Long postId, UUID currentUserId) {
        Post post = postRepository.findByIdAndIsActiveTrue(postId)
                .orElseThrow(() -> new NotFoundException("Post not found"));
        return mapToResponse(post, currentUserId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PostResponse> getUserPosts(UUID userId, UUID currentUserId, Pageable pageable) {
        return postRepository.findByUserIdAndIsActiveTrue(userId, pageable)
                .map(post -> mapToResponse(post, currentUserId));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PostResponse> getPublicFeed(UUID currentUserId, Pageable pageable) {
        return postRepository.findPublicPosts(pageable)
                .map(post -> mapToResponse(post, currentUserId));
    }

    @Override
    @Transactional
    public PostResponse updatePost(Long postId, UUID userId, CreatePostRequest request) {
        Post post = postRepository.findByIdAndIsActiveTrue(postId)
                .orElseThrow(() -> new NotFoundException("Post not found"));

        if (!post.getUserId().equals(userId)) {
            throw new BadRequestException("You can only update your own posts");
        }

        post.setContent(request.getContent());
        post.setLocationName(request.getLocationName());
        post.setSportId(request.getSportId());

        if (request.getVisibility() != null) {
            post.setVisibility(request.getVisibility());
        }

        post = postRepository.save(post);
        log.info("Updated post {}", postId);

        return mapToResponse(post, userId);
    }

    @Override
    @Transactional
    public void deletePost(Long postId, UUID userId) {
        Post post = postRepository.findByIdAndIsActiveTrue(postId)
                .orElseThrow(() -> new NotFoundException("Post not found"));

        if (!post.getUserId().equals(userId)) {
            throw new BadRequestException("You can only delete your own posts");
        }

        post.setIsActive(false);
        postRepository.save(post);
        log.info("Deleted post {}", postId);
    }

    @Override
    @Transactional
    public void likePost(Long postId, UUID userId) {
        if (!postRepository.existsById(postId)) {
            throw new NotFoundException("Post not found");
        }

        if (postLikeRepository.existsByPostIdAndUserId(postId, userId)) {
            throw new BadRequestException("You have already liked this post");
        }

        PostLike like = PostLike.builder()
                .postId(postId)
                .userId(userId)
                .build();

        postLikeRepository.save(like);
        log.info("User {} liked post {}", userId, postId);
    }

    @Override
    @Transactional
    public void unlikePost(Long postId, UUID userId) {
        if (!postLikeRepository.existsByPostIdAndUserId(postId, userId)) {
            throw new BadRequestException("You have not liked this post");
        }

        postLikeRepository.deleteByPostIdAndUserId(postId, userId);
        log.info("User {} unliked post {}", userId, postId);
    }

    private PostResponse mapToResponse(Post post, UUID currentUserId) {
        List<PostMediaResponse> mediaResponses = post.getMedia().stream()
                .map(media -> PostMediaResponse.builder()
                        .id(media.getId())
                        .mediaType(media.getMediaType())
                        .mediaUrl(media.getMediaUrl())
                        .thumbnailUrl(media.getThumbnailUrl())
                        .displayOrder(media.getDisplayOrder())
                        .build())
                .collect(Collectors.toList());

        long likeCount = postLikeRepository.countByPostId(post.getId());
        long commentCount = commentRepository.countByPostIdAndIsActiveTrue(post.getId());
        boolean isLiked = currentUserId != null && 
                         postLikeRepository.existsByPostIdAndUserId(post.getId(), currentUserId);

        Double latitude = null;
        Double longitude = null;
        if (post.getLocation() != null) {
            latitude = post.getLocation().getY();
            longitude = post.getLocation().getX();
        }

        return PostResponse.builder()
                .id(post.getId())
                .userId(post.getUserId())
                .content(post.getContent())
                .latitude(latitude)
                .longitude(longitude)
                .locationName(post.getLocationName())
                .sportId(post.getSportId())
                .visibility(post.getVisibility())
                .media(mediaResponses)
                .likeCount(likeCount)
                .commentCount(commentCount)
                .isLikedByCurrentUser(isLiked)
                .createdAt(post.getCreatedAt())
                .updatedAt(post.getUpdatedAt())
                .build();
    }
}
