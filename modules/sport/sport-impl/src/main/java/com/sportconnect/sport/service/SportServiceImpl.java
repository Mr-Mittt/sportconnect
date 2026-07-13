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
        log.info("Created new sport: {}", savedSport.getName());
        return toSportResponse(savedSport);
    }

    @Override
    @Transactional(readOnly = true)
    public SportResponse getSportById(Long sportId) {
        Sport sport = sportRepository.findById(sportId)
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", sportId));
        return toSportResponse(sport);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, SportResponse> getSportsByIds(List<Long> sportIds) {
        return sportRepository.findAllById(sportIds).stream()
                .collect(Collectors.toMap(Sport::getId, this::toSportResponse));
    }

    @Override
    @Transactional(readOnly = true)
    public List<SportResponse> getAllActiveSports() {
        return sportRepository.findByIsActiveTrue().stream()
                .map(this::toSportResponse)
                .collect(Collectors.toList());
    }

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
        log.info("Updated sport: {}", updatedSport.getName());
        return toSportResponse(updatedSport);
    }

    @Override
    @Transactional
    public void deleteSport(Long sportId) {
        Sport sport = sportRepository.findById(sportId)
                .orElseThrow(() -> new ResourceNotFoundException("Sport", "id", sportId));
        sport.setIsActive(false);
        sportRepository.save(sport);
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
