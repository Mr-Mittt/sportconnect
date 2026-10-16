package com.sportconnect.notification.config

import com.sportconnect.auth.api.service.JwtTokenService
import com.sportconnect.user.api.dto.UserAccessState
import com.sportconnect.user.api.service.UserService
import org.springframework.messaging.Message
import org.springframework.messaging.simp.stomp.StompCommand
import org.springframework.messaging.simp.stomp.StompHeaderAccessor
import org.springframework.messaging.support.MessageBuilder
import spock.lang.Specification
import spock.lang.Subject

class StompAuthChannelInterceptorSpec extends Specification {

    JwtTokenService jwtTokenService = Mock()
    UserService userService = Mock()

    @Subject
    StompAuthChannelInterceptor interceptor = new StompAuthChannelInterceptor(jwtTokenService, userService)

    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000123")

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
        jwtTokenService.getUserIdFromToken("good-token") >> USER_ID.toString()
        userService.getAccessState(USER_ID) >> Optional.of(new UserAccessState(true, ["USER"]))

        when:
        interceptor.preSend(message, null)

        then:
        def accessor = StompHeaderAccessor.wrap(message)
        accessor.getUser().getName() == USER_ID.toString()
    }

    def "preSend rejects a valid token of a deactivated user, an unprovisioned subject, or a subject that is not a UUID (A28)"() {
        given:
        def message = connectFrame("Bearer good-token")
        jwtTokenService.validateToken("good-token") >> true
        jwtTokenService.isTokenExpired("good-token") >> false
        jwtTokenService.getUserIdFromToken("good-token") >> subject
        userService.getAccessState(USER_ID) >> state

        when:
        interceptor.preSend(message, null)

        then:
        thrown(StompAuthChannelInterceptor.StompAuthenticationException)
        StompHeaderAccessor.wrap(message).getUser() == null

        where:
        subject             | state
        USER_ID.toString()  | Optional.of(new UserAccessState(false, ["USER"]))
        USER_ID.toString()  | Optional.empty()
        "not-a-uuid"        | Optional.empty()
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
