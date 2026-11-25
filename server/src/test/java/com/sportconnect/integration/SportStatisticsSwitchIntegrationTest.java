package com.sportconnect.integration;

import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-53 rework: the sport's statistics switch ({@code sports.statistics_enabled}) through the real
 * {@code SportController}, the method-security gate, the sport cache and the {@code SportService} the statistics runner and the
 * ranking proposal read: off by default, switched by an admin only, kept by an update that does not mention it, and seen by
 * the readers as soon as it is written (the cache is evicted by the write).
 */
class SportStatisticsSwitchIntegrationTest extends BaseIT {

    @Autowired private SportRepository sportRepository;
    @Autowired private SportService sportService;
    @Autowired private CacheManager cacheManager;

    private Long sportId;

    @BeforeEach
    void setUp() {
        sportRepository.deleteAll();
        sportId = sportRepository.save(Sport.builder().name("SESSION-53 switch " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
    }

    @AfterEach
    void tearDown() {
        sportRepository.deleteAll();
        evictSportCache();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    @Test
    void aSportIsOffByDefault_inTheDatabaseAndInTheMemberRead() throws Exception {
        assertThat(sportRepository.findById(sportId).orElseThrow().getStatisticsEnabled()).isFalse();
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(get("/api/sports/{id}", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.statisticsEnabled").value(false));
        assertThat(sportService.isStatisticsEnabled(sportId)).isFalse();
        assertThat(sportService.getStatisticsEnabledSportIds()).isEmpty();
    }

    @Test
    void anAdminSwitchesItOn_andOff_andTheReadersSeeEachChangeAtOnce() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");
        assertThat(sportService.getStatisticsEnabledSportIds()).isEmpty();      // fills the cache

        mockMvc.perform(put("/api/sports/{id}", sportId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"statisticsEnabled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.statisticsEnabled").value(true));

        assertThat(sportRepository.findById(sportId).orElseThrow().getStatisticsEnabled()).isTrue();
        assertThat(sportService.isStatisticsEnabled(sportId)).isTrue();
        assertThat(sportService.getStatisticsEnabledSportIds()).containsExactly(sportId);

        mockMvc.perform(put("/api/sports/{id}", sportId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"statisticsEnabled\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.statisticsEnabled").value(false));

        assertThat(sportService.isStatisticsEnabled(sportId)).isFalse();
        assertThat(sportService.getStatisticsEnabledSportIds()).isEmpty();
    }

    @Test
    void anUpdateThatDoesNotMentionTheSwitchLeavesItOn() throws Exception {
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setStatisticsEnabled(true);
        sportRepository.save(sport);
        evictSportCache();
        authenticateAs(UUID.randomUUID(), "ADMIN");

        mockMvc.perform(put("/api/sports/{id}", sportId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"description\":\"Racquet sport\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.statisticsEnabled").value(true));

        assertThat(sportService.isStatisticsEnabled(sportId)).isTrue();
    }

    @Test
    void aNonAdminCannotSwitchIt_andNothingChanges() throws Exception {
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(put("/api/sports/{id}", sportId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"statisticsEnabled\":true}"))
                .andExpect(status().isForbidden());

        assertThat(sportRepository.findById(sportId).orElseThrow().getStatisticsEnabled()).isFalse();
    }

    @Test
    void anAnonymousCallerCannotSwitchIt() throws Exception {
        mockMvc.perform(put("/api/sports/{id}", sportId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"statisticsEnabled\":true}"))
                .andExpect(status().isUnauthorized());

        assertThat(sportRepository.findById(sportId).orElseThrow().getStatisticsEnabled()).isFalse();
    }

    @Test
    void aNewSportIsOffUnlessTheAdminCreatesItOn() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        mockMvc.perform(post("/api/sports").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Padel " + UUID.randomUUID() + "\",\"category\":\"Racquet\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.statisticsEnabled").value(false));
        mockMvc.perform(post("/api/sports").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Squash " + UUID.randomUUID() + "\",\"category\":\"Racquet\",\"statisticsEnabled\":true}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.statisticsEnabled").value(true));
    }

    @Test
    void aDeactivatedSportIsNotInTheEnabledSetAndIsA404ForTheSingleRead() throws Exception {
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setStatisticsEnabled(true);
        sportRepository.save(sport);
        evictSportCache();
        assertThat(sportService.getStatisticsEnabledSportIds()).containsExactly(sportId);

        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{id}", sportId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"isActive\":false}"))
                .andExpect(status().isOk());

        assertThat(sportService.getStatisticsEnabledSportIds()).isEmpty();
        org.junit.jupiter.api.Assertions.assertThrows(com.sportconnect.common.exception.ResourceNotFoundException.class,
                () -> sportService.isStatisticsEnabled(sportId));
    }
}
