package com.sportconnect.user.config;

/**
 * Holds the name of the {@code sportconnect.events} topic exchange that {@code UserOutboxRelayJob}
 * publishes friend-request events to (U13).
 *
 * <p><b>Deliberately declares no {@code @Bean}.</b> The exchange is already declared as a real
 * {@code @Bean} in {@code session-impl}'s {@code SessionOutboxRabbitConfig} (SESSION-15, the first
 * publisher); a second {@code @Bean} of the same name in the merged {@code server} context would
 * fail with {@code BeanDefinitionOverrideException}. Spring AMQP's auto-configured
 * {@code RabbitAdmin} declares the exchange on connection from that one bean, and topic-exchange
 * declaration is idempotent regardless — this module only needs the name to publish.
 */
public final class UserOutboxRabbitConfig {

    public static final String SPORTCONNECT_EVENTS_EXCHANGE = "sportconnect.events";

    private UserOutboxRabbitConfig() {
    }
}
