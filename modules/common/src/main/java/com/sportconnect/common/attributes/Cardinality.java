package com.sportconnect.common.attributes;

/**
 * How many values a {@code #ref} node
 * ({@link com.sportconnect.common.attributes.node.RefAttribute}) holds (extraction plan D9).
 *
 * <p>A {@code #ref} node draws its value(s) from the base-schema attribute it points at:
 * <ul>
 *   <li>{@link #SINGLE} — one value; a client renders a single-select control;</li>
 *   <li>{@link #LIST} — many values; a client renders a multi-select control.</li>
 * </ul>
 *
 * <p>Independent of the base attribute's own {@link AttributeType}: a {@code LIST} {@code #ref} off
 * a scalar base picks several of its options; a {@code SINGLE} {@code #ref} off a {@code LIST} base
 * picks one of the stored entries. All four combinations are legal.
 *
 * <p>Only ever set on a {@code RefAttribute} (required there) and mirrored onto a resolved node;
 * never on an own node.
 */
public enum Cardinality {
    SINGLE,
    LIST
}
