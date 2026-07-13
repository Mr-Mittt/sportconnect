package com.sportconnect.sport.api.service;

import com.sportconnect.sport.api.dto.CreateSportRequest;
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
     * Get sport by ID
     */
    SportResponse getSportById(Long sportId);

    /**
     * Batch lookup by ID. Missing/inactive ids are simply absent from the returned map —
     * no exception is thrown, mirroring UserService.getUsersByIds' semantics. For cross-domain
     * callers (e.g. post-impl resolving a post's sportName) that need to batch-resolve sport
     * names for a page of items without one query per item.
     */
    Map<Long, SportResponse> getSportsByIds(List<Long> sportIds);

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
}
