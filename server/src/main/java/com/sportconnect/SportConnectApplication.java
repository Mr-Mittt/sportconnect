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


    public int lengthOfLongestSubstring(String s) {
        char[] input = s.toCharArray();
        int start1 = 0;
        int maxLength1 = 1;
        int end1 = 0;

        int start2 = 0;
        int maxLength2 = 1;
        int end2 = 0;

        for (int i = 1; i < s.length(); i++) {
            if (input[i-1] == input[i] && maxLength1 > maxLength2) {
                start2 = start1;
                end2 = end1;
                maxLength2 = maxLength1;

                start1 = i;
                end1 = i;
                maxLength1 = 1;
            } else {
                for (int j = start1; j < i; j ++) {
                    if (input[j] == input[i]) {
                        if (maxLength1 > maxLength2) {
                            start2 = start1;
                            end2 = end1;
                            maxLength2 = maxLength1;

                            start1 = i;
                            end1 = i;
                            maxLength1 = 1;
                        } else {
                            start1 = i;
                            end1 = i;
                            maxLength1 = 1;
                        }
                        break;
                    }
                }
            }
            maxLength1++;
            end1++;
        }
        if (maxLength1 > maxLength2) {
            return maxLength1;
        }
        return maxLength2;
    }
}
