package com.sportconnect.notification.config

import com.sportconnect.auth.api.service.JwtTokenService
import org.springframework.messaging.Message
import org.springframework.messaging.simp.stomp.StompCommand
import org.springframework.messaging.simp.stomp.StompHeaderAccessor
import org.springframework.messaging.support.MessageBuilder
import spock.lang.Specification
import spock.lang.Subject

class StompAuthChannelInterceptorSpec extends Specification {

    JwtTokenService jwtTokenService = Mock()

    @Subject
    StompAuthChannelInterceptor interceptor = new StompAuthChannelInterceptor(jwtTokenService)

    private static Message<byte[]> connectFrame(String authorizationHeader) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT)
        if (authorizationHeader != null) {
            accessor.addNativeHeader("Authorization", authorizationHeader)
        }
        // Mirrors what the real STOMP inbound channel does: leave the accessor mutable so
        // preSend's setUser() call — via the same accessor instance retrieved by
        // MessageHeaderAccessor.getAccessor — actually takes effect instead of hitting a frozen,
        // already-immutable MessageHeaders map.
        accessor.setLeaveMutable(true)
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders())
    }

    def "preSend sets the Principal to the token's user id when the token is valid"() {
        given:
        def message = connectFrame("Bearer good-token")
        jwtTokenService.validateToken("good-token") >> true
        jwtTokenService.isTokenExpired("good-token") >> false
        jwtTokenService.getUserIdFromToken("good-token") >> "user-123"

        when:
        interceptor.preSend(message, null)

        then:
        def accessor = StompHeaderAccessor.wrap(message)
        accessor.getUser().getName() == "user-123"
    }

    def "preSend rejects a CONNECT frame with no Authorization header"() {
        given:
        def message = connectFrame(null)

        when:
        interceptor.preSend(message, null)

        then:
        thrown(StompAuthChannelInterceptor.StompAuthenticationException)
        0 * jwtTokenService._
    }

    def "preSend rejects a CONNECT frame whose token fails signature validation"() {
        given:
        def message = connectFrame("Bearer bad-token")
        jwtTokenService.validateToken("bad-token") >> false

        when:
        interceptor.preSend(message, null)

        then:
        thrown(StompAuthChannelInterceptor.StompAuthenticationException)
    }

    def "preSend rejects a CONNECT frame whose token is expired"() {
        given:
        def message = connectFrame("Bearer expired-token")
        jwtTokenService.validateToken("expired-token") >> true
        jwtTokenService.isTokenExpired("expired-token") >> true

        when:
        interceptor.preSend(message, null)

        then:
        thrown(StompAuthChannelInterceptor.StompAuthenticationException)
    }

    def "preSend passes non-CONNECT frames through untouched, without calling JwtTokenService"() {
        given:
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SEND)
        def message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders())

        when:
        def result = interceptor.preSend(message, null)

        then:
        result.is(message)
        0 * jwtTokenService._
    }
}
