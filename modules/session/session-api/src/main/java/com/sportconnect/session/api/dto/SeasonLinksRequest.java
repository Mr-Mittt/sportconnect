package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** SESSION-55: links and unlinks sessions of a MANUAL season; at most 20 ids in each list per call. Either may be omitted. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SeasonLinksRequest {

    private List<Long> add;
    private List<Long> remove;
}
