package com.sportconnect.social.post.repository;

import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.entity.Post;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PostRepository extends JpaRepository<Post, Long> {

    Page<Post> findByUserIdAndPostTypeInAndIsActiveTrue(UUID userId, List<PostType> postTypes, Pageable pageable);

    Page<Post> findByGroupIdAndIsActiveTrue(Long groupId, Pageable pageable);
    
    Page<Post> findByIsActiveTrueOrderByCreatedAtDesc(Pageable pageable);
    
    Page<Post> findBySportIdAndIsActiveTrueOrderByCreatedAtDesc(Long sportId, Pageable pageable);
    
    Optional<Post> findByIdAndIsActiveTrue(Long id);

    List<Post> findByIdInAndIsActiveTrue(List<Long> ids);
    
    @Query("SELECT p FROM Post p WHERE p.isActive = true AND p.visibility = 'public' AND p.postType = com.sportconnect.social.post.api.dto.PostType.USER_FEED ORDER BY p.createdAt DESC")
    Page<Post> findPublicPosts(Pageable pageable);
    
    @Query("SELECT p FROM Post p WHERE p.userId IN :userIds AND p.isActive = true ORDER BY p.createdAt DESC")
    Page<Post> findByUserIds(@Param("userIds") List<UUID> userIds, Pageable pageable);

    @Query("""
            SELECT p FROM Post p WHERE p.isActive = true AND (
                (p.userId = :callerId AND p.postType = com.sportconnect.social.post.api.dto.PostType.USER_FEED)
                OR (p.userId IN :friendIds AND p.postType = com.sportconnect.social.post.api.dto.PostType.USER_FEED)
                OR (p.groupId IN :groupIds AND p.postType = com.sportconnect.social.post.api.dto.PostType.GROUP_POST)
            ) ORDER BY p.lastInteractionAt DESC
            """)
    Page<Post> findPersonalizedFeed(
            @Param("callerId") UUID callerId,
            @Param("friendIds") List<UUID> friendIds,
            @Param("groupIds") List<Long> groupIds,
            Pageable pageable);

    @Modifying
    @Query("UPDATE Post p SET p.lastInteractionAt = :now WHERE p.id = :postId")
    void updateLastInteractionAt(@Param("postId") Long postId, @Param("now") LocalDateTime now);

    @Query("""
            SELECT COUNT(p) > 0 FROM Post p
            WHERE p.groupId = :groupId
              AND p.postType = com.sportconnect.social.post.api.dto.PostType.GROUP_BROADCAST
              AND p.isActive = true
              AND p.broadcastEndTime > CURRENT_TIMESTAMP
            """)
    boolean existsActiveGroupBroadcast(@Param("groupId") Long groupId);

    @Query("""
            SELECT p FROM Post p
            WHERE p.groupId IN :groupIds
              AND p.postType = com.sportconnect.social.post.api.dto.PostType.GROUP_BROADCAST
              AND p.isActive = true
              AND p.broadcastEndTime > CURRENT_TIMESTAMP
            ORDER BY p.createdAt DESC
            """)
    Page<Post> findActiveBroadcasts(@Param("groupIds") List<Long> groupIds, Pageable pageable);
}
