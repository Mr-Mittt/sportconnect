package com.sportconnect.sport.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.sport.api.dto.CreateSportRequest;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.dto.UpdateSportRequest;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SportServiceImpl implements SportService {

    private final SportRepository sportRepository;
    private final SportLookupCache sportLookupCache;

    /**
     * {@inheritDoc}
     *
     * <p>Evicts {@link SportLookupCache}'s cached master map (A5) after the write so the next read
     * repopulates it — otherwise a newly created sport would stay invisible to
     * {@code requireActiveSportById}/{@code getActiveSportsByIds}/{@code getAllActiveSports}/{@code getAllSports}
     * until the cache separately expired (it has no TTL, so it never would).
     */
    @Override
    @Transactional
    public SportResponse createSport(CreateSportRequest request) {
        if (sportRepository.existsByName(request.getName())) {
            throw new BadRequestException("Sport with name '" + request.getName() + "' already exists");
        }

        Sport sport = Sport.builder()
                .name(request.getName())
                .description(request.getDescription())
                .category(request.getCategory())
                .iconUrl(request.getIconUrl())
                .minPlayers(request.getMinPlayers())
                .maxPlayers(request.getMaxPlayers())
                .isActive(true)
                .build();

        Sport savedSport = sportRepository.save(sport);
        sportLookupCache.evictAll();
        log.info("Created new sport: {}", savedSport.getName());
        return toSportResponse(savedSport);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Reads from {@link SportLookupCache}'s cached master map (A5) rather than
     * {@code sportRepository} directly — includes inactive sports, matching the previous
     * unfiltered {@code findById} behavior.
     */
    @Override
    @Transactional(readOnly = true)
    public SportResponse requireActiveSportById(Long sportId) {
        Sport sport = sportLookupCache.getActiveSportsById().get(sportId);
        if (sport == null) {
            throw new ResourceNotFoundException("Sport", "id", sportId);
        }
        return toSportResponse(sport);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Reads from {@link SportLookupCache}'s cached master map (A5) instead of
     * {@code sportRepository.findAllById(sportIds)} — avoids {@code sportIds} becoming part of a
     * per-method cache key, which would otherwise create one cache entry per distinct id
     * combination instead of sharing {@code requireActiveSportById}'s single cached map.
     */
    @Override
    @Transactional(readOnly = true)
    public Map<Long, SportResponse> getActiveSportsByIds(List<Long> sportIds) {
        Map<Long, Sport> allSportsById = sportLookupCache.getActiveSportsById();
        return sportIds.stream()
                .distinct()
                .filter(allSportsById::containsKey)
                .collect(Collectors.toMap(id -> id, id -> toSportResponse(allSportsById.get(id))));
    }

    /**
     * {@inheritDoc}
     *
     * <p>Reads from {@link SportLookupCache} (A5) instead of
     * {@code sportRepository.findByIsActiveTrue()}. A7 made the cache itself active-only, so the
     * explicit {@code filter(Sport::getIsActive)} this used to carry is gone rather than merely
     * redundant — the cache never holds an inactive sport to filter out.
     */
    @Override
    @Transactional(readOnly = true)
    public List<SportResponse> getAllActiveSports() {
        return sportLookupCache.getActiveSportsById().values().stream()
                .map(this::toSportResponse)
                .collect(Collectors.toList());
    }

    /**
     * {@inheritDoc}
     *
     * <p><strong>Deliberately bypasses {@link SportLookupCache}</strong> and hits
     * {@code sportRepository.findAll()} directly. This is the admin-only "everything, including
     * deactivated" listing, and the cache is active-only since A7 — so it cannot serve this, and
     * populating it from here would defeat the point. Admin listing and reactivation are rare
     * operations; paying a query for them is the right trade against shaping the cache (which every
     * user-facing read depends on) around them.
     */
    @Override
    @Transactional(readOnly = true)
    public List<SportResponse> getAllSports() {
        return sportRepository.findAll().stream()
                .map(this::toSportResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<SportResponse> getSportsByCategory(String category) {
        return sportRepository.findByCategoryAndIsActiveTrue(category).stream()
                .map(this::toSportResponse)
                .collect(Collectors.toList());
    }

    /**
     * {@inheritDoc}
     *
     * <p>Evicts {@link SportLookupCache}'s cached master map (A5) after the write, same reasoning
     * as {@link #createSport}.
     */
    @Override
    @Transactional
    public SportResponse updateSport(Long sportId, UpdateSportRequest request) {
        Sport sport = sportRepository.findById(sportId)
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", sportId));

        if (request.getName() != null) {
            sport.setName(request.getName());
        }
        if (request.getDescription() != null) {
            sport.setDescription(request.getDescription());
        }
        if (request.getCategory() != null) {
            sport.setCategory(request.getCategory());
        }
        if (request.getIconUrl() != null) {
            sport.setIconUrl(request.getIconUrl());
        }
        if (request.getMinPlayers() != null) {
            sport.setMinPlayers(request.getMinPlayers());
        }
        if (request.getMaxPlayers() != null) {
            sport.setMaxPlayers(request.getMaxPlayers());
        }
        if (request.getIsActive() != null) {
            sport.setIsActive(request.getIsActive());
        }

        Sport updatedSport = sportRepository.save(sport);
        sportLookupCache.evictAll();
        log.info("Updated sport: {}", updatedSport.getName());
        return toSportResponse(updatedSport);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Evicts {@link SportLookupCache}'s cached master map (A5) after the write, same reasoning
     * as {@link #createSport}.
     */
    @Override
    @Transactional
    public void deleteSport(Long sportId) {
        Sport sport = sportRepository.findById(sportId)
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", sportId));
        sport.setIsActive(false);
        sportRepository.save(sport);
        sportLookupCache.evictAll();
        log.info("Soft deleted sport: {}", sport.getName());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsByName(String name) {
        return sportRepository.existsByName(name);
    }

    private SportResponse toSportResponse(Sport sport) {
        return SportResponse.builder()
                .id(sport.getId())
                .name(sport.getName())
                .description(sport.getDescription())
                .category(sport.getCategory())
                .iconUrl(sport.getIconUrl())
                .minPlayers(sport.getMinPlayers())
                .maxPlayers(sport.getMaxPlayers())
                .isActive(sport.getIsActive())
                .createdAt(sport.getCreatedAt())
                .updatedAt(sport.getUpdatedAt())
                .build();
    }
}
