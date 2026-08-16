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
     * Batch like-count + caller-liked flag for {@link com.sportconnect.social.post.api.service.PostService
     * #getSessionPostLikeInfo} — one grouped, conditional-aggregation query for a whole batch of
     * postIds rather than a separate count query and a separate caller-liked-ids query (SESSION-14:
     * both queries hit this same table for the same postIds, no join needed between them). Each
     * row is {@code [postId, count, callerLikedSum]}; a postId with zero likes has no row at all
     * (standard SQL GROUP BY behavior), which the caller accounts for via {@code getOrDefault}.
     * {@code callerLikedSum} is 0 or 1 ({@code postId}/{@code userId} is unique-constrained) — a
     * null {@code userId} never matches {@code pl.userId = :userId} in SQL, so it safely degrades
     * to 0 for every row without a separate null-check branch.
     */
    @Query("SELECT pl.postId, COUNT(pl), SUM(CASE WHEN pl.userId = :userId THEN 1 ELSE 0 END) "
            + "FROM PostLike pl WHERE pl.postId IN :postIds GROUP BY pl.postId")
    List<Object[]> countAndCallerLikedGroupedByPostIdIn(
            @Param("postIds") List<Long> postIds, @Param("userId") UUID userId);
}
