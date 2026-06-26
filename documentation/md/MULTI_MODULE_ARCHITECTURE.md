# Multi-Module Architecture Design

## Overview

Refactoring the monolithic backend into a modular architecture with clear separation of concerns using Gradle multi-module project structure.

---

## 📁 Proposed Module Structure

```
fullstack-app/
├── settings.gradle                    # Root settings (module declarations)
├── build.gradle                       # Root build configuration
│
├── server/                            # Main application module (orchestrator)
│   ├── build.gradle
│   └── src/main/java/com/sportconnect/
│       ├── ServerApplication.java     # Spring Boot main class
│       └── config/                    # Application-level configs
│
├── common/                            # Shared utilities & base classes
│   ├── build.gradle
│   └── src/main/java/com/sportconnect/common/
│       ├── dto/
│       │   └── ApiResponse.java       # Generic API response wrapper
│       ├── exception/
│       │   ├── ResourceNotFoundException.java
│       │   ├── BadRequestException.java
│       │   └── UnauthorizedException.java
│       ├── config/
│       │   └── BaseConfig.java        # Shared configurations
│       └── util/
│           └── DateTimeUtil.java      # Utility classes
│
├── auth-api/                          # Authentication module API (interfaces)
│   ├── build.gradle
│   └── src/main/java/com/sportconnect/auth/api/
│       ├── service/
│       │   ├── AuthService.java       # Interface
│       │   └── JwtTokenService.java   # Interface
│       └── dto/
│           ├── LoginRequest.java
│           ├── RegisterRequest.java
│           ├── AuthResponse.java
│           └── RefreshTokenRequest.java
│
├── auth/                              # Authentication module implementation
│   ├── build.gradle
│   └── src/main/java/com/sportconnect/auth/
│       ├── service/
│       │   ├── AuthServiceImpl.java
│       │   └── JwtTokenServiceImpl.java
│       ├── entity/
│       │   └── RefreshToken.java
│       ├── repository/
│       │   └── RefreshTokenRepository.java
│       ├── security/
│       │   ├── JwtAuthenticationFilter.java
│       │   ├── JwtAuthenticationEntryPoint.java
│       │   └── CustomUserDetailsService.java
│       ├── config/
│       │   ├── JwtProperties.java
│       │   └── SecurityConfig.java
│       └── controller/
│           └── AuthController.java
│
├── user-api/                          # User module API (interfaces)
│   ├── build.gradle
│   └── src/main/java/com/sportconnect/user/api/
│       ├── service/
│       │   └── UserService.java       # Interface
│       └── dto/
│           ├── UserResponse.java
│           ├── UpdateProfileRequest.java
│           └── LocationRequest.java
│
├── user/                              # User module implementation
│   ├── build.gradle
│   └── src/main/java/com/sportconnect/user/
│       ├── service/
│       │   └── UserServiceImpl.java
│       ├── entity/
│       │   ├── User.java
│       │   ├── Role.java
│       │   ├── SocialAccount.java
│       │   └── UserPreference.java
│       ├── repository/
│       │   ├── UserRepository.java
│       │   ├── RoleRepository.java
│       │   └── SocialAccountRepository.java
│       └── controller/
│           └── UserController.java
│
├── sport-api/                         # Sport module API (interfaces)
│   ├── build.gradle
│   └── src/main/java/com/sportconnect/sport/api/
│       ├── service/
│       │   └── SportService.java      # Interface
│       └── dto/
│           ├── SportResponse.java
│           ├── UserSportProfileRequest.java
│           └── UserSportProfileResponse.java
│
└── sport/                             # Sport module implementation
    ├── build.gradle
    └── src/main/java/com/sportconnect/sport/
        ├── service/
        │   └── SportServiceImpl.java
        ├── entity/
        │   ├── Sport.java
        │   └── UserSportProfile.java
        ├── repository/
        │   ├── SportRepository.java
        │   └── UserSportProfileRepository.java
        └── controller/
            └── SportController.java
```

---

## 🔗 Module Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                         server                               │
│  (Main application - orchestrates all modules)               │
└─────────────────────────────────────────────────────────────┘
         │
         ├──────────────┬──────────────┬──────────────┐
         ▼              ▼              ▼              ▼
    ┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐
    │  auth  │     │  user  │     │ sport  │     │ common │
    └────────┘     └────────┘     └────────┘     └────────┘
         │              │              │              ▲
         ▼              ▼              ▼              │
    ┌─────────┐   ┌─────────┐   ┌─────────┐         │
    │auth-api │   │user-api │   │sport-api│         │
    └─────────┘   └─────────┘   └─────────┘         │
         │              │              │              │
         └──────────────┴──────────────┴──────────────┘
                  (all depend on common)
```

### Dependency Rules:
1. **common** - No dependencies (base module)
2. **xxx-api** - Depends on: `common`
3. **xxx (impl)** - Depends on: `xxx-api`, `common`, potentially other `xxx-api` modules
4. **server** - Depends on: all `xxx (impl)` modules

---

## 📦 Module Responsibilities

### **common**
- Shared DTOs (ApiResponse, PageResponse)
- Base exceptions
- Utility classes
- Common configurations
- Constants and enums

### **auth-api**
- Authentication service interfaces
- JWT service interfaces
- Auth-related DTOs (LoginRequest, RegisterRequest, AuthResponse)
- No implementation details

### **auth (implementation)**
- AuthService implementation
- JwtTokenService implementation
- Security configuration (SecurityConfig, JWT filters)
- RefreshToken entity & repository
- AuthController

### **user-api**
- User service interfaces
- User-related DTOs (UserResponse, UpdateProfileRequest)
- No implementation details

### **user (implementation)**
- UserService implementation
- User, Role, SocialAccount, UserPreference entities
- User repositories
- UserController

### **sport-api**
- Sport service interfaces
- Sport-related DTOs (SportResponse, UserSportProfileRequest)
- No implementation details

### **sport (implementation)**
- SportService implementation
- Sport, UserSportProfile entities
- Sport repositories
- SportController

### **server**
- Main Spring Boot application
- Application-level configuration
- Global exception handler
- CORS configuration
- Actuator endpoints
- Aggregates all modules

---

## 🔧 Gradle Configuration

### Root `settings.gradle`
```groovy
rootProject.name = 'fullstack-app'

