package com.sportconnect.auth.security

import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import spock.lang.Specification
import spock.lang.Subject

/**
 * Regression coverage added 2026-07-27 — this filter had zero tests before, and is exactly where
 * two real bugs were found live (see PROGRESS.md / services/chat/docs/SYNC_DESIGN.md):
 * a status-code bug (403 was becoming 401 via response.sendError's container error-dispatch,
 * fixed by writing the response directly instead) and a scope bug ({@code @Component} making this
 * filter apply to every request in the app, fixed by never registering it as a Spring bean — see
 * InternalServiceFilterScopeIT in server's test tree for that half, which a plain unit test here
 * structurally cannot catch on its own).
 */
class InternalServiceAuthFilterSpec extends Specification {

    private static final String HEADER = "X-Internal-Service-Secret"

    def "allows the request through when the correct secret is provided"() {
        given:
        def filter = new InternalServiceAuthFilter("correct-secret")
        def request = new MockHttpServletRequest()
        request.addHeader(HEADER, "correct-secret")
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()

        when:
        filter.doFilterInternal(request, response, filterChain)

        then: "the chain proceeds — MockFilterChain records the request it was called with"
        filterChain.request != null
        response.status == 200 // MockHttpServletResponse's default, never touched by the filter
    }

    def "rejects with 403 and the expected body when the secret is missing"() {
        given:
        def filter = new InternalServiceAuthFilter("correct-secret")
        def request = new MockHttpServletRequest()
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()

        when:
        filter.doFilterInternal(request, response, filterChain)

        then: "the chain never proceeds"
        filterChain.request == null

        and:
        response.status == 403
        response.contentType == "application/json"
        response.contentAsString.contains("Invalid or missing internal service secret")
    }

    def "rejects with 403 when the wrong secret is provided"() {
        given:
        def filter = new InternalServiceAuthFilter("correct-secret")
        def request = new MockHttpServletRequest()
        request.addHeader(HEADER, "wrong-secret")
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()

        when:
        filter.doFilterInternal(request, response, filterChain)

        then:
        filterChain.request == null
        response.status == 403
    }

    def "rejects every request, even with a header, when the configured secret itself is blank"() {
        // A misconfigured deployment (empty app.internal-service-secret) must fail closed, not
        // accidentally accept any header value — StringUtils.hasText(expectedSecret) guards this.
        given:
        def filter = new InternalServiceAuthFilter(blankSecret)
        def request = new MockHttpServletRequest()
        request.addHeader(HEADER, "anything")
        def response = new MockHttpServletResponse()
        def filterChain = new MockFilterChain()

        when:
        filter.doFilterInternal(request, response, filterChain)

        then:
        filterChain.request == null
        response.status == 403

        where:
        blankSecret << ["", "   ", null]
    }
}
