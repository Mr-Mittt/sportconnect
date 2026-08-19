package com.sportconnect.social.post.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.social.post.access.PostGate;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CommentType;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.api.dto.SystemSessionCommentRequest;
import com.sportconnect.social.post.api.service.CommentService;
import com.sportconnect.social.post.entity.Comment;
import com.sportconnect.social.post.entity.CommentLike;
import com.sportconnect.social.post.entity.Post;
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
        return doCreateComment(postId, userId, request);
    }

    @Override
    @Transactional
    public CommentResponse createSessionComment(Long postId, UUID userId, CreateCommentRequest request) {
        requireSessionPost(postId);
        return doCreateComment(postId, userId, request);
    }

    private CommentResponse doCreateComment(Long postId, UUID userId, CreateCommentRequest request) {
        if (request.getParentCommentId() != null) {
            // SESSION-21: fetches the parent rather than the cheaper existsById it replaced,
            // because the reply guard below needs its commentType. Still one query either way.
            Comment parent = commentRepository.findById(request.getParentCommentId())
                    .orElseThrow(() -> new NotFoundException("Parent comment not found"));
            if (parent.getCommentType() != CommentType.USER) {
                throw new BadRequestException("System comments cannot be replied to");
            }
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

    /** SESSION-10/A17 bypass precheck — existence/active AND {@code postType == SESSION_POST}, no
     * {@code PostGate} call. The type check matters on its own: without it, a caller of these
     * bypass methods (always {@code SessionServiceImpl}, after it has already done its own
     * authorization for the session in question) could act on any active post's comments, not
     * just a session's anchor. */
    private void requireSessionPost(Long postId) {
        Post post = postRepository.findByIdAndIsActiveTrue(postId).orElse(null);
        if (post == null || post.getPostType() != PostType.SESSION_POST) {
            throw new NotFoundException("Post not found");
        }
    }

    /**
     * Batch form of {@link #requireSessionPost} — one query for every id, all-or-nothing. Compares
     * the {@code SESSION_POST} match count against the *distinct* id count, so a missing id, a
     * soft-deleted one, and a wrong-{@code postType} one all fail identically.
     */
    private void requireSessionPosts(List<Long> distinctPostIds) {
        long sessionPosts = postRepository.findByIdInAndIsActiveTrue(distinctPostIds).stream()
                .filter(post -> post.getPostType() == PostType.SESSION_POST)
                .count();
        if (sessionPosts != distinctPostIds.size()) {
            throw new NotFoundException("Post not found");
        }
    }

    /**
     * SESSION-21 — a system entry is a record of something that happened, not content, so it is
     * never likeable, repliable, or deletable. Unconditional, exactly like {@code PostServiceImpl}'s
     * {@code GROUP_SYSTEM} guards (B9): not even the session creator who nominally authored it.
     */
    private void requireUserComment(Comment comment, String action) {
        if (comment.getCommentType() != CommentType.USER) {
            throw new BadRequestException("System comments cannot be " + action);
        }
    }

    @Override
    @Transactional
    public void createSystemSessionComment(Long postId, UUID authorUserId, String content) {
        createSystemSessionComments(List.of(SystemSessionCommentRequest.builder()
                .postId(postId)
                .authorUserId(authorUserId)
                .content(content)
                .build()));
    }

    /**
     * {@inheritDoc}
     *
     * <p>Deliberately leaner than {@link #doCreateComment} — the same way {@code createSystemPost}
     * is leaner than {@code createPost} (B9). Two omissions, both intentional:
     * <ul>
     *   <li><b>No preview-cache write.</b> {@code addToPreviewCache} resolves the author through a
     *       per-call {@code userService.getUserById} — a cross-domain call per row, which in a
     *       200-session batch is exactly the N+1 this batch method exists to avoid — and the cache
     *       is only ever read by feed surfaces that a {@code SESSION_POST} can't reach anyway
     *       ({@code PostGate} makes it unconditionally unavailable).</li>
     *   <li><b>No {@code updateLastInteractionAt}.</b> Nothing orders a {@code SESSION_POST} by it,
     *       for the same reason, and it would be one UPDATE per session in the batch.</li>
     * </ul>
     * The Redis comment-count increment, by contrast, is <b>not</b> optional: that key's DB
     * fallback ({@code countByPostIdAndIsActiveTrue}, {@code PostServiceImpl}) counts system rows
     * too, so skipping it would make the cached count differ from the uncached one depending only
     * on whether the key happened to be warm.
     */
    @Override
    @Transactional
    public void createSystemSessionComments(List<SystemSessionCommentRequest> requests) {
        if (requests.isEmpty()) {
            return;
        }

        List<Long> distinctPostIds = requests.stream()
                .map(SystemSessionCommentRequest::getPostId)
                .distinct()
                .collect(Collectors.toList());
        requireSessionPosts(distinctPostIds);

        List<Comment> comments = requests.stream()
                .map(request -> Comment.builder()
                        .postId(request.getPostId())
                        .userId(request.getAuthorUserId())
                        .content(request.getContent())
                        .commentType(CommentType.SESSION_SYSTEM)
                        .build())
                .collect(Collectors.toList());
        commentRepository.saveAll(comments);

        // One increment per row written, not per distinct post — two entries on the same session
        // (a join and a leave in the same batch) must move the count by two.
        for (Comment comment : comments) {
            stringRedisTemplate.execute(INCR_IF_EXISTS, List.of("post:" + comment.getPostId() + ":comments"));
        }
        log.info("Created {} SESSION_SYSTEM comment(s) across {} session post(s)",
                comments.size(), distinctPostIds.size());
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
        return doGetPostComments(postId, currentUserId, pageable);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<CommentResponse> getSessionPostComments(Long postId, UUID currentUserId, Pageable pageable) {
        requireSessionPost(postId);
        return doGetPostComments(postId, currentUserId, pageable);
    }

    private Page<CommentResponse> doGetPostComments(Long postId, UUID currentUserId, Pageable pageable) {
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

        // SESSION-21: before the ownership check, not after — the nominal author of a system entry
        // is the session's creator, who would otherwise pass the check below and be able to delete
        // "X left the session" from their own thread.
        requireUserComment(comment, "deleted");

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
        doLikeComment(comment, userId);
    }

    @Override
    @Transactional
    public void likeSessionComment(Long postId, Long commentId, UUID userId) {
        Comment comment = commentRepository.findByIdAndIsActiveTrue(commentId)
                .orElseThrow(() -> new NotFoundException("Comment not found"));
        if (!comment.getPostId().equals(postId)) {
            throw new NotFoundException("Comment not found");
        }
        requireSessionPost(postId);
        doLikeComment(comment, userId);
    }

    /**
     * SESSION-21 changed this to take the already-loaded {@code Comment} rather than its id, so the
     * system-entry guard lives in one place across all four entry points (public/session ×
     * like/unlike) without re-fetching a row every caller already has.
     */
    private void doLikeComment(Comment comment, UUID userId) {
        requireUserComment(comment, "liked");
        Long commentId = comment.getId();
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
        doUnlikeComment(comment, userId);
    }

    @Override
    @Transactional
    public void unlikeSessionComment(Long postId, Long commentId, UUID userId) {
        Comment comment = commentRepository.findByIdAndIsActiveTrue(commentId)
                .orElseThrow(() -> new NotFoundException("Comment not found"));
        if (!comment.getPostId().equals(postId)) {
            throw new NotFoundException("Comment not found");
        }
        requireSessionPost(postId);
        doUnlikeComment(comment, userId);
    }

    /** Same entity-not-id rationale as {@link #doLikeComment}. */
    private void doUnlikeComment(Comment comment, UUID userId) {
        requireUserComment(comment, "liked");
        Long commentId = comment.getId();
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
                .commentType(comment.getCommentType())
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
                .commentType(comment.getCommentType())
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
