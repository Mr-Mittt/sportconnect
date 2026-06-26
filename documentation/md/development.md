# Development Guide

## Development Environment Setup

### Prerequisites

1. **Java Development Kit (JDK) 21**
   ```bash
   java -version
   ```

2. **Gradle** (or use the included wrapper)
   ```bash
   ./gradlew --version
   ```

3. **IDE** (recommended: IntelliJ IDEA, Eclipse, or VS Code)

4. **Database**
   - PostgreSQL for production-like environment
   - H2 for quick development (in-memory)

## Building the Project

### Using Gradle Wrapper

```bash
# Build the project
./gradlew build

# Build without tests
./gradlew build -x test

# Clean build
./gradlew clean build
```

## Running the Application

### Development Mode

```bash
# Run with Gradle
./gradlew bootRun

# Run with specific profile
./gradlew bootRun --args='--spring.profiles.active=dev'
```

### Using JAR

```bash
# Build JAR
./gradlew bootJar

# Run JAR
java -jar build/libs/server-0.0.1-SNAPSHOT.jar
```

## Testing

### Running Tests

```bash
# Run all tests
./gradlew test

# Run specific test class
./gradlew test --tests "com.example.MyTest"

# Run tests with coverage
./gradlew test jacocoTestReport
```

### Test Structure

- Unit tests: Test individual components in isolation
- Integration tests: Test component interactions
- Use `@SpringBootTest` for integration tests

## Database Management

### H2 Console (Development)

When using H2 database, access the console at:
```
http://localhost:8080/h2-console
```

### Liquibase Migrations

```bash
# Update database to latest version
./gradlew update

# Rollback last changeset
./gradlew rollback

# Generate changelog from existing database
./gradlew generateChangelog
```

## Code Style

### Java Conventions

- Follow Java naming conventions
- Use meaningful variable and method names
- Keep methods focused and concise
- Write self-documenting code

### Package Structure

```
com.example/
├── controller/     # REST controllers
├── service/        # Business logic
├── repository/     # Data access
├── model/          # Entity classes
├── dto/            # Data transfer objects
├── config/         # Configuration classes
└── exception/      # Custom exceptions
```

## Debugging

### Enable Debug Logging

Add to `application.properties`:
```properties
logging.level.com.example=DEBUG
logging.level.org.springframework.web=DEBUG
```

### Remote Debugging

```bash
./gradlew bootRun --debug-jvm
```

Then attach your IDE debugger to port 5005.

## Common Tasks

### Adding a New Dependency

Edit `build.gradle`:
```gradle
dependencies {
    implementation 'group:artifact:version'
}
```

### Creating a New REST Endpoint

1. Create controller class
2. Add service layer logic
3. Create repository if needed
4. Write tests
5. Update API documentation

## Troubleshooting

### Port Already in Use

Change the port in `application.properties`:
```properties
server.port=8081
```

### Database Connection Issues

Check database configuration in `application.properties`:
```properties
spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=user
spring.datasource.password=password
```

## Continuous Integration

CI/CD pipeline configuration will be added as the project evolves.
