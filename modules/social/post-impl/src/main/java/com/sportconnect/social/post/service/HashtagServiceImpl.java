package com.sportconnect.social.post.service;

import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.social.post.api.dto.HashtagResponse;
import com.sportconnect.social.post.api.service.HashtagService;
import com.sportconnect.social.post.entity.Hashtag;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.entity.PostHashtag;
import com.sportconnect.social.post.repository.HashtagRepository;
import com.sportconnect.social.post.repository.PostHashtagRepository;
import com.sportconnect.social.post.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class HashtagServiceImpl implements HashtagService {

    private static final Pattern HASHTAG_PATTERN = Pattern.compile("#(\\w+)");
    private static final int MAX_HASHTAGS_PER_POST = 30;

    private final HashtagRepository hashtagRepository;
    private final PostHashtagRepository postHashtagRepository;
    private final PostRepository postRepository;

    @Override
    @Transactional
    public void extractAndSaveHashtags(Long postId, String content) {
        Set<String> tags = extractTags(content);
        if (tags.isEmpty()) {
            return;
        }

        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new NotFoundException("Post not found"));

        for (String tag : tags) {
            Hashtag hashtag = hashtagRepository.findByTag(tag)
                    .map(existing -> {
                        existing.incrementUsageCount();
                        return hashtagRepository.save(existing);
                    })
                    .orElseGet(() -> hashtagRepository.save(
                            Hashtag.builder().tag(tag).usageCount(1).build()));

            postHashtagRepository.save(PostHashtag.builder()
                    .post(post)
                    .hashtag(hashtag)
                    .build());
        }

        log.debug("Saved {} hashtags for post {}", tags.size(), postId);
    }

    @Override
    @Transactional
    public void decrementHashtagsForPost(Long postId) {
        List<PostHashtag> postHashtags = postHashtagRepository.findWithHashtagByPostId(postId);
        for (PostHashtag ph : postHashtags) {
            ph.getHashtag().decrementUsageCount();
        }
        log.debug("Decremented {} hashtag counts for post {}", postHashtags.size(), postId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<HashtagResponse> getTrendingHashtags(Pageable pageable) {
        return hashtagRepository.findAllByOrderByUsageCountDesc(pageable)
                .map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<HashtagResponse> suggestHashtags(String prefix, Pageable pageable) {
        String normalizedPrefix = prefix.toLowerCase().trim();
        return hashtagRepository.findByTagStartingWithOrderByUsageCountDesc(normalizedPrefix, pageable)
                .map(this::mapToResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public List<String> getTagsForPost(Long postId) {
        return postHashtagRepository.findTagsByPostId(postId);
    }

    /**
     * {@inheritDoc}
     *
     * <p>One query for the whole {@code postIds} list ({@code PostHashtagRepository.findTagsByPostIds},
     * an {@code IN} clause), grouped into a map in-memory — not one query per id.
     */
    @Override
    @Transactional(readOnly = true)
    public Map<Long, List<String>> getTagsForPosts(List<Long> postIds) {
        if (postIds.isEmpty()) {
            return Map.of();
        }
        return postHashtagRepository.findTagsByPostIds(postIds).stream()
                .collect(Collectors.groupingBy(
                        row -> (Long) row[0],
                        Collectors.mapping(row -> (String) row[1], Collectors.toList())));
    }

    private Set<String> extractTags(String content) {
        Set<String> tags = new LinkedHashSet<>();
        if (content == null || content.isBlank()) {
            return tags;
        }
        Matcher matcher = HASHTAG_PATTERN.matcher(content);
        while (matcher.find() && tags.size() < MAX_HASHTAGS_PER_POST) {
            String tag = matcher.group(1).toLowerCase();
            if (!tag.isBlank()) {
                tags.add(tag);
            }
        }
        return tags;
    }

    private HashtagResponse mapToResponse(Hashtag hashtag) {
        return HashtagResponse.builder()
                .id(hashtag.getId())
                .tag(hashtag.getTag())
                .usageCount(hashtag.getUsageCount())
                .build();
    }
}
