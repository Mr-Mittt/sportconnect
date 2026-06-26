# Gradle Multi-Project Build Configuration

This fullstack application is configured as a Gradle multi-project build with both server (Spring Boot) and client (React) subprojects.

## Project Structure

```
fullstack-app/
├── build.gradle           # Root project configuration
├── settings.gradle        # Multi-project settings
├── gradlew.bat           # Gradle wrapper (Windows)
├── gradle/               # Gradle wrapper files
│   └── wrapper/
│       ├── gradle-wrapper.jar
│       └── gradle-wrapper.properties
├── server/               # Spring Boot backend
│   ├── build.gradle
│   └── src/
└── client/               # React frontend
    ├── build.gradle
    ├── package.json
    └── src/
```

## Prerequisites

- **Java 21** (for server)
- **Node.js 18+** (automatically downloaded by Gradle for client)
- **Gradle 8.5** (via wrapper)

## Available Gradle Tasks

### Root Project Tasks

```bash
# View all projects
.\gradlew projects

# View all available tasks
.\gradlew tasks

# Build both server and client
.\gradlew build

# Clean all build outputs
.\gradlew clean
```

### Server Tasks

```bash
# Build server JAR
.\gradlew :server:build

# Run Spring Boot server
.\gradlew :server:bootRun

# Run server tests
.\gradlew :server:test

# Build Docker image
.\gradlew :server:bootBuildImage
```

### Client Tasks

```bash
# Install npm dependencies
.\gradlew :client:npmInstall

# Start React development server
.\gradlew :client:start

# Build React production bundle
.\gradlew :client:buildClient

# Run React tests
.\gradlew :client:testClient

# Clean client build
.\gradlew :client:clean
```

### Convenience Tasks

```bash
# Start server (from root)
.\gradlew bootRun

# Start client (from root)
.\gradlew startClient

# View startup instructions
.\gradlew startAll
```

## Quick Start

### 1. Build Everything

```bash
.\gradlew build
```

This will:
- Build the Spring Boot server JAR
- Install npm dependencies for client
- Build the React production bundle

### 2. Run Development Servers

**Terminal 1 - Start Server:**
```bash
.\gradlew :server:bootRun
```
Server runs on: `http://localhost:8080`

**Terminal 2 - Start Client:**
```bash
.\gradlew :client:start
```
Client runs on: `http://localhost:3000`

## Server Configuration

### `server/build.gradle`

**Key Features:**
- Spring Boot 3.2.0
- Java 21
- Lombok support
- PostgreSQL & H2 database support
- Liquibase migrations
- JUnit 5 testing

**Dependencies:**
- `spring-boot-starter-web` - REST API
- `spring-boot-starter-data-jpa` - Database access
- `liquibase-core` - Database migrations
- `lombok` - Reduce boilerplate code
- `postgresql` - PostgreSQL driver
- `h2` - H2 in-memory database

## Client Configuration

### `client/build.gradle`

**Key Features:**
- Node.js 18.18.0 (auto-downloaded)
- npm 9.8.1
- React 18.2.0
- Gradle Node Plugin 7.0.1

**Tasks:**
- Automatically downloads Node.js if not present
- Manages npm dependencies
- Integrates React build with Gradle

## IntelliJ IDEA Integration

### Import Project

1. **File → Open**
2. Select `fullstack-app` directory
3. Choose **"Open as Project"**
4. IntelliJ will detect the Gradle configuration
5. Wait for Gradle sync to complete

### Run Configurations

**Server:**
- Use Gradle task: `:server:bootRun`
- Or use Spring Boot run configuration

**Client:**
- Use Gradle task: `:client:start`
- Or use npm scripts from `package.json`

### Gradle Tool Window

- **View → Tool Windows → Gradle**
- Expand `fullstack-app` to see all tasks
- Double-click tasks to run them

## Common Commands

### Development Workflow

```bash
# Clean and rebuild everything
.\gradlew clean build

# Run server only
.\gradlew :server:bootRun

# Run client only
.\gradlew :client:start

# Run tests
.\gradlew :server:test
.\gradlew :client:testClient
```

### Production Build

```bash
# Build production artifacts
.\gradlew build

# Server JAR location
server/build/libs/server.jar

# Client build location
client/build/
```

### Troubleshooting

```bash
# Refresh dependencies
.\gradlew --refresh-dependencies

# Clean and rebuild
.\gradlew clean build

# View dependency tree
.\gradlew :server:dependencies
.\gradlew :client:dependencies

# Run with debug output
.\gradlew build --debug

# Run with stack trace
.\gradlew build --stacktrace
```

## Environment Configuration

### Server

Edit `server/src/main/resources/application.properties`:

```properties
server.port=8080
spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=user
spring.datasource.password=password
```

### Client

Edit `client/.env`:

```env
REACT_APP_API_URL=http://localhost:8080
PORT=3000
```

## Gradle Wrapper

The project uses Gradle Wrapper 8.5, ensuring consistent builds across environments.

**Update Gradle version:**
```bash
.\gradlew wrapper --gradle-version 8.5
```

## Multi-Project Benefits

1. **Unified Build**: Single command builds both projects
2. **Dependency Management**: Shared Gradle configuration
3. **IDE Integration**: Better IntelliJ IDEA support
4. **Task Orchestration**: Run related tasks together
5. **Consistent Tooling**: Same build tool for frontend and backend

## Notes

- The client build uses the `com.github.node-gradle.node` plugin
- Node.js is downloaded automatically to `.gradle/nodejs`
- npm packages are cached in `.gradle/npm`
- Server runs on port 8080, client on port 3000
- Client proxies API requests to server (configured in `package.json`)

## Additional Resources

- [Gradle Documentation](https://docs.gradle.org/8.5/userguide/userguide.html)
- [Spring Boot Gradle Plugin](https://docs.spring.io/spring-boot/docs/3.2.0/gradle-plugin/reference/html/)
- [Gradle Node Plugin](https://github.com/node-gradle/gradle-node-plugin)
