package com.sportconnect.social.post.api.service;

import com.sportconnect.social.post.api.dto.HashtagResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;

public interface HashtagService {

    void extractAndSaveHashtags(Long postId, String content);

    void decrementHashtagsForPost(Long postId);

    Page<HashtagResponse> getTrendingHashtags(Pageable pageable);

    Page<HashtagResponse> suggestHashtags(String prefix, Pageable pageable);

    List<String> getTagsForPost(Long postId);

    /**
     * Batch lookup for a page of posts. Returns only ids that have at least one hashtag —
     * a post with none is simply absent from the map (resolve with {@code getOrDefault(id, List.of())}).
     */
    Map<Long, List<String>> getTagsForPosts(List<Long> postIds);
}
