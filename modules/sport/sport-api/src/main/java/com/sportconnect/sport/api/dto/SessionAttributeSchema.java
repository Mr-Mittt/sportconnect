package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * The full <em>session</em> attribute definition for one sport (A17) — the document stored in
 * {@code sports.session_attributes_schema}, parallel to {@link SportAttributeSchema} (which is the
 * <em>profile</em> schema). Describes which attributes a session (event) of this sport may carry.
 *
 * <p>Returned raw (every locale) by {@code GET /api/sports/all/{sportId}/session-attribute-schema}
 * (admin) and by {@code SportService.getSessionAttributeSchemaForAdmin}. The member-facing
 * {@code GET /api/sports/{sportId}/session-attribute-schema} returns a locale-resolved,
 * {@code #ref}-expanded {@link ResolvedSportAttributeSchema} instead — see
 * {@code SessionAttributeSchemaResolver}. {@code SportService.getSessionAttributeSchemaRaw} returns
 * a {@code #ref}-expanded but still multi-locale {@link SportAttributeSchema} for SESSION-23's
 * write-time filter.
 *
 * <p>A sport with no session schema yields {@code null} from
 * {@code SportService.getSessionAttributeSchemaForAdmin}: its sessions offer no attributes.
 *
 * <p>The {@link #definitions} registry here is <strong>session-local</strong> — own
 * ({@code #ref}-less) nodes resolve their {@code definitionRef} against it, never against the
 * sport's profile-schema registry. A {@code #ref} node, by contrast, inherits everything (type,
 * options, {@code definitionRef} and thus that definition from the <em>profile</em> registry) from
 * the profile attribute it points at.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionAttributeSchema {

    /**
     * The session-local registry of record shapes an <em>own</em> node (or another definition's
     * field) may reference by name via {@code definitionRef} (mirrors {@link SportAttributeSchema}'s
     * registry and is validated by the same rules). Absent or empty on a document whose own nodes
     * use no {@code DEFINITION}/{@code DEFINITION_LIST} types. A definition name here must not
     * collide with a profile-schema definition name pulled in by a {@code #ref}.
     */
    private List<SportAttributeDefinitionType> definitions;

    private List<SessionAttributeGroup> groups;

    /**
     * BCP 47 locale code (e.g. {@code "en"}) — the fallback every labeled node's {@code label} map
     * must carry an entry for. Same contract as {@link SportAttributeSchema#getDefaultLocale()}.
     */
    private String defaultLocale;
}
