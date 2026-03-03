package com.sportconnect.sport.api.service;

import com.sportconnect.sport.api.dto.CreateSportRequest;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.dto.UpdateSportRequest;

import java.util.List;

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
