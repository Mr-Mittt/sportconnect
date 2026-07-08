package com.sportconnect.controller;

import com.sportconnect.common.dto.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/**
 * Health check and API information endpoint
 */
@RestController
@RequestMapping("/api")
@Tag(name = "Health", description = "Application health/info. Note: unlike /actuator/health, these are NOT in SecurityConfig's permitAll list, so they currently require authentication despite the name.")
public class HealthController {

    @Value("${spring.application.name}")
    private String applicationName;

    @Value("${server.port}")
    private String serverPort;

    @Operation(summary = "Application health status")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Status, application name, timestamp, port"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/health")
    public ResponseEntity<ApiResponse<Map<String, Object>>> health() {
        Map<String, Object> healthData = new HashMap<>();
        healthData.put("status", "UP");
        healthData.put("application", applicationName);
        healthData.put("timestamp", LocalDateTime.now());
        healthData.put("port", serverPort);

        return ResponseEntity.ok(ApiResponse.success("Application is running", healthData));
    }

    @Operation(summary = "Static API metadata")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Name, description, version, docs link"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/info")
    public ResponseEntity<ApiResponse<Map<String, String>>> info() {
        Map<String, String> info = new HashMap<>();
        info.put("name", "SportConnect API");
        info.put("description", "Platform for sports enthusiasts to connect and organize events");
        info.put("version", "1.0.0");
        info.put("documentation", "/swagger-ui.html");

        return ResponseEntity.ok(ApiResponse.success("API Information", info));
    }
}
