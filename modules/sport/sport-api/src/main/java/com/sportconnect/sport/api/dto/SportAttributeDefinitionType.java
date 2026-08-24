package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * A named, reusable record shape declared once in a sport's schema and referenced by name — from
 * an attribute or from another definition's field — via {@code definitionRef} (schema v2, A12).
 *
 * <p>Sport-local by design: each sport's document declares its own definitions, even when two
 * sports need the same shape (e.g. both Badminton and Tennis each declaring their own
 * {@code ShoeSize}). That duplication keeps every document self-contained and independently
 * pasteable — the admin editor's whole workflow — at zero cost in storage or cache wiring. See
 * {@code SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md} §5.4.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SportAttributeDefinitionType {

    /**
     * Unique within the document. Must match {@code ^[A-Z][a-zA-Z0-9]*$} — PascalCase, a type
     * namespace rather than a data key, so it reads distinctly from every {@code key} field and is
     * never itself written into a stored profile.
     */
    private String name;

    private List<SportAttributeField> fields;
}
