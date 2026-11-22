package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

/** SESSION-70 — what an import did, one entry per requested session, in request order. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportApplyResponse {

    private int created;
    private int skipped;
    private int failed;
    private List<ImportSessionResult> results;

    /** {@code CREATED}: made now ({@code sessionId} set). {@code SKIPPED}: the same group, title and start already existed. {@code FAILED}: an unexpected error for this session only. */
    public enum Status { CREATED, SKIPPED, FAILED }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ImportSessionResult {
        private String title;
        private LocalDate localDate;
        private Status status;
        private Long sessionId;
    }
}
