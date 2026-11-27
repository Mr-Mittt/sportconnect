package com.sportconnect.sport.api.service;

import java.util.Map;

/**
 * SESSION-84: a check of a sport's result schema that another domain owns. The sport module stores the schema and checks only what
 * it reads itself (size, {@code maxRecords}); the statistics side of the schema ({@code record.scoreboard}) is interpreted by the
 * session module, which cannot be called from here (session depends on sport), so it registers an implementation of this interface
 * and {@code replaceResultSchema} asks every registered one before it stores a schema.
 */
public interface ResultSchemaValidator {

    /**
     * Checks a schema that is about to be stored.
     *
     * @param schema the whole result schema, never {@code null}
     * @throws com.sportconnect.common.exception.BadRequestException {@code SPORT_RESULT_SCHEMA_INVALID} when the schema cannot be used
     */
    void validate(Map<String, Object> schema);
}
