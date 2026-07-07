package com.sportconnect.social.post.service

import com.sportconnect.social.post.entity.Hashtag
import com.sportconnect.social.post.entity.Post
import com.sportconnect.social.post.entity.PostHashtag
import com.sportconnect.social.post.repository.HashtagRepository
import com.sportconnect.social.post.repository.PostHashtagRepository
import com.sportconnect.social.post.repository.PostRepository
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

class HashtagServiceImplSpec extends Specification {

    HashtagRepository hashtagRepository = Mock()
    PostHashtagRepository postHashtagRepository = Mock()
    PostRepository postRepository = Mock()

    @Subject
    HashtagServiceImpl hashtagService = new HashtagServiceImpl(hashtagRepository, postHashtagRepository, postRepository)

    Long postId = 1L
    Post post = Post.builder().id(postId).content("content").build()

    // ── extractAndSaveHashtags ────────────────────────────────────────────────

    def "extractAndSaveHashtags creates new hashtags and links them to the post"() {
        given:
        postRepository.findById(postId) >> Optional.of(post)
        hashtagRepository.findByTag(_) >> Optional.empty()

        when:
        hashtagService.extractAndSaveHashtags(postId, "Love #Football and #Sport today!")

        then:
        2 * hashtagRepository.save(_ as Hashtag) >> { List args -> args[0] }
        2 * postHashtagRepository.save(_ as PostHashtag)
    }

    def "extractAndSaveHashtags increments existing hashtag usage count"() {
        given:
        def existing = Hashtag.builder().id(10L).tag("running").usageCount(5).build()
        postRepository.findById(postId) >> Optional.of(post)
        hashtagRepository.findByTag("running") >> Optional.of(existing)

        when:
        hashtagService.extractAndSaveHashtags(postId, "I love #running!")

        then:
        existing.usageCount == 6
        1 * hashtagRepository.save(existing) >> existing
        1 * postHashtagRepository.save(_ as PostHashtag)
    }

    def "extractAndSaveHashtags normalizes tags to lowercase and deduplicates"() {
        given:
        postRepository.findById(postId) >> Optional.of(post)
        hashtagRepository.findByTag("football") >> Optional.empty()

        when:
        hashtagService.extractAndSaveHashtags(postId, "#FOOTBALL #Football #football")

        then: "deduplicated to exactly one lowercase tag"
        1 * hashtagRepository.save({ Hashtag h -> h.tag == "football" }) >> { List args -> args[0] }
        1 * postHashtagRepository.save(_ as PostHashtag)
    }

    def "extractAndSaveHashtags caps at 30 unique tags"() {
        given:
        def content = (1..40).collect { "#tag$it" }.join(" ")
        postRepository.findById(postId) >> Optional.of(post)
        hashtagRepository.findByTag(_ as String) >> Optional.empty()

        when:
        hashtagService.extractAndSaveHashtags(postId, content)

        then:
        30 * hashtagRepository.save(_ as Hashtag) >> { List args -> args[0] }
        30 * postHashtagRepository.save(_ as PostHashtag)
    }

    def "extractAndSaveHashtags is a no-op when content has no hashtags"() {
        when:
        hashtagService.extractAndSaveHashtags(postId, "No tags here at all")

        then:
        0 * postRepository.findById(_)
        0 * hashtagRepository.save(_)
        0 * postHashtagRepository.save(_)
    }

    // ── decrementHashtagsForPost ──────────────────────────────────────────────

    def "decrementHashtagsForPost decrements usage count for all post hashtags"() {
        given:
        def h1 = Hashtag.builder().id(1L).tag("sport").usageCount(3).build()
        def h2 = Hashtag.builder().id(2L).tag("fun").usageCount(1).build()
        def ph1 = PostHashtag.builder().hashtag(h1).build()
        def ph2 = PostHashtag.builder().hashtag(h2).build()
        postHashtagRepository.findWithHashtagByPostId(postId) >> [ph1, ph2]

        when:
        hashtagService.decrementHashtagsForPost(postId)

        then:
        h1.usageCount == 2
        h2.usageCount == 0
    }

    def "decrementUsageCount does not go below zero"() {
        given:
        def h = Hashtag.builder().id(1L).tag("rare").usageCount(0).build()
        postHashtagRepository.findWithHashtagByPostId(postId) >> [PostHashtag.builder().hashtag(h).build()]

        when:
        hashtagService.decrementHashtagsForPost(postId)

        then:
        h.usageCount == 0
    }

    // ── getTrendingHashtags ───────────────────────────────────────────────────

    def "getTrendingHashtags returns hashtags ordered by usage count"() {
        given:
        def h1 = Hashtag.builder().id(1L).tag("football").usageCount(100).build()
        def h2 = Hashtag.builder().id(2L).tag("tennis").usageCount(50).build()
        def pageable = PageRequest.of(0, 10)
        hashtagRepository.findAllByOrderByUsageCountDesc(pageable) >> new PageImpl<>([h1, h2])

        when:
        def result = hashtagService.getTrendingHashtags(pageable)

        then:
        result.content.size() == 2
        result.content[0].tag == "football"
        result.content[0].usageCount == 100
        result.content[1].tag == "tennis"
    }

    // ── suggestHashtags ───────────────────────────────────────────────────────

    def "suggestHashtags normalizes prefix to lowercase before querying"() {
        given:
        def h = Hashtag.builder().id(1L).tag("football").usageCount(10).build()
        def pageable = PageRequest.of(0, 10)
        hashtagRepository.findByTagStartingWithOrderByUsageCountDesc("foot", pageable) >> new PageImpl<>([h])

        when:
        def result = hashtagService.suggestHashtags("FOOT", pageable)

        then:
        result.content.size() == 1
        result.content[0].tag == "football"
    }

    // ── getTagsForPost ────────────────────────────────────────────────────────

    def "getTagsForPost returns tag strings for a post"() {
        given:
        postHashtagRepository.findTagsByPostId(postId) >> ["football", "sport"]

        when:
        def result = hashtagService.getTagsForPost(postId)

        then:
        result == ["football", "sport"]
    }

    // ── getTagsForPosts ───────────────────────────────────────────────────────

    def "getTagsForPosts groups tags by post id, omitting posts with none"() {
        given: "post 1 has two tags, post 2 has one, post 3 has none"
        def otherPostId = 2L
        def untaggedPostId = 3L
        postHashtagRepository.findTagsByPostIds([postId, otherPostId, untaggedPostId]) >> [
                [postId, "football"] as Object[],
                [postId, "sport"] as Object[],
                [otherPostId, "training"] as Object[]
        ]

        when:
        def result = hashtagService.getTagsForPosts([postId, otherPostId, untaggedPostId])

        then:
        result[postId] == ["football", "sport"]
        result[otherPostId] == ["training"]
        !result.containsKey(untaggedPostId)
    }

    def "getTagsForPosts returns an empty map without querying when given no ids"() {
        when:
        def result = hashtagService.getTagsForPosts([])

        then:
        0 * postHashtagRepository.findTagsByPostIds(_)
        result.isEmpty()
    }
}
