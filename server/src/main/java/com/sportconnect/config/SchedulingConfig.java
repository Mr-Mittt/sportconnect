package com.sportconnect.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
public class SchedulingConfig {
    // Enables @Scheduled methods repo-wide — currently only session-impl's
    // SessionGenerationJob (SESSION-2) uses it.
}
