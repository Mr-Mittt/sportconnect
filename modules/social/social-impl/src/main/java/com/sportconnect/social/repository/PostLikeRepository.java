package com.sportconnect.social.repository;

import com.sportconnect.social.entity.PostLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface PostLikeRepository extends JpaRepository<PostLike, Long> {
    
    Optional<PostLike> findByPostIdAndUserId(Long postId, UUID userId);
    
    long countByPostId(Long postId);
    
    boolean existsByPostIdAndUserId(Long postId, UUID userId);
    
    void deleteByPostIdAndUserId(Long postId, UUID userId);
}
