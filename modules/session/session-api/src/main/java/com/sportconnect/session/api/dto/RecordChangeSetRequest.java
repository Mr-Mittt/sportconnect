package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * SESSION-50: everything one dialog Save changes in a session's results, applied in one transaction.
 * At most 50 operations in total. An id both updated and deleted is deleted.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecordChangeSetRequest {

    @Builder.Default
    private List<RecordAddOperation> add = new ArrayList<>();

    @Builder.Default
    private List<RecordUpdateOperation> update = new ArrayList<>();

    /** Ids of the records to delete. Deleting a record that is already gone does nothing. */
    @Builder.Default
    private List<Long> delete = new ArrayList<>();
}
