package com.sportconnect.session.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * A list of ids kept in one text column, as comma-separated UUIDs (a {@code SPECIFIC} group session audience,
 * {@code sessions.group_audience_user_ids}). Written once and read only when a session is cancelled, never queried by an id, so
 * a plain string is enough and works the same on Postgres and H2. Uniqueness is enforced here, in Java, before the value is
 * saved: a repeated or null id is dropped and the first occurrence keeps its place. An empty list is stored as {@code null}.
 */
@Converter
public class UuidListConverter implements AttributeConverter<List<UUID>, String> {

    @Override
    public String convertToDatabaseColumn(List<UUID> ids) {
        if (ids == null || ids.isEmpty()) {
            return null;
        }
        String joined = ids.stream().filter(Objects::nonNull).distinct().map(UUID::toString).collect(Collectors.joining(","));
        return joined.isEmpty() ? null : joined;
    }

    @Override
    public List<UUID> convertToEntityAttribute(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }
        return Arrays.stream(text.split(",")).map(String::trim).filter(part -> !part.isEmpty()).map(UUID::fromString).toList();
    }
}
