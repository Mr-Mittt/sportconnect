package com.sportconnect;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Main Spring Boot application for SportConnect
 * 
 * This application provides a platform for sports enthusiasts to connect,
 * organize events, and manage their sports activities.
 */
@SpringBootApplication(scanBasePackages = {
    "com.sportconnect",
    "com.sportconnect.auth",
    "com.sportconnect.common"
})
@EnableJpaAuditing
@EnableConfigurationProperties
public class SportConnectApplication {

    public static void main(String[] args) {
        SpringApplication.run(SportConnectApplication.class, args);
    }
}
