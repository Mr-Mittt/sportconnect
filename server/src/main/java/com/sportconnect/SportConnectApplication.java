package com.sportconnect;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * Main Spring Boot application for SportConnect
 * 
 * This application provides a platform for sports enthusiasts to connect,
 * organize events, and manage their sports activities.
 */
@SpringBootApplication(scanBasePackages = "com.sportconnect")
@EnableJpaRepositories(basePackages = "com.sportconnect")
@EntityScan(basePackages = "com.sportconnect")
@EnableJpaAuditing
@EnableConfigurationProperties
public class SportConnectApplication {

    public static void main(String[] args) {
        SpringApplication.run(SportConnectApplication.class, args);
    }
}
