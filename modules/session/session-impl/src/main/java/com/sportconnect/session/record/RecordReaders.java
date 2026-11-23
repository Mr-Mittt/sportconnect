package com.sportconnect.session.record;

import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The readers by record type (SESSION-72). The type of a sport's records is {@code record.data.type} of its result
 * schema; a schema of an unknown type has no reader, so its records cannot be proposed as ranking games.
 */
@Component
public class RecordReaders {

    private final Map<String, RecordTypeReader> byType = new HashMap<>();

    public RecordReaders(List<RecordTypeReader> readers) {
        for (RecordTypeReader reader : readers) {
            byType.put(reader.type(), reader);
        }
    }

    /** The reader for this sport's records, or empty when the schema is missing or names a type with no reader. */
    public Optional<RecordTypeReader> forSchema(Map<String, Object> schema) {
        if (schema == null || !(schema.get("record") instanceof Map<?, ?> record)
                || !(record.get("data") instanceof Map<?, ?> data) || !(data.get("type") instanceof String type)) {
            return Optional.empty();
        }
        return Optional.ofNullable(byType.get(type));
    }
}
