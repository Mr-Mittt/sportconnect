package com.sportconnect.session.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.value.AttributeValueFilter;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.sport.api.service.SportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * SESSION-23, extracted by SESSION-GROUP-4 so a session and a group recurrence configuration filter their attributes the
 * same way: a caller-supplied attribute map is run through the sport's {@code #ref}-expanded session schema (unknown,
 * wrong-typed and switched-off entries dropped silently), then the serialized size of what survives is capped.
 *
 * <p><b>Deactivated sport:</b> {@code SportService.getSessionAttributeSchemaRaw} is active-only and throws
 * {@code ResourceNotFoundException} for an inactive sport; that propagates by design, since a caller only reaches this by
 * actively supplying attributes. A request that supplies none never calls it.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SessionAttributeResolver {

    /** Same serialized-size ceiling profile attributes use ({@code UserSportProfileServiceImpl.MAX_ATTRIBUTES_BYTES}). */
    private static final int MAX_ATTRIBUTES_BYTES = 4096;

    private final SportService sportService;
    private final ObjectMapper objectMapper;

    /**
     * @return the filtered map to store (possibly empty: an explicit clear), or {@code null} when nothing was supplied (the
     *         schema is then never fetched)
     */
    public Map<String, Object> resolve(Map<String, Object> requested, Long sportId) {
        if (requested == null) {
            return null;
        }
        AttributeSchema schema = sportService.getSessionAttributeSchemaRaw(sportId);
        Map<String, Object> filtered = AttributeValueFilter.filter(requested, schema);
        validateSize(filtered);
        return filtered;
    }

    /** Rejects a map whose JSON serialization exceeds {@link #MAX_ATTRIBUTES_BYTES}. Checked against the already filtered
     * map, so an oversized payload that is mostly junk still fails rather than being silently trimmed to fit. */
    private void validateSize(Map<String, Object> attributes) {
        try {
            byte[] json = objectMapper.writeValueAsBytes(attributes);
            if (json.length > MAX_ATTRIBUTES_BYTES) {
                log.warn("Rejected session attributes: {} bytes exceeds the {}-byte limit", json.length, MAX_ATTRIBUTES_BYTES);
                throw new BadRequestException("Session attributes exceed the maximum allowed size (4KB)");
            }
        } catch (JsonProcessingException e) {
            log.warn("Rejected session attributes: could not serialize to JSON", e);
            throw new BadRequestException("Invalid session attributes");
        }
    }
}
