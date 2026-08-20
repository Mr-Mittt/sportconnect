package com.sportconnect.sport.api.dto;

/**
 * The value kinds a per-sport attribute can hold (A9).
 *
 * <p>Deliberately a small closed set. {@code NUMBER} and {@code BOOLEAN} are the obvious next
 * additions but are not present until a real attribute needs one, per this codebase's standing
 * "don't design for hypothetical future requirements" rule.
 *
 * <p><strong>Client-visible.</strong> The client branches on this to decide which form control to
 * render, so adding a member here is a client-facing change: client {@code SPORT-2} (renderer) and
 * {@code ADMIN-2} (editor) must gain a case for it in the same change or one filed alongside.
 */
public enum SportAttributeType {

    /** Free text. Stored as a {@code String}. Not bounded by the schema — only by the profile size cap. */
    STRING,

    /** Single choice. Stored as a {@code String} that must equal one of the node's {@code options[].value}. */
    ENUM,

    /** Multi-choice. Stored as a {@code List<String>}, each element one of the node's {@code options[].value}. */
    LIST
}
