package com.sportconnect.notification.config;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Declares this module's durable queue for {@code user.*} friend-request events on the
 * {@code sportconnect.events} topic exchange (U13) — mirrors {@link SessionEventsRabbitConfig}.
 *
 * <p>The exchange itself is declared as a real {@code @Bean} only in {@code session-impl}'s
 * {@code SessionOutboxRabbitConfig} (the first publisher); redeclaring it as a competing
 * {@code @Bean} here — or in {@code user-impl} — would throw {@code BeanDefinitionOverrideException}
 * in the merged {@code server} context. The plain {@link TopicExchange} instance below exists only
 * to build this queue's {@link Binding}, not as a second Spring-managed declaration.
 */
@Configuration
public class UserEventsRabbitConfig {

    public static final String SPORTCONNECT_EVENTS_EXCHANGE = "sportconnect.events";
    public static final String USER_EVENTS_QUEUE = "notification.events.user";
    private static final String USER_ROUTING_PATTERN = "user.*.*";

    @Bean
    public Queue userEventsQueue() {
        return new Queue(USER_EVENTS_QUEUE, true);
    }

    @Bean
    public Binding userEventsBinding(Queue userEventsQueue) {
        TopicExchange sportconnectEventsExchange = new TopicExchange(SPORTCONNECT_EVENTS_EXCHANGE, true, false);
        return BindingBuilder.bind(userEventsQueue).to(sportconnectEventsExchange).with(USER_ROUTING_PATTERN);
    }
}
