# Fullstack App - Server

## Overview

This is the backend service for the Fullstack Application, built with Spring Boot 3.2.0 and Java 21.

## Technology Stack

- **Framework**: Spring Boot 3.2.0
- **Language**: Java 21
- **Build Tool**: Gradle
- **Database**: PostgreSQL (production), H2 (development)
- **Migration Tool**: Liquibase
- **ORM**: Spring Data JPA

## Key Features

- RESTful API endpoints
- Database persistence with JPA
- Database migration management with Liquibase
- Support for both PostgreSQL and H2 databases

## Quick Start

### Prerequisites

- Java 21 or higher
- Gradle (or use the included Gradle wrapper)
- PostgreSQL (for production) or H2 (for development)

### Running the Application

```bash
# Using Gradle wrapper
./gradlew bootRun

# Or build and run the JAR
./gradlew build
java -jar build/libs/server-0.0.1-SNAPSHOT.jar
```

The server will start on `http://localhost:8080`.

## Project Structure

```
server/
├── src/
│   ├── main/
│   │   ├── java/          # Java source files
│   │   └── resources/     # Configuration files
│   └── test/              # Test files
├── build.gradle           # Gradle build configuration
└── settings.gradle        # Gradle settings
```

## Configuration

Application configuration can be found in `src/main/resources/application.properties` or `application.yml`.

## API Documentation

See [API Reference](api.md) for detailed API documentation.

## Development Guide

See [Development](development.md) for development setup and guidelines.
