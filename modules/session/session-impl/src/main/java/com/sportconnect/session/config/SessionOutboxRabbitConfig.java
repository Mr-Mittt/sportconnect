package com.sportconnect.session.config;

import org.springframework.amqp.core.TopicExchange;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Declares the {@code sportconnect.events} topic exchange (SESSION-15) — durable, routing keys
 * shaped {@code <domain>.<entity>.<action>} (see
 * {@code documentation/md/vision/NOTIFICATION_MODULE_VISION.md}). C3 explicitly scoped
 * *declaring* this exchange to {@code modules/notification}'s NTF-2, but SESSION-15 is the first
 * ticket in the app to actually publish to it — declaring it here (idempotent; Spring AMQP's
 * auto-configured {@code RabbitAdmin} declares any {@code Declarable} bean on connection) lets
 * {@link com.sportconnect.session.job.SessionOutboxRelayJob} actually publish now. NTF-2 will
 * later declare its own durable queue and bindings against this same exchange — no conflict.
 */
@Configuration
public class SessionOutboxRabbitConfig {

    public static final String SPORTCONNECT_EVENTS_EXCHANGE = "sportconnect.events";

    @Bean
    public TopicExchange sportconnectEventsExchange() {
        return new TopicExchange(SPORTCONNECT_EVENTS_EXCHANGE, true, false);
    }
}
