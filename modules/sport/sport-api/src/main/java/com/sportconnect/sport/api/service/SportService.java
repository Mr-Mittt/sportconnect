package com.sportconnect.sport.api.service;

import com.sportconnect.sport.api.dto.CreateSportRequest;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.dto.UpdateSportRequest;

import java.util.List;
import java.util.Map;

/**
 * Sport service interface
 */
public interface SportService {

    /**
     * Create a new sport
     */
    SportResponse createSport(CreateSportRequest request);

    /**
     * Get an <strong>active</strong> sport by ID. Throws {@code ResourceNotFoundException} for an
     * unknown id and a deactivated one alike — A7 collapsed those into one outcome, because a
     * deactivated sport is gone from the app's point of view: it is not in the catalog, cannot be
     * tagged onto anything new, and anything already tagged with it stops surfacing.
     *
     * <p>There is deliberately no "get me this sport even if inactive" variant on this interface.
     * The only caller that needs one is admin (listing every sport, or reactivating one), and admin
     * reads go straight to the repository inside {@code sport-impl} rather than through a
     * cross-domain method every other domain could reach for by mistake.
     */
    SportResponse requireActiveSportById(Long sportId);

    /**
     * Batch lookup by ID. Ids with no matching sport are simply absent from the returned map —
     * no exception is thrown, mirroring UserService.getUsersByIds' semantics. For cross-domain
     * callers (e.g. post-impl resolving a post's sportName) that need to batch-resolve sport
     * names for a page of items without one query per item.
     *
     * <p><strong>Inactive sports are NOT returned</strong> — an id whose sport has been
     * deactivated is absent from the map, indistinguishable from an id that never existed. Callers
     * must treat a missing entry as "drop this item", not as "label it Unknown": that is how a
     * deactivated sport takes its dependent data out of view (A7).
     *
     * <p>This Javadoc has now been wrong in both directions, which is worth recording. It
     * originally claimed inactive ids were filtered when the implementation returned them; A7
     * corrected the doc to match the code, then A7's own active-only {@link SportLookupCache}
     * change inverted the behaviour and made the correction stale within the same ticket. The
     * method name carries the contract now precisely so the doc is not the only thing saying it.
     */
    Map<Long, SportResponse> getActiveSportsByIds(List<Long> sportIds);

    /**
     * Get all active sports
     */
    List<SportResponse> getAllActiveSports();

    /**
     * Get all sports (including inactive)
     */
    List<SportResponse> getAllSports();

    /**
     * Get sports by category
     */
    List<SportResponse> getSportsByCategory(String category);

    /**
     * Update sport
     */
    SportResponse updateSport(Long sportId, UpdateSportRequest request);

    /**
     * Delete sport (soft delete)
     */
    void deleteSport(Long sportId);

    /**
     * Check if sport exists by name
     */
    boolean existsByName(String name);

    /**
     * A9: the sport's attribute definition tree, for rendering per-sport profile fields.
     *
     * <p>Resolves the sport through the same active-only path as every other user-facing read, so a
     * deactivated sport is reported as not-found rather than returning a schema (A7 collapses
     * inactive into 404). Served from the sport cache, so this is an in-memory hit — which matters
     * because the profile write path calls it on every write.
     *
     * @param sportId the sport to read
     * @return the parsed schema, or {@code null} when the sport offers no attributes at all
     * @throws com.sportconnect.common.exception.ResourceNotFoundException if no active sport has this id
     */
    SportAttributeSchema getAttributeSchema(Long sportId);

    /**
     * A9: replace a sport's whole attribute schema. Admin-only; there is no partial update.
     *
     * <p>The document is validated in full before anything is written and rejected atomically — a
     * bad paste never half-applies. Unlike {@link #getAttributeSchema} this resolves the sport
     * straight from the repository rather than the active-only cache, matching how
     * {@link #updateSport} and {@link #deleteSport} already handle admin writes, so an inactive
     * sport's schema can still be edited. Evicts the sport cache on success.
     *
     * @param sportId the sport to write
     * @param schema  the replacement document; {@code null} clears the schema entirely
     * @return the stored schema, as read back
     * @throws com.sportconnect.common.exception.BadRequestException if the document is invalid
     * @throws com.sportconnect.common.exception.ResourceNotFoundException if no sport has this id
     */
    SportAttributeSchema replaceAttributeSchema(Long sportId, SportAttributeSchema schema);
}
