package com.sportconnect.notification.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Stores {@code Notification.actorIds} (bounded to 3 entries — see
 * {@code NotificationServiceImpl.recordEvent}) as a comma-joined string column. No array-column
 * precedent exists anywhere else in this codebase, and 3 UUIDs never approach the 500-char column
 * limit, so a delimited string is simpler than a native Postgres array type here.
 */
@Converter
public class UuidListConverter implements AttributeConverter<List<UUID>, String> {

    private static final String DELIMITER = ",";

    @Override
    public String convertToDatabaseColumn(List<UUID> attribute) {
        if (attribute == null || attribute.isEmpty()) {
            return null;
        }
        return attribute.stream().map(UUID::toString).collect(Collectors.joining(DELIMITER));
    }

    @Override
    public List<UUID> convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return new ArrayList<>();
        }
        return Arrays.stream(dbData.split(DELIMITER)).map(UUID::fromString).collect(Collectors.toList());
    }
}
