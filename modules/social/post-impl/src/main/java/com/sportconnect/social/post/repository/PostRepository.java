package com.sportconnect.social.post.repository;

import com.sportconnect.social.post.entity.Post;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PostRepository extends JpaRepository<Post, Long> {
    
    Page<Post> findByUserIdAndIsActiveTrue(UUID userId, Pageable pageable);
    
    Page<Post> findByGroupIdAndIsActiveTrue(Long groupId, Pageable pageable);
    
    Page<Post> findByIsActiveTrueOrderByCreatedAtDesc(Pageable pageable);
    
    Page<Post> findBySportIdAndIsActiveTrueOrderByCreatedAtDesc(Long sportId, Pageable pageable);
    
    Optional<Post> findByIdAndIsActiveTrue(Long id);
    
    @Query("SELECT p FROM Post p WHERE p.isActive = true AND p.visibility = 'public' AND p.groupId IS NULL ORDER BY p.createdAt DESC")
    Page<Post> findPublicPosts(Pageable pageable);
    
    @Query("SELECT p FROM Post p WHERE p.userId IN :userIds AND p.isActive = true ORDER BY p.createdAt DESC")
    Page<Post> findByUserIds(@Param("userIds") List<UUID> userIds, Pageable pageable);
}
