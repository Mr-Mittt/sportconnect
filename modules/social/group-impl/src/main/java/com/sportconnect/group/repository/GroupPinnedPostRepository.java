package com.sportconnect.group.repository;

import com.sportconnect.group.entity.GroupPinnedPost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface GroupPinnedPostRepository extends JpaRepository<GroupPinnedPost, Long> {

    List<GroupPinnedPost> findByGroupIdOrderByPinnedAtDesc(Long groupId);

    List<GroupPinnedPost> findTop3ByGroupIdOrderByPinnedAtDesc(Long groupId);

    long countByGroupId(Long groupId);

    boolean existsByGroupIdAndPostId(Long groupId, Long postId);

    Optional<GroupPinnedPost> findByGroupIdAndPostId(Long groupId, Long postId);

    @Modifying
    @Query("DELETE FROM GroupPinnedPost p WHERE p.groupId = :groupId AND p.postId = :postId")
    void deleteByGroupIdAndPostId(@Param("groupId") Long groupId, @Param("postId") Long postId);
}
