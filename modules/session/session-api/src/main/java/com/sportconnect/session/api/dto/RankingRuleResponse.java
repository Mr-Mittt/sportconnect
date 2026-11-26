package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

/** SESSION-54 — a stored ranking rule as the admin sees it. {@code version} goes up by one on every change. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RankingRuleResponse {

    private Long sportId;
    private String scopeType;
    private Long scopeId;
    private String kind;
    private List<Object> sort;
    private List<Object> require;
    private Integer version;
    private Instant updatedAt;
}
