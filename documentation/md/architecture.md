# Architecture

## System Architecture

The server follows a layered architecture pattern typical of Spring Boot applications.

### Layers

#### 1. Controller Layer
- Handles HTTP requests and responses
- Maps endpoints to service methods
- Validates input data
- Returns appropriate HTTP status codes

#### 2. Service Layer
- Contains business logic
- Orchestrates operations between controllers and repositories
- Handles transactions

#### 3. Repository Layer
- Manages data persistence
- Uses Spring Data JPA for database operations
- Provides abstraction over database queries

#### 4. Model/Entity Layer
- Defines data models
- Maps to database tables
- Contains JPA annotations

## Database Schema

The application uses Liquibase for database migration management, ensuring consistent schema across environments.

### Migration Strategy

- All schema changes are version-controlled through Liquibase changesets
- Migrations run automatically on application startup
- Supports both PostgreSQL (production) and H2 (development/testing)

## Design Patterns

- **Dependency Injection**: Managed by Spring Framework
- **Repository Pattern**: For data access abstraction
- **Service Pattern**: For business logic encapsulation
- **DTO Pattern**: For data transfer between layers

## Technology Decisions

### Spring Boot 3.2.0
- Modern framework with excellent ecosystem
- Built-in support for REST APIs
- Comprehensive testing support
- Production-ready features (actuator, metrics)

### Liquibase
- Database-agnostic migration tool
- Version control for database schema
- Rollback capabilities
- Supports multiple database types

### PostgreSQL
- Robust, production-grade relational database
- Excellent performance and reliability
- Strong community support
- Advanced features for complex queries
