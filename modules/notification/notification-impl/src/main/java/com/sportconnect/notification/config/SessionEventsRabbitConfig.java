package com.sportconnect.notification.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Declares this module's own durable queue on the {@code sportconnect.events} topic exchange.
 * The exchange itself is declared as a real {@code @Bean} in {@code session-impl}'s
 * {@code SessionOutboxRabbitConfig} (SESSION-15, the first real publisher) — deliberately NOT
 * redeclared as a competing {@code @Bean} here (same bean name in the same merged
 * {@code server} context would throw {@code BeanDefinitionOverrideException}); the plain
 * {@link TopicExchange} instance below exists only to build this module's own {@link Binding},
 * not as a second Spring-managed declaration of the exchange. Session-only scope for now (NTF-2)
 * — a queue/binding per further-scoped consumer would be added once {@code post-impl}/{@code
 * group-impl}/{@code user-impl} ship their own outbox-wiring tickets (B7/B21/U13).
 */
@Configuration
public class SessionEventsRabbitConfig {

    public static final String SPORTCONNECT_EVENTS_EXCHANGE = "sportconnect.events";
    public static final String SESSION_EVENTS_QUEUE = "notification.events.session";
    private static final String SESSION_ROUTING_PATTERN = "session.*.*";

    @Bean
    public Queue sessionEventsQueue() {
        return new Queue(SESSION_EVENTS_QUEUE, true);
    }

    @Bean
    public Binding sessionEventsBinding(Queue sessionEventsQueue) {
        TopicExchange sportconnectEventsExchange = new TopicExchange(SPORTCONNECT_EVENTS_EXCHANGE, true, false);
        return BindingBuilder.bind(sessionEventsQueue).to(sportconnectEventsExchange).with(SESSION_ROUTING_PATTERN);
    }
}
