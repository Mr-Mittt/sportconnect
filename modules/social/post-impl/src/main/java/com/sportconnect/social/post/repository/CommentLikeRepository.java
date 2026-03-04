package com.sportconnect.social.post.repository;

import com.sportconnect.social.post.entity.CommentLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface CommentLikeRepository extends JpaRepository<CommentLike, Long> {
    
    Optional<CommentLike> findByCommentIdAndUserId(Long commentId, UUID userId);
    
    long countByCommentId(Long commentId);
    
    boolean existsByCommentIdAndUserId(Long commentId, UUID userId);
    
    void deleteByCommentIdAndUserId(Long commentId, UUID userId);
}
