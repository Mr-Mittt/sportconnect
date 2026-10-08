package com.sportconnect.integration;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A7 end-to-end coverage of the app's anonymous surface, through the real {@code SecurityConfig}
 * filter chain (no handler logic is asserted — only whether an anonymous caller is let past the
 * filter chain).
 *
 * <p>Before A7, {@code /api/auth/**}, {@code /api/sports/**} and {@code GET /api/hashtags/**} /
 * {@code /api/posts/hashtag/**} were blanket {@code permitAll}: an anonymous caller reached the
 * handler on every path under them, and the real gating was left to {@code @PreAuthorize}, which
 * answered 403 instead of 401 (and left any endpoint added there later public by default). This
 * class pins the new shape: the public surface is an explicit list, everything else under those
 * paths is rejected by the filter chain with the entry point's 401.
 *
 * <p>Two different 401s exist and must not be confused: the filter chain's
 * ({@code JwtAuthenticationEntryPoint}, message {@code "Unauthorized: ..."}, no {@code errorCode})
 * and an application one thrown by a handler (e.g. {@code POST /api/auth/refresh} with no cookie →
 * {@code REFRESH_TOKEN_MISSING}). {@link #reachedHandler} tells them apart, so a public endpoint
 * that answers 401 on its own terms still counts as public.
 */
class PublicSurfaceAccessIntegrationTest extends BaseIT {

    /** The filter chain rejected the request before any controller ran. */
    private static void assertRejectedByFilterChain(ResultActions actions) throws Exception {
        actions.andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("Unauthorized")));
    }

    /** An anonymous request got past the filter chain: not a 403, and not the entry point's 401. */
    private static void assertReachedHandler(MvcResult result) throws Exception {
        int status = result.getResponse().getStatus();
        assertThat(status).as("anonymous request was forbidden").isNotEqualTo(403);
        if (status == 401) {
            assertThat(result.getResponse().getContentAsString())
                    .as("a 401 here must come from the handler (carries an errorCode), not the filter chain")
                    .contains("\"errorCode\"");
        }
    }

    // ---- Still public: the explicit auth list --------------------------------------------------

    @Test
    void publicAuthEndpoints_areReachableAnonymously() throws Exception {
        for (String path : new String[] {
                "/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/verify-email",
                "/api/auth/forgot-password", "/api/auth/reset-password"}) {
            assertReachedHandler(mockMvc.perform(post(path).with(anonymous())
                            .contentType(MediaType.APPLICATION_JSON).content("{}"))
                    .andReturn());
        }
    }

    @Test
    void oauthTokenHelper_isReachableAnonymously() throws Exception {
        assertReachedHandler(mockMvc.perform(post("/api/auth/oauth-token").with(anonymous())
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("username", "nobody@example.com").param("password", "wrong"))
                .andReturn());
    }

    @Test
    void referenceData_staysPublic() throws Exception {
        assertReachedHandler(mockMvc.perform(get("/api/reference/countries").with(anonymous())).andReturn());
    }

    // ---- No longer public ----------------------------------------------------------------------

    @Test
    void anAuthPathNotOnTheList_isNoLongerPublic() throws Exception {
        // The reason for the explicit list: a new /api/auth/* endpoint (or any method on a listed
        // path other than the listed POST) defaults to authenticated instead of silently public.
        assertRejectedByFilterChain(mockMvc.perform(post("/api/auth/something-new").with(anonymous())
                .contentType(MediaType.APPLICATION_JSON).content("{}")));
        assertRejectedByFilterChain(mockMvc.perform(get("/api/auth/login").with(anonymous())));
    }

    @Test
    void logout_stillRequiresAuthentication() throws Exception {
        assertRejectedByFilterChain(mockMvc.perform(post("/api/auth/logout").with(anonymous())));
    }

    @Test
    void sportsCatalogueReads_requireAuthentication() throws Exception {
        assertRejectedByFilterChain(mockMvc.perform(get("/api/sports").with(anonymous())));
        assertRejectedByFilterChain(mockMvc.perform(get("/api/sports/1").with(anonymous())));
        assertRejectedByFilterChain(mockMvc.perform(get("/api/sports/category/RACKET").with(anonymous())));
    }

    @Test
    void gatedSportsEndpoints_answer401NotHandlerLevel403_toAnonymous() throws Exception {
        // These carry @PreAuthorize, which used to be the only gate (the path was permitAll), so an
        // anonymous caller got a 403 from the handler. Now the filter chain answers 401 first.
        assertRejectedByFilterChain(mockMvc.perform(get("/api/sports/all").with(anonymous())));
        assertRejectedByFilterChain(mockMvc.perform(get("/api/sports/1/attribute-schema").with(anonymous())));
        assertRejectedByFilterChain(mockMvc.perform(get("/api/sports/1/session-attribute-schema").with(anonymous())));
        assertRejectedByFilterChain(mockMvc.perform(get("/api/sports/profiles").with(anonymous())));
        assertRejectedByFilterChain(mockMvc.perform(post("/api/sports").with(anonymous())
                .contentType(MediaType.APPLICATION_JSON).content("{}")));
        assertRejectedByFilterChain(mockMvc.perform(put("/api/sports/1").with(anonymous())
                .contentType(MediaType.APPLICATION_JSON).content("{}")));
        assertRejectedByFilterChain(mockMvc.perform(delete("/api/sports/profiles/1").with(anonymous())));
    }

    @Test
    void hashtagReads_requireAuthentication() throws Exception {
        assertRejectedByFilterChain(mockMvc.perform(get("/api/hashtags/trending").with(anonymous())));
        assertRejectedByFilterChain(mockMvc.perform(get("/api/hashtags/suggest").param("q", "fo").with(anonymous())));
        assertRejectedByFilterChain(mockMvc.perform(get("/api/posts/hashtag/football").with(anonymous())));
    }

    // ---- An authenticated caller still gets through --------------------------------------------

    @Test
    void sportsCatalogue_isStillServedToAnAuthenticatedUser() throws Exception {
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(get("/api/sports"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }
}
