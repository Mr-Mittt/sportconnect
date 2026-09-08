package com.sportconnect.common.attributes;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.field.AttributeField;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * A named, reusable record shape declared once in a schema's {@code definitions} registry and
 * referenced by name — from a node or from another definition's field — via {@code definitionRef}.
 *
 * <p>Schema-local by design: each schema document declares its own definitions, even when two
 * schemas need the same shape. That keeps every document self-contained and independently
 * pasteable at no storage cost.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AttributeDefinitionType {

    /**
     * Unique within the document. Matches {@code ^[A-Z][a-zA-Z0-9]*$} — PascalCase, a type
     * namespace rather than a data key, never itself written into a stored value.
     */
    private String name;

    private List<AttributeField> fields;
}
