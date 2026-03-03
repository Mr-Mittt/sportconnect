package com.sportconnect.social.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.social.api.dto.CommentResponse;
import com.sportconnect.social.api.dto.CreateCommentRequest;
import com.sportconnect.social.api.service.CommentService;
import com.sportconnect.social.entity.Comment;
import com.sportconnect.social.entity.CommentLike;
import com.sportconnect.social.repository.CommentLikeRepository;
import com.sportconnect.social.repository.CommentRepository;
import com.sportconnect.social.repository.PostRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
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
public class CommentServiceImpl implements CommentService {

    private final CommentRepository commentRepository;
    private final CommentLikeRepository commentLikeRepository;
    private final PostRepository postRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public CommentResponse createComment(Long postId, UUID userId, CreateCommentRequest request) {
        if (!postRepository.existsById(postId)) {
            throw new NotFoundException("Post not found");
        }

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
        log.info("Created comment {} on post {}", comment.getId(), postId);

        return mapToResponse(comment, userId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<CommentResponse> getPostComments(Long postId, UUID currentUserId, Pageable pageable) {
        return commentRepository.findByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(postId, pageable)
                .map(comment -> mapToResponse(comment, currentUserId));
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
        log.info("Deleted comment {}", commentId);
    }

    @Override
    @Transactional
    public void likeComment(Long commentId, UUID userId) {
        if (!commentRepository.existsById(commentId)) {
            throw new NotFoundException("Comment not found");
        }

        if (commentLikeRepository.existsByCommentIdAndUserId(commentId, userId)) {
            throw new BadRequestException("You have already liked this comment");
        }

        CommentLike like = CommentLike.builder()
                .commentId(commentId)
                .userId(userId)
                .build();

        commentLikeRepository.save(like);
        log.info("User {} liked comment {}", userId, commentId);
    }

    @Override
    @Transactional
    public void unlikeComment(Long commentId, UUID userId) {
        if (!commentLikeRepository.existsByCommentIdAndUserId(commentId, userId)) {
            throw new BadRequestException("You have not liked this comment");
        }

        commentLikeRepository.deleteByCommentIdAndUserId(commentId, userId);
        log.info("User {} unliked comment {}", userId, commentId);
    }

    private CommentResponse mapToResponse(Comment comment, UUID currentUserId) {
        long likeCount = commentLikeRepository.countByCommentId(comment.getId());
        boolean isLiked = currentUserId != null && 
                         commentLikeRepository.existsByCommentIdAndUserId(comment.getId(), currentUserId);

        // Fetch user full name from UserRepository
        String userFullName = userRepository.findById(comment.getUserId())
                .map(User::getFullName)
                .orElse("Unknown User");

        List<CommentResponse> replies = commentRepository
                .findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(comment.getId())
                .stream()
                .map(reply -> mapToResponse(reply, currentUserId))
                .collect(Collectors.toList());

        return CommentResponse.builder()
                .id(comment.getId())
                .postId(comment.getPostId())
                .userId(comment.getUserId())
                .userFullName(userFullName)
                .content(comment.getContent())
                .parentCommentId(comment.getParentCommentId())
                .likeCount(likeCount)
                .isLikedByCurrentUser(isLiked)
                .replies(replies)
                .createdAt(comment.getCreatedAt())
                .updatedAt(comment.getUpdatedAt())
                .build();
    }
}
