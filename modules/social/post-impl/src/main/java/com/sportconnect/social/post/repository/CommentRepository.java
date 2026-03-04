package com.sportconnect.social.post.repository;

import com.sportconnect.social.post.entity.Comment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CommentRepository extends JpaRepository<Comment, Long> {
    
    Page<Comment> findByPostIdAndIsActiveTrueAndParentCommentIdIsNullOrderByCreatedAtDesc(Long postId, Pageable pageable);
    
    List<Comment> findByParentCommentIdAndIsActiveTrueOrderByCreatedAtAsc(Long parentCommentId);
    
    long countByPostIdAndIsActiveTrue(Long postId);
}
