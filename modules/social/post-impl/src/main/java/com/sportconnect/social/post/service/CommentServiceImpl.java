package com.sportconnect.social.post.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.social.post.access.PostGate;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import com.sportconnect.social.post.api.service.CommentService;
import com.sportconnect.social.post.entity.Comment;
import com.sportconnect.social.post.entity.CommentLike;
import com.sportconnect.social.post.repository.CommentLikeRepository;
import com.sportconnect.social.post.repository.CommentRepository;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.LongSupplier;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CommentServiceImpl implements CommentService {

    private static final RedisScript<Long> INCR_IF_EXISTS = RedisScript.of(
            "if redis.call('exists', KEYS[1]) == 1 then return redis.call('incr', KEYS[1]) end return nil",
            Long.class);

    private static final RedisScript<Long> DECR_IF_EXISTS = RedisScript.of(
            "if redis.call('exists', KEYS[1]) == 1 then return redis.call('decr', KEYS[1]) end return nil",
            Long.class);

    private final CommentRepository commentRepository;
    private final CommentLikeRepository commentLikeRepository;
    private final PostRepository postRepository;
    private final UserService userService;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;
    private final PostGate postGate;

    @Override
    @Transactional
    public CommentResponse createComment(Long postId, UUID userId, CreateCommentRequest request) {
        postGate.require(postRepository.findById(postId).orElse(null), userId,
                "Post not found", "You don't have access to this post");

        if (request.getParentCommentId() != null && !commentRepository.existsById(request.getParentCommentId())) {
            throw new NotFoundException("Parent comment not found");
        }

        Comment comment = Comment.builder()
                .postId(postId)
                .userId(userId)
                .content(request.getContent())
                .parentCommentId(request.getParentCommentId())
                .build();

        comment = commentRepository.save(comment);
        postRepository.updateLastInteractionAt(postId, LocalDateTime.now());

        if (request.getParentCommentId() == null) {
            stringRedisTemplate.execute(INCR_IF_EXISTS, List.of("post:" + postId + ":comments"));
            addToPreviewCache(postId, comment, userId);
        } else {
            stringRedisTemplate.execute(INCR_IF_EXISTS, List.of("comment:" + request.getParentCommentId() + ":replies"));
        }
        log.info("Created comment {} on post {}", comment.getId(), postId);

        return mapToResponse(comment, userId, userService.getUsersByIds(List.of(userId)), Map.of());
    }

    /**
     * {@inheritDoc}
     *
     * <p>Flow: fetches the root-comment page, then does exactly 2 more flat batched queries
     * regardless of page size — all direct replies for the whole page in one call
     * ({@code findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc}, grouped by parent id),
     * and all comment/reply authors in one cross-domain call ({@code UserService.getUsersByIds}).
     * Replaced a prior per-comment N+1 (a DB query + a cross-domain call per comment, repeated per
     * reply) — see A7 in {@code post-impl/docs/BACKLOG_MVP.md}.
     */
    @Override
    @Transactional(readOnly = true)
    public Page<CommentResponse> getPostComments(Long postId, UUID currentUserId, Pageable pageable) {
        postGate.require(postRepository.findById(postId).orElse(null), currentUserId,
                "Post not found", "You don't have access to this post");

        Page<Comment> rootCommentsPage = commentRepository
                .findByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(postId, pageable);

        List<Long> rootCommentIds = rootCommentsPage.getContent().stream()
                .map(Comment::getId)
                .collect(Collectors.toList());
        Map<Long, List<Comment>> repliesByParentId = rootCommentIds.isEmpty()
                ? Map.of()
                : commentRepository.findByParentCommentIdInAndIsActiveTrueOrderByCreatedAtAsc(rootCommentIds).stream()
                        .collect(Collectors.groupingBy(Comment::getParentCommentId));

        List<UUID> userIds = new ArrayList<>();
        for (Comment root : rootCommentsPage.getContent()) {
            userIds.add(root.getUserId());
        }
        for (List<Comment> replies : repliesByParentId.values()) {
            for (Comment reply : replies) {
                userIds.add(reply.getUserId());
            }
        }
        List<UUID> distinctUserIds = userIds.stream().distinct().collect(Collectors.toList());
        Map<UUID, UserResponse> usersById = distinctUserIds.isEmpty()
                ? Map.of()
                : userService.getUsersByIds(distinctUserIds);

        return rootCommentsPage.map(comment -> mapToResponse(comment, currentUserId, usersById, repliesByParentId));
    }

    @Override
    @Transactional
    public void deleteComment(Long commentId, UUID userId) {
        Comment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new NotFoundException("Comment not found"));

        if (!comment.getUserId().equals(userId)) {
            throw new BadRequestException("You can only delete your own comments");
        }

        comment.setIsActive(false);
        commentRepository.save(comment);

        if (comment.getParentCommentId() == null) {
            stringRedisTemplate.execute(DECR_IF_EXISTS, List.of("post:" + comment.getPostId() + ":comments"));
            stringRedisTemplate.delete("post:" + comment.getPostId() + ":comments:preview");
        } else {
            stringRedisTemplate.execute(DECR_IF_EXISTS, List.of("comment:" + comment.getParentCommentId() + ":replies"));
        }
        log.info("Deleted comment {}", commentId);
    }

    @Override
    @Transactional
    public void likeComment(Long commentId, UUID userId) {
        Comment comment = commentRepository.findByIdAndIsActiveTrue(commentId)
                .orElseThrow(() -> new NotFoundException("Comment not found"));
        postGate.require(postRepository.findById(comment.getPostId()).orElse(null), userId,
                "Post not found", "You don't have access to this post");

        if (commentLikeRepository.existsByCommentIdAndUserId(commentId, userId)) {
            throw new BadRequestException("You have already liked this comment");
        }

        CommentLike like = CommentLike.builder()
                .commentId(commentId)
                .userId(userId)
                .build();

        commentLikeRepository.save(like);
        stringRedisTemplate.execute(INCR_IF_EXISTS, List.of("comment:" + commentId + ":likes"));
        log.info("User {} liked comment {}", userId, commentId);
    }

    @Override
    @Transactional
    public void unlikeComment(Long commentId, UUID userId) {
        Comment comment = commentRepository.findByIdAndIsActiveTrue(commentId)
                .orElseThrow(() -> new NotFoundException("Comment not found"));
        postGate.require(postRepository.findById(comment.getPostId()).orElse(null), userId,
                "Post not found", "You don't have access to this post");

        if (!commentLikeRepository.existsByCommentIdAndUserId(commentId, userId)) {
            throw new BadRequestException("You have not liked this comment");
        }

        commentLikeRepository.deleteByCommentIdAndUserId(commentId, userId);
        stringRedisTemplate.execute(DECR_IF_EXISTS, List.of("comment:" + commentId + ":likes"));
        log.info("User {} unliked comment {}", userId, commentId);
    }

    private long getCount(String key, LongSupplier dbFallback) {
        String val = stringRedisTemplate.opsForValue().get(key);
        if (val != null) return Math.max(0L, Long.parseLong(val));
        long count = dbFallback.getAsLong();
        stringRedisTemplate.opsForValue().set(key, String.valueOf(count));
        return count;
    }

    private void addToPreviewCache(Long postId, Comment comment, UUID authorId) {
        try {
            CommentResponse preview = buildPreviewResponse(comment, authorId);
            String json = objectMapper.writeValueAsString(preview);
            double score = comment.getCreatedAt().toInstant(ZoneOffset.UTC).toEpochMilli();
            String key = "post:" + postId + ":comments:preview";
            stringRedisTemplate.opsForZSet().add(key, json, score);
            // keep only 3 most recent
            stringRedisTemplate.opsForZSet().removeRange(key, 0, -4);
        } catch (JsonProcessingException e) {
            log.warn("Failed to cache comment preview for post {}: {}", postId, e.getMessage());
        }
    }

    private String resolveUserFullName(UUID userId) {
        try {
            return userService.getUserById(userId).getFullName();
        } catch (ResourceNotFoundException e) {
            return "Unknown User";
        }
    }

    private CommentResponse buildPreviewResponse(Comment comment, UUID authorId) {
        String userFullName = resolveUserFullName(comment.getUserId());
        long likeCount = getCount("comment:" + comment.getId() + ":likes",
                () -> commentLikeRepository.countByCommentId(comment.getId()));
        return CommentResponse.builder()
                .id(comment.getId())
                .postId(comment.getPostId())
                .userId(comment.getUserId())
                .userFullName(userFullName)
                .content(comment.getContent())
                .parentCommentId(null)
                .likeCount(likeCount)
                .replyCount(0L)
                .isLikedByCurrentUser(false)
                .replies(Collections.emptyList())
                .createdAt(comment.getCreatedAt())
                .updatedAt(comment.getUpdatedAt())
                .build();
    }

    /**
     * Pure mapper — no DB/cross-domain calls for author or replies (both pre-resolved by the
     * caller). Still recurses into {@code replies}, but over the in-memory {@code repliesByParentId}
     * map, not a fresh query per level. Recursion is naturally bounded to one level: A4 enforces
     * that a reply can never itself be replied to, so {@code repliesByParentId.get(replyId)} is
     * always empty for a reply. {@code likeCount}/{@code replyCount} still read through the
     * Redis-first {@code getCount()} cache; {@code isLikedByCurrentUser} is still a direct per-item
     * DB point lookup — both deliberate, out of scope for the batching fix (see A6/A7 in
     * {@code post-impl/docs/BACKLOG_MVP.md}).
     */
    private CommentResponse mapToResponse(Comment comment, UUID currentUserId,
                                           Map<UUID, UserResponse> usersById,
                                           Map<Long, List<Comment>> repliesByParentId) {
        long likeCount = getCount("comment:" + comment.getId() + ":likes", () -> commentLikeRepository.countByCommentId(comment.getId()));
        long replyCount = getCount("comment:" + comment.getId() + ":replies", () -> commentRepository.countByParentCommentIdAndIsActiveTrue(comment.getId()));
        boolean isLiked = currentUserId != null &&
                         commentLikeRepository.existsByCommentIdAndUserId(comment.getId(), currentUserId);

        UserResponse user = usersById.get(comment.getUserId());
        String userFullName = user != null ? user.getFullName() : "Unknown User";

        List<CommentResponse> replies = repliesByParentId.getOrDefault(comment.getId(), List.of())
                .stream()
                .map(reply -> mapToResponse(reply, currentUserId, usersById, repliesByParentId))
                .collect(Collectors.toList());

        return CommentResponse.builder()
                .id(comment.getId())
                .postId(comment.getPostId())
                .userId(comment.getUserId())
                .userFullName(userFullName)
                .content(comment.getContent())
                .parentCommentId(comment.getParentCommentId())
                .likeCount(likeCount)
                .replyCount(replyCount)
                .isLikedByCurrentUser(isLiked)
                .replies(replies)
                .createdAt(comment.getCreatedAt())
                .updatedAt(comment.getUpdatedAt())
                .build();
    }
}
