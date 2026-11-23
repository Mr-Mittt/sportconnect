package com.sportconnect.session.record;

import java.util.Map;

/**
 * Reads one kind of record ({@code record.data.type} in the sport's result schema) into {@link RecordFacts}. One
 * implementation per type; adding a sport of an existing type is configuration, adding a type is a new reader.
 * Implementations are pure and never throw for a malformed record: they answer {@code valid = false}.
 */
public interface RecordTypeReader {

    /** The {@code record.data.type} this reader handles, for example {@code COMPETITIVE}. */
    String type();

    /** Whether this sport's schema lets a record of this type become a ranking game (it defines a score to compare). */
    boolean supportsRanking(Map<String, Object> schema);

    /**
     * @param schema the sport's result schema as stored (never {@code null})
     * @param data   the record's stored {@code data}
     */
    RecordFacts read(Map<String, Object> schema, Map<String, Object> data);
}
