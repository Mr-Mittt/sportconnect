package com.sportconnect.social.post.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.social.post.api.dto.HashtagResponse;
import com.sportconnect.social.post.api.service.HashtagService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/hashtags")
@RequiredArgsConstructor
public class HashtagController {

    private final HashtagService hashtagService;

    @GetMapping("/trending")
    public ResponseEntity<ApiResponse<Page<HashtagResponse>>> getTrendingHashtags(
            @PageableDefault(size = 10) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success("Trending hashtags retrieved",
                hashtagService.getTrendingHashtags(pageable)));
    }

    @GetMapping("/suggest")
    public ResponseEntity<ApiResponse<Page<HashtagResponse>>> suggestHashtags(
            @RequestParam String q,
            @PageableDefault(size = 10) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success("Hashtag suggestions retrieved",
                hashtagService.suggestHashtags(q, pageable)));
    }
}
