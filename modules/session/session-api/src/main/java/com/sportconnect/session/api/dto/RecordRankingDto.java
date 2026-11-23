package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

/**
 * SESSION-72: the ranking state of one record, on {@link SessionRecordDto#getRanking()}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecordRankingDto {

    private RankingStatus status;

    /** Who proposed it; {@code null} while {@code status} is {@code NORMAL}. */
    private UUID requestedBy;

    /** The players who have confirmed the record's current content, in confirmation order; empty for a normal game. */
    private List<UUID> confirmedBy;
}
