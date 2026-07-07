package com.sportconnect.common.exception

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController
import spock.lang.Specification

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * No Spring context exists in this library module (no @SpringBootConfiguration), so this uses
 * MockMvc's standalone setup against a test-only dummy controller instead of @WebMvcTest.
 */
class GlobalExceptionHandlerSpec extends Specification {

    static class SampleRequest {
        @NotBlank(message = "name must not be blank")
        String name
    }

    @RestController
    static class DummyController {
        @GetMapping("/test/bad-request")
        void badRequest() { throw new BadRequestException("bad input") }

        @GetMapping("/test/forbidden")
        void forbidden() { throw new ForbiddenException("no access") }

        @GetMapping("/test/unauthorized")
        void unauthorized() { throw new UnauthorizedException("not logged in") }

        @GetMapping("/test/not-found")
        void notFound() { throw new NotFoundException("missing") }

        @GetMapping("/test/resource-not-found")
        void resourceNotFound() { throw new ResourceNotFoundException("Thing", "id", "123") }

        @GetMapping("/test/generic")
        void generic() { throw new RuntimeException("boom, internal details here") }

        @PostMapping("/test/validated")
        void validated(@Valid @RequestBody SampleRequest request) { }
    }

    MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new DummyController())
            .setControllerAdvice(new GlobalExceptionHandler())
            .build()

    def "BadRequestException maps to 400 with ApiResponse shape"() {
        expect:
        mockMvc.perform(get("/test/bad-request"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("bad input"))
    }

    def "ForbiddenException maps to 403"() {
        expect:
        mockMvc.perform(get("/test/forbidden"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("no access"))
    }

    def "UnauthorizedException maps to 401"() {
        expect:
        mockMvc.perform(get("/test/unauthorized"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath('$.message').value("not logged in"))
    }

    def "NotFoundException maps to 404"() {
        expect:
        mockMvc.perform(get("/test/not-found"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath('$.message').value("missing"))
    }

    def "ResourceNotFoundException maps to 404 with the formatted message"() {
        expect:
        mockMvc.perform(get("/test/resource-not-found"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath('$.message').value("Thing not found with id: '123'"))
    }

    def "MethodArgumentNotValidException maps to 400 with field-level errors"() {
        expect:
        mockMvc.perform(post("/test/validated")
                .contentType(MediaType.APPLICATION_JSON)
                .content('{"name": ""}'))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("Validation failed"))
                .andExpect(jsonPath('$.data.name').value("name must not be blank"))
    }

    def "generic Exception maps to 500 without leaking the real message"() {
        expect:
        mockMvc.perform(get("/test/generic"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("An unexpected error occurred"))
    }
}
