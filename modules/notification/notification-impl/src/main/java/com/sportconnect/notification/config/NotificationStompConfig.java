package com.sportconnect.notification.config;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

/**
 * NTF-3's live-delivery transport: Spring WebSocket STOMP in broker-relay mode, pointed at
 * RabbitMQ's STOMP plugin instead of the in-memory broker — see
 * {@code documentation/md/vision/NOTIFICATION_MODULE_VISION.md}'s Client delivery decision. Scoped
 * deliberately to web, in-app, connected-session delivery only (see that doc's hybrid-delivery
 * note) — this is not, and isn't meant to become, a mobile push mechanism.
 *
 * <p>No SockJS fallback — the target client (Vite/React 18) supports native WebSocket, and adding a
 * fallback for browsers that don't would be unused complexity.
 */
@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class NotificationStompConfig implements WebSocketMessageBrokerConfigurer {

    private final StompAuthChannelInterceptor stompAuthChannelInterceptor;

    @Value("${app.stomp-relay.host}")
    private String relayHost;

    @Value("${app.stomp-relay.port}")
    private int relayPort;

    @Value("${spring.rabbitmq.username:guest}")
    private String relayLogin;

    @Value("${spring.rabbitmq.password:guest}")
    private String relayPasscode;

    @Value("${app.cors.allowed-origins}")
    private String[] allowedOrigins;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns(allowedOrigins);
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableStompBrokerRelay("/topic", "/queue")
                .setRelayHost(relayHost)
                .setRelayPort(relayPort)
                .setClientLogin(relayLogin)
                .setClientPasscode(relayPasscode)
                .setSystemLogin(relayLogin)
                .setSystemPasscode(relayPasscode);
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(stompAuthChannelInterceptor);
    }
}
