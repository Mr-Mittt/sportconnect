package com.sportconnect.location.service

import com.sportconnect.common.exception.BadRequestException
import spock.lang.Specification
import spock.lang.Subject
import spock.lang.Unroll

import java.net.http.HttpClient
import java.net.http.HttpResponse

class GoogleMapsUrlResolverSpec extends Specification {

    HttpClient httpClient = Mock()

    @Subject
    GoogleMapsUrlResolver resolver = new GoogleMapsUrlResolver(httpClient)

    def "rejects a non-Google host without making any network call"() {
        when:
        resolver.resolve("https://evil.example.com/maps/@37.42,-122.08,17z")

        then:
        0 * httpClient.send(*_)
        thrown(BadRequestException)
    }

    def "rejects a malformed URL"() {
        when:
        resolver.resolve("not a url")

        then:
        thrown(BadRequestException)
    }

    @Unroll
    def "extracts coordinates from a full Google Maps URL: #description"() {
        when:
        def result = resolver.resolve(url)

        then:
        0 * httpClient.send(*_)
        result.latitude() == expectedLat
        result.longitude() == expectedLng

        where:
        description         | url                                                                                   || expectedLat | expectedLng
        "precise place pin" | "https://www.google.com/maps/place/Some+Place/@37.1,-122.1,17z/data=!3d37.4224764!4d-122.0842499" || 37.4224764d | -122.0842499d
        "viewport center"   | "https://www.google.com/maps/@37.4224764,-122.0842499,17z"                          || 37.4224764d | -122.0842499d
        "query param"       | "https://maps.google.com/?q=37.4224764,-122.0842499"                                 || 37.4224764d | -122.0842499d
    }

    def "returns null coordinates (not an error) when nothing can be parsed from a full URL"() {
        when:
        def result = resolver.resolve("https://www.google.com/maps/place/Somewhere/")

        then:
        result.latitude() == null
        result.longitude() == null
    }

    def "extracts a best-effort suggested name from the place path segment"() {
        when:
        def result = resolver.resolve("https://www.google.com/maps/place/Riverside+Sports+Complex/@37.1,-122.1,17z")

        then:
        result.suggestedName() == "Riverside Sports Complex"
    }

    def "follows a short-link redirect within the allowlist and extracts coordinates from the resolved URL"() {
        given:
        HttpResponse<Void> redirectResponse = Mock()
        redirectResponse.statusCode() >> 302
        redirectResponse.headers() >> java.net.http.HttpHeaders.of(
                ["Location": ["https://www.google.com/maps/@37.4224764,-122.0842499,17z"]],
                { a, b -> true })

        when:
        def result = resolver.resolve("https://maps.app.goo.gl/abc123")

        then:
        1 * httpClient.send(*_) >> redirectResponse
        result.latitude() == 37.4224764d
        result.longitude() == -122.0842499d
    }

    def "refuses to follow a redirect to a host outside the allowlist"() {
        given:
        HttpResponse<Void> redirectResponse = Mock()
        redirectResponse.statusCode() >> 302
        redirectResponse.headers() >> java.net.http.HttpHeaders.of(
                ["Location": ["https://evil.example.com/steal"]],
                { a, b -> true })

        when:
        def result = resolver.resolve("https://maps.app.goo.gl/abc123")

        then:
        1 * httpClient.send(*_) >> redirectResponse
        result.latitude() == null
        result.longitude() == null
    }

    def "stops resolving gracefully when the HTTP call fails, instead of throwing"() {
        when:
        def result = resolver.resolve("https://maps.app.goo.gl/abc123")

        then:
        1 * httpClient.send(*_) >> { throw new java.io.IOException("boom") }
        result.latitude() == null
        result.longitude() == null
    }
}