include 'common'
include 'auth-api'
include 'auth'
include 'user-api'
include 'user'
include 'sport-api'
include 'sport'
include 'server'
```

### Root `build.gradle`
```groovy
plugins {
    id 'java'
    id 'org.springframework.boot' version '3.2.0' apply false
    id 'io.spring.dependency-management' version '1.1.4' apply false
}

subprojects {
    apply plugin: 'java'
    apply plugin: 'io.spring.dependency-management'
    
    group = 'com.sportconnect'
    version = '0.0.1-SNAPSHOT'
    
    java {
        sourceCompatibility = '21'
        targetCompatibility = '21'
    }
    
    repositories {
        mavenCentral()
    }
    
    dependencyManagement {
        imports {
            mavenBom "org.springframework.boot:spring-boot-dependencies:3.2.0"
        }
    }
}
```

### `common/build.gradle`
```groovy
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
}
```

### `auth-api/build.gradle`
```groovy
dependencies {
    api project(':common')
    implementation 'org.springframework.boot:spring-boot-starter-web'
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
}
```

### `auth/build.gradle`
```groovy
dependencies {
    api project(':auth-api')
    api project(':user-api')
    implementation project(':common')
    
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-security'
    
    // JWT
    implementation 'io.jsonwebtoken:jjwt-api:0.12.3'
    runtimeOnly 'io.jsonwebtoken:jjwt-impl:0.12.3'
    runtimeOnly 'io.jsonwebtoken:jjwt-jackson:0.12.3'
    
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
}
```

### `user-api/build.gradle`
```groovy
dependencies {
    api project(':common')
    implementation 'org.springframework.boot:spring-boot-starter-web'
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
}
```

### `user/build.gradle`
```groovy
dependencies {
    api project(':user-api')
    implementation project(':common')
    
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    
    // Geospatial Support
    implementation 'org.hibernate:hibernate-spatial:6.4.0'
    implementation 'net.postgis:postgis-jdbc:2023.1.0'
    
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
}
```

### `sport-api/build.gradle`
```groovy
dependencies {
    api project(':common')
    api project(':user-api')
    implementation 'org.springframework.boot:spring-boot-starter-web'
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
}
```

### `sport/build.gradle`
```groovy
dependencies {
    api project(':sport-api')
    api project(':user-api')
    implementation project(':common')
    
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    
    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
}
```

### `server/build.gradle`
```groovy
plugins {
    id 'org.springframework.boot'
    id 'groovy'
}

dependencies {
    // Module dependencies
    implementation project(':auth')
    implementation project(':user')
    implementation project(':sport')
    implementation project(':common')
    
    // Spring Boot
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-data-redis'
    implementation 'org.springframework.boot:spring-boot-starter-websocket'
    implementation 'org.springframework.boot:spring-boot-starter-mail'
    
    // Database
    implementation 'org.liquibase:liquibase-core:4.25.0'
    runtimeOnly 'org.postgresql:postgresql:42.7.0'
    runtimeOnly 'com.h2database:h2'
    
    // Redis
    implementation 'io.lettuce:lettuce-core:6.3.0'
    
    // API Documentation
    implementation 'org.springdoc:springdoc-openapi-starter-webmvc-ui:2.3.0'
    
    // Testing
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
    testImplementation 'org.springframework.security:spring-security-test'
    testImplementation platform('org.spockframework:spock-bom:2.3-groovy-4.0')
    testImplementation 'org.spockframework:spock-core'
    testImplementation 'org.spockframework:spock-spring'
}

bootJar {
    archiveFileName = 'sportconnect-server.jar'
}
```

---

## 🎯 Benefits

1. **Separation of Concerns** - Each module has a clear responsibility
2. **Reusability** - API modules can be shared across services
3. **Independent Development** - Teams can work on different modules
4. **Better Testing** - Test modules in isolation
5. **Dependency Management** - Clear dependency boundaries
6. **Scalability** - Easy to extract modules into microservices later
7. **Clean Architecture** - Interface-based design promotes loose coupling

---

## 🔄 Migration Strategy

1. ✅ Create module structure (directories + build files)
2. ✅ Create `common` module with shared components
3. ✅ Create `auth-api` and move DTOs + interfaces
4. ✅ Create `auth` module and move implementations
5. ✅ Create `user-api` and move DTOs + interfaces
6. ✅ Create `user` module and move implementations
7. ✅ Create `sport-api` and move DTOs + interfaces
8. ✅ Create `sport` module and move implementations
9. ✅ Update `server` module to orchestrate all modules
10. ✅ Update imports and package references
11. ✅ Test build and run application

---

## 📝 Notes

- All `-api` modules contain only interfaces and DTOs (no implementations)
- All implementation modules depend on their corresponding `-api` module
- `common` module is the foundation - no dependencies on other modules
- `server` module is the entry point - depends on all implementation modules
- Use `api` dependency for transitive dependencies, `implementation` for internal
- Package naming: `com.sportconnect.{module}.{layer}`

---

**Next Steps:** Implement this architecture step by step, starting with the module structure and common module.
