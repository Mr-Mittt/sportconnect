package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * SESSION-GROUP-6 — a number of regular group sessions: how many are {@code SCHEDULED} (or {@code PREPARING}) and would be
 * cancelled (the count endpoint), or how many were cancelled (the answer of a delete). {@code ONGOING} sessions are never
 * counted and never cancelled.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RegularSessionsCountResponse {

    private int count;
}
