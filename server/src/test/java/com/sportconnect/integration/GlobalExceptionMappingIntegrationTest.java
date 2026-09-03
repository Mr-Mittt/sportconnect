package com.sportconnect.integration;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * C4 end-to-end: Spring MVC framework exceptions (no route, wrong method, bad media type, unreadable
 * body, un-bindable path variable) go through the real dispatch pipeline and come back as their
 * correct 4xx wrapped in this app's {@code ApiResponse} envelope — not the generic 500 the old
 * {@code @ExceptionHandler(Exception.class)} catch-all produced before {@code GlobalExceptionHandler}
 * extended {@code ResponseEntityExceptionHandler}.
 *
 * <p>{@code GlobalExceptionHandlerSpec} covers the 405 / 415 / 400 mappings with a standalone
 * {@code DummyController}; this class exists because the no-route &rarr; 404 case only fires with the
 * real {@code DispatcherServlet} + static-resource handler wiring (it throws
 * {@code NoResourceFoundException}, which standalone MockMvc can't reproduce). All paths here are
 * under {@code permitAll} prefixes, so the requests are anonymous and reach the dispatcher rather
 * than being stopped by the security filter chain.
 */
class GlobalExceptionMappingIntegrationTest extends BaseIT {

    @Test
    void unknownRoute_is404_withApiResponseEnvelope() throws Exception {
        mockMvc.perform(get("/api/auth/no-such-endpoint").with(anonymous()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Resource not found"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void wrongHttpMethod_is405() throws Exception {
        // /api/sports is mapped for GET (list) and POST (admin create) only.
        mockMvc.perform(delete("/api/sports").with(anonymous()))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Request method not supported"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void unsupportedContentType_is415() throws Exception {
        mockMvc.perform(post("/api/auth/login").with(anonymous())
                        .contentType(MediaType.TEXT_PLAIN)
                        .content("email=x"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Unsupported media type"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void unreadableJsonBody_is400() throws Exception {
        mockMvc.perform(post("/api/auth/login").with(anonymous())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ broken"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Malformed request"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void pathVariableTypeMismatch_is400() throws Exception {
        // GET /api/sports/{sportId} binds sportId to Long; "abc" can't convert.
        mockMvc.perform(get("/api/sports/abc").with(anonymous()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Malformed request"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }
}
