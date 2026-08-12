package com.sportconnect.social.post.repository;

import com.sportconnect.social.post.entity.PostLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PostLikeRepository extends JpaRepository<PostLike, Long> {

    Optional<PostLike> findByPostIdAndUserId(Long postId, UUID userId);

    long countByPostId(Long postId);

    boolean existsByPostIdAndUserId(Long postId, UUID userId);

    void deleteByPostIdAndUserId(Long postId, UUID userId);

    /**
     * Batch like-count for {@link com.sportconnect.social.post.api.service.PostService
     * #getSessionPostLikeInfo} — one grouped query for a whole batch of postIds rather than
     * {@link #countByPostId} called once per post. Each row is {@code [postId, count]}; a postId
     * with zero likes has no row at all (standard SQL GROUP BY behavior), which the caller
     * accounts for via {@code getOrDefault(id, 0L)}.
     */
    @Query("SELECT pl.postId, COUNT(pl) FROM PostLike pl WHERE pl.postId IN :postIds GROUP BY pl.postId")
    List<Object[]> countGroupedByPostIdIn(@Param("postIds") List<Long> postIds);

    /** Batch equivalent of {@link #existsByPostIdAndUserId} — which of {@code postIds} does {@code userId} have a like row for. */
    @Query("SELECT pl.postId FROM PostLike pl WHERE pl.userId = :userId AND pl.postId IN :postIds")
    List<Long> findLikedPostIdsByUserIdAndPostIdIn(@Param("userId") UUID userId, @Param("postIds") List<Long> postIds);
}
