package com.sportconnect.common.exception

import com.sportconnect.common.dto.ApiResponse
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import spock.lang.Specification

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * No Spring context exists in this library module (no @SpringBootConfiguration), so this uses
 * MockMvc's standalone setup against a test-only dummy controller instead of @WebMvcTest.
 *
 * <p>Two groups: our own shared exceptions (mapped by explicit {@code @ExceptionHandler} methods),
 * and Spring MVC framework exceptions (mapped by the inherited {@code ResponseEntityExceptionHandler}
 * handlers, re-enveloped by {@code handleExceptionInternal} — C4). The no-handler &rarr; 404 case
 * needs the real dispatch pipeline (a static-resource handler that standalone MockMvc doesn't
 * register), so it lives in {@code GlobalExceptionMappingIntegrationTest}, not here.
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

        @GetMapping("/test/coded-bad-request")
        void codedBadRequest() {
            throw new BadRequestException("WIDGET_TOO_SMALL", "Widget must be at least 5", [min: 5])
        }

        @GetMapping("/test/coded-forbidden")
        void codedForbidden() { throw new ForbiddenException("WIDGET_NOT_OWNER", "Not your widget", null) }

        @GetMapping("/test/coded-unauthorized")
        void codedUnauthorized() { throw new UnauthorizedException("WIDGET_SESSION_GONE", "Session gone", null) }

        @GetMapping("/test/coded-not-found")
        void codedNotFound() { throw new NotFoundException("WIDGET_NOT_FOUND", "Widget missing", [id: 7]) }

        @GetMapping("/test/coded-resource-not-found")
        void codedResourceNotFound() { throw ResourceNotFoundException.coded("WIDGET_GONE", "Widget gone", null) }

        @GetMapping("/test/conflict")
        void conflict() { throw new ConflictException("WIDGET_DUPLICATE", "Widget already exists", [name: "w"]) }

        @GetMapping("/test/uncoded-conflict")
        void uncodedConflict() { throw new ConflictException("clash") }

        @GetMapping("/test/empty-params")
        void emptyParams() { throw new BadRequestException("WIDGET_X", "x", [:]) }

        @GetMapping("/test/ok")
        ApiResponse<String> ok() { ApiResponse.success("fine") }

        @GetMapping("/test/generic")
        void generic() { throw new RuntimeException("boom, internal details here") }

        @PostMapping("/test/validated")
        void validated(@Valid @RequestBody SampleRequest request) { }

        // Named explicitly: Groovy-compiled classes don't retain parameter names the way javac
        // does for the real controllers, so an unnamed @RequestParam here throws a different
        // exception (IllegalArgumentException, not MissingServletRequestParameterException) than
        // it does in production Java code — this would falsely fail through to the 500 catch-all.
        @GetMapping("/test/required-param")
        void requiredParam(@RequestParam("sportId") Long sportId) { }

        @GetMapping("/test/typed/{id}")
        void typed(@PathVariable("id") Long id) { }
    }

    MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new DummyController())
            .setControllerAdvice(new GlobalExceptionHandler())
            .build()

    // ---- our own shared exceptions ----

    def "BadRequestException maps to 400 with ApiResponse shape"() {
        expect:
        mockMvc.perform(get("/test/bad-request"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("bad input"))
                .andExpect(jsonPath('$.errorCode').doesNotExist())
                .andExpect(jsonPath('$.errorParams').doesNotExist())
    }

    def "a success response does not gain errorCode or errorParams keys (C12)"() {
        expect:
        mockMvc.perform(get("/test/ok"))
                .andExpect(status().isOk())
                .andExpect(jsonPath('$.data').value("fine"))
                .andExpect(jsonPath('$.errorCode').doesNotExist())
                .andExpect(jsonPath('$.errorParams').doesNotExist())
    }

    def "a coded BadRequestException puts errorCode and errorParams on the wire"() {
        expect:
        mockMvc.perform(get("/test/coded-bad-request"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath('$.message').value("Widget must be at least 5"))
                .andExpect(jsonPath('$.errorCode').value("WIDGET_TOO_SMALL"))
                .andExpect(jsonPath('$.errorParams.min').value(5))
                .andExpect(jsonPath('$.data').doesNotExist())
    }

    def "a coded ForbiddenException keeps 403 and carries its code without params"() {
        expect:
        mockMvc.perform(get("/test/coded-forbidden"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath('$.errorCode').value("WIDGET_NOT_OWNER"))
                .andExpect(jsonPath('$.errorParams').doesNotExist())
    }

    def "a coded UnauthorizedException keeps 401 and carries its code"() {
        expect:
        mockMvc.perform(get("/test/coded-unauthorized"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath('$.errorCode').value("WIDGET_SESSION_GONE"))
    }

    def "a coded NotFoundException keeps 404 and carries code and params"() {
        expect:
        mockMvc.perform(get("/test/coded-not-found"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath('$.errorCode').value("WIDGET_NOT_FOUND"))
                .andExpect(jsonPath('$.errorParams.id').value(7))
    }

    def "a coded ResourceNotFoundException keeps 404 and carries its code"() {
        expect:
        mockMvc.perform(get("/test/coded-resource-not-found"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath('$.errorCode').value("WIDGET_GONE"))
    }

    def "ConflictException maps to 409 with its code and params"() {
        expect:
        mockMvc.perform(get("/test/conflict"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("Widget already exists"))
                .andExpect(jsonPath('$.errorCode').value("WIDGET_DUPLICATE"))
                .andExpect(jsonPath('$.errorParams.name').value("w"))
    }

    def "an un-coded ConflictException is 409 with message only"() {
        expect:
        mockMvc.perform(get("/test/uncoded-conflict"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath('$.message').value("clash"))
                .andExpect(jsonPath('$.errorCode').doesNotExist())
    }

    def "empty errorParams are omitted rather than serialized as {}"() {
        expect:
        mockMvc.perform(get("/test/empty-params"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath('$.errorCode').value("WIDGET_X"))
                .andExpect(jsonPath('$.errorParams').doesNotExist())
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

    def "MethodArgumentNotValidException maps to 400 with errorParams.fields and no data"() {
        expect:
        mockMvc.perform(post("/test/validated")
                .contentType(MediaType.APPLICATION_JSON)
                .content('{"name": ""}'))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("Validation failed"))
                .andExpect(jsonPath('$.errorCode').value("VALIDATION_FAILED"))
                .andExpect(jsonPath('$.errorParams.fields.name').value("name must not be blank"))
                .andExpect(jsonPath('$.data').doesNotExist())
    }

    def "MissingServletRequestParameterException maps to 400, not the 500 catch-all"() {
        expect:
        mockMvc.perform(get("/test/required-param"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("sportId is required"))
                .andExpect(jsonPath('$.errorCode').value("MISSING_PARAMETER"))
                .andExpect(jsonPath('$.errorParams.param').value("sportId"))
    }

    def "generic Exception maps to 500 without leaking the real message"() {
        expect:
        mockMvc.perform(get("/test/generic"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("An unexpected error occurred"))
                .andExpect(jsonPath('$.errorCode').value("INTERNAL_ERROR"))
    }

    // ---- Spring MVC framework exceptions (C4: were all 500 via the Exception catch-all) ----

    def "wrong HTTP method maps to 405 with the ApiResponse envelope"() {
        expect:
        mockMvc.perform(put("/test/bad-request"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("Request method not supported"))
                .andExpect(jsonPath('$.errorCode').value("METHOD_NOT_ALLOWED"))
                .andExpect(jsonPath('$.data').doesNotExist())
    }

    def "unsupported Content-Type on a @RequestBody endpoint maps to 415"() {
        expect:
        mockMvc.perform(post("/test/validated")
                .contentType(MediaType.TEXT_PLAIN)
                .content("not json"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("Unsupported media type"))
                .andExpect(jsonPath('$.errorCode').value("UNSUPPORTED_MEDIA_TYPE"))
    }

    def "unreadable JSON body maps to 400"() {
        expect:
        mockMvc.perform(post("/test/validated")
                .contentType(MediaType.APPLICATION_JSON)
                .content('{ broken'))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("Malformed request"))
                .andExpect(jsonPath('$.errorCode').value("MALFORMED_REQUEST"))
    }

    def "path variable that can't bind to the declared type maps to 400"() {
        expect:
        mockMvc.perform(get("/test/typed/abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath('$.success').value(false))
                .andExpect(jsonPath('$.message').value("Malformed request"))
                .andExpect(jsonPath('$.errorCode').value("MALFORMED_REQUEST"))
    }
}
