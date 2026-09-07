package com.sportconnect.sport.service;

import com.sportconnect.sport.api.dto.ResolvedSportAttributeDefinition;
import com.sportconnect.sport.api.dto.ResolvedSportAttributeGroup;
import com.sportconnect.sport.api.dto.ResolvedSportAttributeSchema;
import com.sportconnect.sport.api.dto.SessionAttributeSchema;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Produces the member-facing view of a sport's session attribute schema (A17): the same
 * {@link ResolvedSportAttributeSchema} shape the client already renders for the profile schema
 * (SPORT-2), with two extra markers per node — {@code prefillable}/{@code prefillKey} — on every
 * node that came from a {@code #ref}, so the session-create form knows which fields to seed from the
 * creator's own sport profile.
 *
 * <p>Two steps: {@link SessionAttributeSchemaExpander} inlines the {@code #ref}s (lenient-skipping
 * stale ones) and yields a plain {@link SportAttributeSchema} plus a path→profile-path map; the
 * existing {@link SportAttributeSchemaLabelResolver} locale-resolves that document unchanged; then a
 * walk stamps the markers onto the resolved nodes the map names.
 */
@Component
@RequiredArgsConstructor
class SessionAttributeSchemaResolver {

    private final SessionAttributeSchemaExpander expander;
    private final SportAttributeSchemaLabelResolver labelResolver;

    /**
     * @param sessionSchema the stored session schema; {@code null} yields {@code null}
     * @param profileSchema the sport's profile schema (for {@code #ref} resolution); may be {@code null}
     * @param locale        the caller's resolved locale
     */
    ResolvedSportAttributeSchema resolve(SessionAttributeSchema sessionSchema,
                                         SportAttributeSchema profileSchema, Locale locale) {
        if (sessionSchema == null) {
            return null;
        }
        SessionAttributeSchemaExpander.ExpandedSessionSchema expanded =
                expander.expand(sessionSchema, profileSchema);
        ResolvedSportAttributeSchema resolved = labelResolver.resolve(expanded.schema(), locale);
        markPrefillable(resolved.getGroups(), "", expanded.prefillKeyByPath());
        return resolved;
    }

    private void markPrefillable(List<ResolvedSportAttributeGroup> groups, String parentPath,
                                 Map<String, String> prefillKeyByPath) {
        if (groups == null) {
            return;
        }
        for (ResolvedSportAttributeGroup group : groups) {
            String groupPath = parentPath.isEmpty()
                    ? group.getKey()
                    : parentPath + SchemaPaths.SEPARATOR + group.getKey();
            if (group.getAttributes() != null) {
                for (ResolvedSportAttributeDefinition attribute : group.getAttributes()) {
                    String prefillKey = prefillKeyByPath.get(groupPath + SchemaPaths.SEPARATOR + attribute.getKey());
                    if (prefillKey != null) {
                        attribute.setPrefillable(true);
                        attribute.setPrefillKey(prefillKey);
                    }
                }
            }
            markPrefillable(group.getGroups(), groupPath, prefillKeyByPath);
        }
    }
}
