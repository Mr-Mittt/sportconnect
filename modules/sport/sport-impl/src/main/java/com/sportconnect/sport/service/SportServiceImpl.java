package com.sportconnect.sport.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.sport.api.dto.CreateSportRequest;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
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
    private final SportAttributeSchemaValidator schemaValidator;
    private final ObjectMapper objectMapper;

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
            // A11: sports.name is UNIQUE NOT NULL (V003). Without this guard the collision surfaced
            // as a DataIntegrityViolationException at flush, which GlobalExceptionHandler has no
            // case for — so it fell through to the catch-all Exception handler and reached the
            // caller as 500 "An unexpected error occurred". A rename onto an existing name is the
            // single most likely mistake in an admin sport form (client ADMIN-2), so it gets the
            // same readable 400 createSport already produces. Compared case-sensitively, matching
            // existsByName/createSport — this closes the 500, it does not add new normalisation.
            if (!request.getName().equals(sport.getName())
                    && sportRepository.existsByName(request.getName())) {
                throw new BadRequestException("Sport with name '" + request.getName() + "' already exists");
            }
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

    /**
     * {@inheritDoc}
     *
     * <p>Reads through {@link SportLookupCache} like every other user-facing read, so a deactivated
     * sport is not found rather than returning a schema, and so the profile write path — which
     * calls this on every write — pays an in-memory lookup instead of a query.
     *
     * <p>The stored column is an untyped map (see {@code Sport.attributesSchema} for why); this is
     * the one place it becomes a typed {@code SportAttributeSchema}, so a document that no longer
     * deserialises fails here alone and cannot take the whole cached catalogue down with it.
     */
    @Override
    @Transactional(readOnly = true)
    public SportAttributeSchema getAttributeSchema(Long sportId) {
        Sport sport = sportLookupCache.getActiveSportsById().get(sportId);
        if (sport == null) {
            throw new ResourceNotFoundException("Sport", "id", sportId);
        }
        return toAttributeSchema(sport.getAttributesSchema());
    }

    /**
     * {@inheritDoc}
     *
     * <p>Resolves with {@code findById} rather than the active-only cache, matching
     * {@link #replaceAttributeSchema} — the point of this method is that an admin can read back
     * exactly what that one is allowed to write, including for a deactivated sport.
     *
     * <p>Shares {@link #toAttributeSchema} with {@link #getAttributeSchema}, so a document that no
     * longer deserialises fails here the same way and still cannot take the cached catalogue down.
     */
    @Override
    @Transactional(readOnly = true)
    public SportAttributeSchema getAttributeSchemaForAdmin(Long sportId) {
        Sport sport = sportRepository.findById(sportId)
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", sportId));
        return toAttributeSchema(sport.getAttributesSchema());
    }

    /**
     * {@inheritDoc}
     *
     * <p>Validates first, writes second: {@link SportAttributeSchemaValidator} throws on the first
     * violation, so an invalid document never reaches {@code save()} and never half-applies.
     *
     * <p>Resolves the sport with {@code findById} rather than the active-only cache, matching
     * {@code updateSport}/{@code deleteSport} — admin writes deliberately bypass the cache, which
     * holds active sports only, so an inactive sport's schema stays editable. Evicts afterwards for
     * the same reason every other admin write here does.
     */
    @Override
    @Transactional
    public SportAttributeSchema replaceAttributeSchema(Long sportId, SportAttributeSchema schema) {
        Sport sport = sportRepository.findById(sportId)
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", sportId));

        schemaValidator.validate(schema);

        sport.setAttributesSchema(schema == null
                ? null
                : objectMapper.convertValue(schema, new TypeReference<Map<String, Object>>() {
                }));
        Sport saved = sportRepository.save(sport);
        sportLookupCache.evictAll();

        log.info("Replaced attribute schema for sport {}", sportId);
        return toAttributeSchema(saved.getAttributesSchema());
    }

    /**
     * Converts the stored untyped document into the typed DTO tree.
     *
     * <p>Returns {@code null} for a sport with no schema, which callers treat as "offers no
     * attributes" rather than as an error.
     */
    private SportAttributeSchema toAttributeSchema(Map<String, Object> stored) {
        if (stored == null || stored.isEmpty()) {
            return null;
        }
        return objectMapper.convertValue(stored, SportAttributeSchema.class);
    }
}
