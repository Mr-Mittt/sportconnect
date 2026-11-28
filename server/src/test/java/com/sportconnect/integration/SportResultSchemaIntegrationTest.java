package com.sportconnect.integration;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-50 - the sport's result schema endpoints through the real {@code SportController}, the
 * method-security gate and {@code GlobalExceptionHandler}: the admin {@code PUT} and {@code GET /all},
 * the member {@code GET}, and the {@code SPORT_RESULT_SCHEMA_INVALID} rejection.
 */
class SportResultSchemaIntegrationTest extends BaseIT {

    private static final String VALID = "{\"kind\":\"MATCH\",\"maxRecords\":100,"
            + "\"labels\":{\"en\":\"Game\",\"vi\":\"Trận\"}}";

    @Autowired private SportRepository sportRepository;
    @Autowired private CacheManager cacheManager;

    private Long sportId;

    @BeforeEach
    void setUp() {
        sportRepository.deleteAll();
        sportId = sportRepository.save(Sport.builder().name("SESSION-50 schema " + UUID.randomUUID()).isActive(true).build()).getId();
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
    void put_rejectsNonAdmin_withForbidden() throws Exception {
        authenticateAs(UUID.randomUUID());
        mockMvc.perform(put("/api/sports/{id}/result-schema", sportId).contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isForbidden());
        assertThat(sportRepository.findById(sportId).orElseThrow().getResultSchema()).isNull();
    }

    @Test
    void put_rejectsAnonymous_withUnauthorized() throws Exception {
        mockMvc.perform(put("/api/sports/{id}/result-schema", sportId).contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminGetAll_rejectsNonAdmin_withForbidden() throws Exception {
        authenticateAs(UUID.randomUUID());
        mockMvc.perform(get("/api/sports/all/{id}/result-schema", sportId)).andExpect(status().isForbidden());
    }

    @Test
    void adminPut_storesTheDocumentAsSent_andAdminGetReadsItBack() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{id}/result-schema", sportId).contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.kind").value("MATCH"))
                .andExpect(jsonPath("$.data.labels.vi").value("Trận"));

        mockMvc.perform(get("/api/sports/all/{id}/result-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.maxRecords").value(100));
    }

    @Test
    void memberGet_returnsTheSchema_andNullWhenTheSportHasNone() throws Exception {
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(get("/api/sports/{id}/result-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());

        sport.setResultSchema(java.util.Map.of("kind", "MATCH"));
        sportRepository.save(sport);
        evictSportCache();

        mockMvc.perform(get("/api/sports/{id}/result-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.kind").value("MATCH"));
    }

    @Test
    void memberGet_ofAnInactiveSport_is404SportNotFound() throws Exception {
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setIsActive(false);
        sportRepository.save(sport);
        evictSportCache();
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(get("/api/sports/{id}/result-schema", sportId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SPORT_NOT_FOUND"));
    }

    @Test
    void adminPut_rejectsOutOfRangeLimits_withSportResultSchemaInvalid() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{id}/result-schema", sportId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"MATCH\",\"maxRecords\":501}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SPORT_RESULT_SCHEMA_INVALID"));
        assertThat(sportRepository.findById(sportId).orElseThrow().getResultSchema()).isNull();
    }

    // ---- SESSION-84: the statistics side of the schema is checked at the save --------------------------------------------------

    private String competitive(String scoreboard) {
        return "{\"version\":1,\"maxRecords\":100,\"record\":{\"data\":{\"type\":\"COMPETITIVE\"},\"scoreboard\":" + scoreboard + "}}";
    }

    @Test
    void adminPut_refusesAFormulaListedWithADisabledOperand_andAnUnknownOrMalformedStatConfig() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");
        String[][] cases = {
                // a listed formula needs its operands
                {"{\"columns\":[\"games\",\"wins\",\"winRate\"],\"config\":{\"games\":{\"enabled\":false}}}", "winRate but its operand games is disabled"},
                {"{\"columns\":[\"winDiff\"],\"config\":{\"losses\":{\"enabled\":false}}}", "winDiff but its operand losses is disabled"},
                // the shape of the config
                {"{\"columns\":[\"games\"],\"config\":[]}", "config must be an object"},
                {"{\"columns\":[\"games\"],\"config\":{\"speed\":{\"enabled\":false}}}", "speed is not a stat"},
                {"{\"columns\":[\"games\"],\"config\":{\"games\":true}}", "games must be an object"},
                {"{\"columns\":[\"games\"],\"config\":{\"games\":{\"enabled\":\"no\"}}}", "enabled must be true or false"},
                {"{\"columns\":[\"games\"],\"config\":{\"games\":{\"when\":[\"joined\"]}}}", "when is not a setting of games"},
                {"{\"columns\":[\"sessions\"],\"config\":{\"sessions\":{\"when\":[\"played\"]}}}", "WHEN_INVALID"},
                {"{\"columns\":[\"sessions\"],\"config\":{\"sessions\":{\"combine\":\"XOR\"}}}", "COMBINE_INVALID"}};
        for (String[] oneCase : cases) {
            mockMvc.perform(put("/api/sports/{id}/result-schema", sportId).contentType(MediaType.APPLICATION_JSON)
                            .content(competitive(oneCase[0])))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("SPORT_RESULT_SCHEMA_INVALID"))
                    .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(oneCase[1])));
        }
        assertThat(sportRepository.findById(sportId).orElseThrow().getResultSchema()).as("nothing was stored").isNull();
    }

    @Test
    void adminPut_acceptsADisabledStatThatNoListedFormulaNeeds_andAConfigOfAnotherRecordTypeIsNotChecked() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{id}/result-schema", sportId).contentType(MediaType.APPLICATION_JSON)
                        .content(competitive("{\"columns\":[\"games\",\"wins\",\"sessions\"],\"config\":{\"losses\":{\"enabled\":false},"
                                + "\"sessions\":{\"enabled\":true,\"when\":[\"joined\",\"atLeast1Game\"],\"combine\":\"AND\"}}}")))
                .andExpect(status().isOk());
        mockMvc.perform(put("/api/sports/{id}/result-schema", sportId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\":1,\"record\":{\"data\":{\"type\":\"RACE\"},\"scoreboard\":{\"config\":{\"speed\":1}}}}"))
                .andExpect(status().isOk());
    }

    @Test
    void adminPut_ofAnUnknownSport_is404() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{id}/result-schema", 999999L).contentType(MediaType.APPLICATION_JSON).content(VALID))
                .andExpect(status().isNotFound());
    }

    @Test
    void adminPut_withNoBody_clearsTheSchema() throws Exception {
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setResultSchema(java.util.Map.of("kind", "MATCH"));
        sportRepository.save(sport);
        evictSportCache();
        authenticateAs(UUID.randomUUID(), "ADMIN");

        mockMvc.perform(put("/api/sports/{id}/result-schema", sportId).contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk());
        assertThat(sportRepository.findById(sportId).orElseThrow().getResultSchema()).isNull();
    }
}
