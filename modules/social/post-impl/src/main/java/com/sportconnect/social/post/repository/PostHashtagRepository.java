package com.sportconnect.social.post.repository;

import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.entity.PostHashtag;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PostHashtagRepository extends JpaRepository<PostHashtag, Long> {

    @Query("SELECT ph FROM PostHashtag ph JOIN FETCH ph.hashtag WHERE ph.post.id = :postId")
    List<PostHashtag> findWithHashtagByPostId(@Param("postId") Long postId);

    @Query("SELECT ph.hashtag.tag FROM PostHashtag ph WHERE ph.post.id = :postId")
    List<String> findTagsByPostId(@Param("postId") Long postId);

    @Query("SELECT ph.post.id, ph.hashtag.tag FROM PostHashtag ph WHERE ph.post.id IN :postIds")
    List<Object[]> findTagsByPostIds(@Param("postIds") List<Long> postIds);

    @Query(value = """
            SELECT ph.post FROM PostHashtag ph
            WHERE ph.hashtag.tag = :tag
              AND ph.post.isActive = true
              AND (
                (ph.post.postType = com.sportconnect.social.post.api.dto.PostType.USER_FEED AND ph.post.visibility = 'public')
                OR (ph.post.postType = com.sportconnect.social.post.api.dto.PostType.GROUP_POST AND ph.post.groupId IN :memberGroupIds)
              )
            ORDER BY ph.post.lastInteractionAt DESC
            """,
            countQuery = """
            SELECT COUNT(ph) FROM PostHashtag ph
            WHERE ph.hashtag.tag = :tag
              AND ph.post.isActive = true
              AND (
                (ph.post.postType = com.sportconnect.social.post.api.dto.PostType.USER_FEED AND ph.post.visibility = 'public')
                OR (ph.post.postType = com.sportconnect.social.post.api.dto.PostType.GROUP_POST AND ph.post.groupId IN :memberGroupIds)
              )
            """)
    Page<Post> findPostsByHashtag(@Param("tag") String tag,
                                   @Param("memberGroupIds") List<Long> memberGroupIds,
                                   Pageable pageable);
}
