package com.sportconnect.social.post.repository;

import com.sportconnect.social.post.entity.Hashtag;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface HashtagRepository extends JpaRepository<Hashtag, Long> {

    Optional<Hashtag> findByTag(String tag);

    Page<Hashtag> findAllByOrderByUsageCountDesc(Pageable pageable);

    Page<Hashtag> findByTagStartingWithOrderByUsageCountDesc(String prefix, Pageable pageable);
}
