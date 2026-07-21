package com.sportconnect.social.post.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreatePostRequest;
import com.sportconnect.social.post.api.dto.PostMediaResponse;
import com.sportconnect.social.post.api.dto.PostResponse;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.api.service.HashtagService;
import com.sportconnect.social.post.api.service.PostService;
import com.sportconnect.social.post.entity.Comment;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.entity.PostLike;
import com.sportconnect.social.post.entity.PostMedia;
import com.sportconnect.social.post.repository.CommentRepository;
import com.sportconnect.social.post.repository.PostHashtagRepository;
import com.sportconnect.social.post.repository.PostLikeRepository;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserFriendService;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.locationtech.jts.geom.Coordinate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.LongSupplier;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class PostServiceImpl implements PostService {

    private static final RedisScript<Long> INCR_IF_EXISTS = RedisScript.of(
            "if redis.call('exists', KEYS[1]) == 1 then return redis.call('incr', KEYS[1]) end return nil",
            Long.class);

    private static final RedisScript<Long> DECR_IF_EXISTS = RedisScript.of(
            "if redis.call('exists', KEYS[1]) == 1 then return redis.call('decr', KEYS[1]) end return nil",
            Long.class);

    private final PostRepository postRepository;
    private final PostLikeRepository postLikeRepository;
    private final CommentRepository commentRepository;
    private final PostHashtagRepository postHashtagRepository;
    private final GroupService groupService;
    private final UserFriendService userFriendService;
    private final UserService userService;
    private final SportService sportService;
    private final HashtagService hashtagService;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

    @Override
    @Transactional
    public PostResponse createPost(UUID userId, CreatePostRequest request) {
        PostType postType = request.getPostType() != null ? request.getPostType() : PostType.USER_FEED;
        Long groupId = request.getGroupId();

        if (postType == PostType.GROUP_SYSTEM) {
            throw new BadRequestException("GROUP_SYSTEM posts cannot be created directly");
        }
        if (postType == PostType.USER_FEED && groupId != null) {
            throw new BadRequestException("USER_FEED posts cannot be associated with a group");
        }
        if ((postType == PostType.GROUP_POST || postType == PostType.GROUP_BROADCAST) && groupId == null) {
            throw new BadRequestException("Group posts require a groupId");
        }
        if (postType == PostType.GROUP_POST && !groupService.isGroupMember(groupId, userId)) {
            throw new BadRequestException("You must be a group member to post in this group");
        }
        if (postType == PostType.GROUP_BROADCAST
                && !groupService.isGroupOwner(groupId, userId)
                && !groupService.isGroupAdmin(groupId, userId)) {
            throw new BadRequestException("Only group owners and admins can create broadcast posts");
        }

        LocalDateTime broadcastEndTime = null;
        if (postType == PostType.GROUP_BROADCAST) {
            if (postRepository.existsActiveGroupBroadcast(groupId)) {
                throw new BadRequestException("This group already has an active broadcast");
            }
            LocalDateTime now = LocalDateTime.now();
            broadcastEndTime = request.getBroadcastEndTime() != null
                    ? request.getBroadcastEndTime()
                    : now.plusHours(24);
            if (!broadcastEndTime.isAfter(now)) {
                throw new BadRequestException("broadcastEndTime must be in the future");
            }
        }

        Post post = Post.builder()
                .userId(userId)
                .groupId(groupId)
                .postType(postType)
                .content(request.getContent())
                .locationName(request.getLocationName())
                .sportId(request.getSportId())
                .visibility(request.getVisibility() != null ? request.getVisibility() : "public")
                .broadcastEndTime(broadcastEndTime)
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
        hashtagService.extractAndSaveHashtags(post.getId(), request.getContent());
        log.info("Created post {} for user {}", post.getId(), userId);

        List<Post> single = List.of(post);
        return mapToResponse(post, userId, hashtagService.getTagsForPost(post.getId()),
                getUsersForPosts(single), getSportsForPosts(single));
    }

    @Override
    @Transactional
    public void createSystemPost(Long groupId, UUID authorUserId, String content) {
        Post post = Post.builder()
                .userId(authorUserId)
                .groupId(groupId)
                .postType(PostType.GROUP_SYSTEM)
                .content(content)
                .visibility("public")
                .build();
        postRepository.save(post);
        log.info("Created GROUP_SYSTEM post for group {} authored by {}", groupId, authorUserId);
    }

    @Override
    @Transactional(readOnly = true)
    public PostResponse getPostById(Long postId, UUID currentUserId) {
        Post post = postRepository.findByIdAndIsActiveTrue(postId)
                .orElseThrow(() -> new NotFoundException("Post not found"));
        List<Post> single = List.of(post);
        return mapToResponse(post, currentUserId, hashtagService.getTagsForPost(post.getId()),
                getUsersForPosts(single), getSportsForPosts(single));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, PostResponse> getPostsByIds(List<Long> postIds, UUID currentUserId) {
        if (postIds.isEmpty()) {
            return Map.of();
        }
        List<Post> posts = postRepository.findByIdInAndIsActiveTrue(postIds);
        Map<Long, List<String>> hashtagsByPostId = getHashtagsForPosts(posts);
        Map<UUID, UserResponse> usersById = getUsersForPosts(posts);
        Map<Long, SportResponse> sportsById = getSportsForPosts(posts);
        return posts.stream().collect(Collectors.toMap(
                Post::getId,
                post -> mapToResponse(post, currentUserId, hashtagsByPostId.getOrDefault(post.getId(), List.of()),
                        usersById, sportsById)));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PostResponse> getUserPosts(UUID userId, UUID currentUserId, Pageable pageable) {
        Page<Post> postsPage = postRepository.findByUserIdAndIsActiveTrue(userId, pageable);
        Map<Long, List<String>> hashtagsByPostId = getHashtagsForPosts(postsPage.getContent());
        Map<UUID, UserResponse> usersById = getUsersForPosts(postsPage.getContent());
        Map<Long, SportResponse> sportsById = getSportsForPosts(postsPage.getContent());
        return postsPage.map(post -> mapToResponse(post, currentUserId,
                hashtagsByPostId.getOrDefault(post.getId(), List.of()), usersById, sportsById));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PostResponse> getPersonalizedFeed(UUID callerId, Pageable pageable) {
        List<UUID> friendIds = userFriendService.getAcceptedFriendIds(callerId);
        List<Long> groupIds = groupService.getGroupIdsBySportProfiles(callerId);

        // JPQL IN() with empty collections is invalid — use sentinel values that match nothing
        List<UUID> safeFriendIds = friendIds.isEmpty() ? List.of(new UUID(0, 0)) : friendIds;
        List<Long> safeGroupIds = groupIds.isEmpty() ? List.of(-1L) : groupIds;

        Page<Post> postsPage = postRepository.findPersonalizedFeed(callerId, safeFriendIds, safeGroupIds, pageable);
        Map<Long, List<String>> hashtagsByPostId = getHashtagsForPosts(postsPage.getContent());
        Map<UUID, UserResponse> usersById = getUsersForPosts(postsPage.getContent());
        Map<Long, SportResponse> sportsById = getSportsForPosts(postsPage.getContent());
        return postsPage.map(post -> mapToResponse(post, callerId,
                hashtagsByPostId.getOrDefault(post.getId(), List.of()), usersById, sportsById));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PostResponse> getGroupPosts(Long groupId, UUID currentUserId, Pageable pageable) {
        if (currentUserId == null || !groupService.isGroupMember(groupId, currentUserId)) {
            throw new ForbiddenException("You must be a group member to view posts");
        }
        Page<Post> postsPage = postRepository.findByGroupIdAndIsActiveTrue(groupId, pageable);
        Map<Long, List<String>> hashtagsByPostId = getHashtagsForPosts(postsPage.getContent());
        Map<UUID, UserResponse> usersById = getUsersForPosts(postsPage.getContent());
        Map<Long, SportResponse> sportsById = getSportsForPosts(postsPage.getContent());
        return postsPage.map(post -> mapToResponse(post, currentUserId,
                hashtagsByPostId.getOrDefault(post.getId(), List.of()), usersById, sportsById));
    }

    @Override
    @Transactional
    public PostResponse updatePost(Long postId, UUID userId, CreatePostRequest request) {
        Post post = postRepository.findByIdAndIsActiveTrue(postId)
                .orElseThrow(() -> new NotFoundException("Post not found"));

        if (post.getPostType() == PostType.GROUP_SYSTEM) {
            throw new BadRequestException("GROUP_SYSTEM posts cannot be edited");
        }

        boolean isCreator = post.getUserId().equals(userId);
        boolean isBroadcastModerator = post.getPostType() == PostType.GROUP_BROADCAST
                && post.getGroupId() != null
                && (groupService.isGroupOwner(post.getGroupId(), userId) ||
                    groupService.isGroupAdmin(post.getGroupId(), userId));

        if (!isCreator && !isBroadcastModerator) {
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

        List<Post> single = List.of(post);
        return mapToResponse(post, userId, hashtagService.getTagsForPost(post.getId()),
                getUsersForPosts(single), getSportsForPosts(single));
    }

    @Override
    @Transactional
    public void deletePost(Long postId, UUID userId) {
        Post post = postRepository.findByIdAndIsActiveTrue(postId)
                .orElseThrow(() -> new NotFoundException("Post not found"));

        if (post.getPostType() == PostType.GROUP_SYSTEM) {
            throw new BadRequestException("GROUP_SYSTEM posts cannot be deleted");
        }

        boolean isOwner = post.getUserId().equals(userId);
        boolean isGroupModerator = post.getGroupId() != null &&
                (groupService.isGroupOwner(post.getGroupId(), userId) ||
                 groupService.isGroupAdmin(post.getGroupId(), userId));

        if (!isOwner && !isGroupModerator) {
            throw new BadRequestException("You do not have permission to delete this post");
        }

        hashtagService.decrementHashtagsForPost(postId);
        post.setIsActive(false);
        postRepository.save(post);
        stringRedisTemplate.delete("post:" + postId + ":comments:preview");
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
        stringRedisTemplate.execute(INCR_IF_EXISTS, List.of("post:" + postId + ":likes"));
        log.info("User {} liked post {}", userId, postId);
    }

    @Override
    @Transactional
    public void unlikePost(Long postId, UUID userId) {
        if (!postLikeRepository.existsByPostIdAndUserId(postId, userId)) {
            throw new BadRequestException("You have not liked this post");
        }

        postLikeRepository.deleteByPostIdAndUserId(postId, userId);
        stringRedisTemplate.execute(DECR_IF_EXISTS, List.of("post:" + postId + ":likes"));
        log.info("User {} unliked post {}", userId, postId);
    }

    private List<CommentResponse> getPreviewComments(Long postId) {
        String key = "post:" + postId + ":comments:preview";
        Set<String> cached = stringRedisTemplate.opsForZSet().reverseRange(key, 0, 2);
        if (cached != null && !cached.isEmpty()) {
            List<CommentResponse> result = new ArrayList<>();
            for (String json : cached) {
                try {
                    result.add(objectMapper.readValue(json, CommentResponse.class));
                } catch (JsonProcessingException e) {
                    log.warn("Failed to deserialize preview comment for post {}: {}", postId, e.getMessage());
                }
            }
            return result;
        }
        // cache miss — load from DB and populate Redis
        List<Comment> top3 = commentRepository
                .findTop3ByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(postId);
        for (Comment c : top3) {
            try {
                CommentResponse preview = CommentResponse.builder()
                        .id(c.getId())
                        .postId(c.getPostId())
                        .userId(c.getUserId())
                        .content(c.getContent())
                        .parentCommentId(null)
                        .likeCount(getCount("comment:" + c.getId() + ":likes",
                                () -> 0L))
                        .replyCount(0L)
                        .isLikedByCurrentUser(false)
                        .replies(Collections.emptyList())
                        .createdAt(c.getCreatedAt())
                        .updatedAt(c.getUpdatedAt())
                        .build();
                double score = c.getCreatedAt().toInstant(ZoneOffset.UTC).toEpochMilli();
                stringRedisTemplate.opsForZSet().add(key, objectMapper.writeValueAsString(preview), score);
            } catch (JsonProcessingException e) {
                log.warn("Failed to populate preview cache for post {}: {}", postId, e.getMessage());
            }
        }
        return top3.stream()
                .map(c -> CommentResponse.builder()
                        .id(c.getId())
                        .postId(c.getPostId())
                        .userId(c.getUserId())
                        .content(c.getContent())
                        .parentCommentId(null)
                        .likeCount(getCount("comment:" + c.getId() + ":likes", () -> 0L))
                        .replyCount(0L)
                        .isLikedByCurrentUser(false)
                        .replies(Collections.emptyList())
                        .createdAt(c.getCreatedAt())
                        .updatedAt(c.getUpdatedAt())
                        .build())
                .collect(Collectors.toList());
    }

    private long getCount(String key, LongSupplier dbFallback) {
        String val = stringRedisTemplate.opsForValue().get(key);
        if (val != null) return Math.max(0L, Long.parseLong(val));
        long count = dbFallback.getAsLong();
        stringRedisTemplate.opsForValue().set(key, String.valueOf(count));
        return count;
    }

    /**
     * Shared by every {@code mapToResponse} call site (paginated and single-item alike) to batch
     * the per-post hashtag lookup into one query per page/batch instead of one per post (was the
     * N+1 fixed in A6 — see {@code post-impl/docs/BACKLOG_MVP.md}). Single-item call sites pass a
     * singleton {@code List.of(post)} rather than maintaining a separate unbatched code path.
     */
    private Map<Long, List<String>> getHashtagsForPosts(List<Post> posts) {
        List<Long> postIds = posts.stream()
                .map(Post::getId)
                .distinct()
                .collect(Collectors.toList());
        return postIds.isEmpty() ? Map.of() : hashtagService.getTagsForPosts(postIds);
    }

    /**
     * Batches the cross-domain author lookup for a page/batch of posts (A9 — see
     * {@code post-impl/docs/BACKLOG_MVP.md}). Same shape as {@code getHashtagsForPosts} and the
     * exact convention {@code CommentServiceImpl.mapToResponse} already established: even
     * single-item call sites route through this (with a singleton list) rather than calling
     * {@code userService.getUserById} directly, so there's one code path, not two.
     */
    private Map<UUID, UserResponse> getUsersForPosts(List<Post> posts) {
        List<UUID> userIds = posts.stream()
                .map(Post::getUserId)
                .distinct()
                .collect(Collectors.toList());
        return userIds.isEmpty() ? Map.of() : userService.getUsersByIds(userIds);
    }

    /**
     * Batches the cross-domain sport-name lookup for a page/batch of posts (A9). {@code sportId}
     * is optional on a post (null for USER_FEED posts with no sport tagged), so nulls are filtered
     * out before the batch call rather than passed through.
     */
    private Map<Long, SportResponse> getSportsForPosts(List<Post> posts) {
        List<Long> sportIds = posts.stream()
                .map(Post::getSportId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        return sportIds.isEmpty() ? Map.of() : sportService.getSportsByIds(sportIds);
    }

    /**
     * Pure mapper — no DB/cross-domain calls for author or sport name (both pre-resolved by the
     * caller via {@code getUsersForPosts}/{@code getSportsForPosts}). {@code userFullName} falls
     * back to {@code "Unknown User"} if the author isn't found (e.g. a hard-deleted account — same
     * fallback {@code CommentServiceImpl.mapToResponse} uses, kept consistent across both mappers).
     * {@code sportName} is null if the post has no {@code sportId}, or if the id doesn't resolve to
     * a known sport. {@code shareCount} is hardcoded to 0 — post-sharing itself is unimplemented
     * (deferred to V1's C6); this only fixes the field being null instead of a real count.
     */
    private PostResponse mapToResponse(Post post, UUID currentUserId, List<String> hashtags,
                                        Map<UUID, UserResponse> usersById, Map<Long, SportResponse> sportsById) {
        List<PostMediaResponse> mediaResponses = post.getMedia().stream()
                .map(media -> PostMediaResponse.builder()
                        .id(media.getId())
                        .mediaType(media.getMediaType())
                        .mediaUrl(media.getMediaUrl())
                        .thumbnailUrl(media.getThumbnailUrl())
                        .displayOrder(media.getDisplayOrder())
                        .build())
                .collect(Collectors.toList());

        long likeCount = getCount("post:" + post.getId() + ":likes", () -> postLikeRepository.countByPostId(post.getId()));
        long commentCount = getCount("post:" + post.getId() + ":comments", () -> commentRepository.countByPostIdAndIsActiveTrue(post.getId()));
        boolean isLiked = currentUserId != null &&
                         postLikeRepository.existsByPostIdAndUserId(post.getId(), currentUserId);

        Double latitude = null;
        Double longitude = null;
        if (post.getLocation() != null) {
            latitude = post.getLocation().getY();
            longitude = post.getLocation().getX();
        }

        UserResponse author = usersById.get(post.getUserId());
        String userFullName = author != null ? author.getFullName() : "Unknown User";
        String userAvatarUrl = author != null ? author.getAvatarUrl() : null;

        SportResponse sport = post.getSportId() != null ? sportsById.get(post.getSportId()) : null;
        String sportName = sport != null ? sport.getName() : null;

        return PostResponse.builder()
                .id(post.getId())
                .userId(post.getUserId())
                .userFullName(userFullName)
                .userAvatarUrl(userAvatarUrl)
                .postType(post.getPostType())
                .groupId(post.getGroupId())
                .content(post.getContent())
                .latitude(latitude)
                .longitude(longitude)
                .locationName(post.getLocationName())
                .sportId(post.getSportId())
                .sportName(sportName)
                .visibility(post.getVisibility())
                .media(mediaResponses)
                .hashtags(hashtags)
                .previewComments(getPreviewComments(post.getId()))
                .likeCount(likeCount)
                .commentCount(commentCount)
                .shareCount(0L)
                .isLikedByCurrentUser(isLiked)
                .createdAt(post.getCreatedAt())
                .updatedAt(post.getUpdatedAt())
                .broadcastEndTime(post.getBroadcastEndTime())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PostResponse> getPostsByHashtag(String tag, UUID currentUserId, Pageable pageable) {
        String normalizedTag = tag.toLowerCase().trim();
        List<Long> memberGroupIds = currentUserId != null
                ? groupService.getGroupIdsForMember(currentUserId)
                : List.of();
        List<Long> safeGroupIds = memberGroupIds.isEmpty() ? List.of(-1L) : memberGroupIds;
        Page<Post> postsPage = postHashtagRepository.findPostsByHashtag(normalizedTag, safeGroupIds, pageable);
        Map<Long, List<String>> hashtagsByPostId = getHashtagsForPosts(postsPage.getContent());
        Map<UUID, UserResponse> usersById = getUsersForPosts(postsPage.getContent());
        Map<Long, SportResponse> sportsById = getSportsForPosts(postsPage.getContent());
        return postsPage.map(post -> mapToResponse(post, currentUserId,
                hashtagsByPostId.getOrDefault(post.getId(), List.of()), usersById, sportsById));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<PostResponse> getActiveBroadcasts(UUID callerId, Pageable pageable) {
        List<Long> groupIds = groupService.getGroupIdsBySportProfiles(callerId);
        List<Long> safeGroupIds = groupIds.isEmpty() ? List.of(-1L) : groupIds;
        Page<Post> postsPage = postRepository.findActiveBroadcasts(safeGroupIds, pageable);
        Map<Long, List<String>> hashtagsByPostId = getHashtagsForPosts(postsPage.getContent());
        Map<UUID, UserResponse> usersById = getUsersForPosts(postsPage.getContent());
        Map<Long, SportResponse> sportsById = getSportsForPosts(postsPage.getContent());
        return postsPage.map(post -> mapToResponse(post, callerId,
                hashtagsByPostId.getOrDefault(post.getId(), List.of()), usersById, sportsById));
    }

    @Override
    @Transactional
    public PostResponse updateBroadcastEndTime(Long postId, UUID callerId, LocalDateTime newEndTime) {
        Post post = postRepository.findByIdAndIsActiveTrue(postId)
                .orElseThrow(() -> new NotFoundException("Post not found"));

        if (post.getPostType() != PostType.GROUP_BROADCAST) {
            throw new BadRequestException("Only GROUP_BROADCAST posts have an end time");
        }

        boolean isModerator = post.getGroupId() != null &&
                (groupService.isGroupOwner(post.getGroupId(), callerId) ||
                 groupService.isGroupAdmin(post.getGroupId(), callerId));
        if (!isModerator) {
            throw new BadRequestException("Only group owners and admins can extend a broadcast");
        }

        if (!newEndTime.isAfter(LocalDateTime.now())) {
            throw new BadRequestException("broadcastEndTime must be in the future");
        }

        post.setBroadcastEndTime(newEndTime);
        post = postRepository.save(post);
        log.info("Updated broadcast end time for post {}", postId);

        List<Post> single = List.of(post);
        return mapToResponse(post, callerId, hashtagService.getTagsForPost(post.getId()),
                getUsersForPosts(single), getSportsForPosts(single));
    }
}
