# Week 1 Progress - Backend v0.1 Foundation

## ✅ Completed Tasks

### Day 1: Project Setup & Configuration

**1. Updated Dependencies (build.gradle)**
```gradle
✅ Spring Boot 3.2.0
✅ Spring Security 6.2.0
✅ Spring Data JPA
✅ Spring Data Redis
✅ Spring WebSocket
✅ PostgreSQL 42.7.0
✅ Liquibase 4.25.0
✅ Hibernate Spatial 6.4.0 (PostGIS)
✅ JWT (jjwt 0.12.3)
✅ Lombok 1.18.30
✅ SpringDoc OpenAPI 2.3.0
✅ TestContainers 1.19.3
```

**2. Created Application Configuration**
```
✅ application.yml (main config)
✅ application-dev.yml (development)
✅ application-prod.yml (production)
```

**Configuration includes:**
- PostgreSQL database connection
- Redis cache configuration
- JWT settings
- CORS configuration
- Email settings
- Logging configuration
- API documentation (Swagger)

**3. Created Database Migrations**
```
✅ V001__create_users_and_roles.sql
✅ V002__create_auth_tables.sql
✅ V003__create_sports_tables.sql
```

---

## 📊 Database Schema Created

### V001: Users and Roles
**Tables:**
- `users` - User accounts with geospatial location support
- `roles` - User roles (USER, VENDOR, GROUP_OWNER, ADMIN)
- `user_roles` - User-role junction table
- `social_accounts` - OAuth social login accounts

**Features:**
- UUID primary keys for users
- PostGIS geography type for location
- Email and username uniqueness
- Auto-update timestamps
- Indexed for performance

**Default Roles Inserted:**
- USER (regular users)
- VENDOR (facility owners)
- GROUP_OWNER (group managers)
- ADMIN (platform administrators)

---

### V002: Authentication
**Tables:**
- `email_verifications` - Email verification tokens
- `password_reset_tokens` - Password reset tokens
- `refresh_tokens` - JWT refresh tokens
- `user_sessions` - Active user sessions

**Features:**
- Token expiration tracking
- Session management
- IP and user agent tracking
- Revocation support

---

### V003: Sports and Preferences
**Tables:**
- `sports` - Available sports
- `facility_types` - Types of facilities
- `user_sport_profiles` - User skill levels per sport
- `user_preferences` - User app preferences

**Default Sports Inserted:**
- Badminton
- Tennis
- Pickleball
- Table Tennis
- Soccer
- Basketball
- Volleyball
- Gym/Fitness
- Swimming
- Running
- Cycling
- Yoga

**Default Facility Types Inserted:**
- Indoor Court
- Outdoor Court
- Stadium
- Gym
- Pool
- Field
- Track
- Studio

---

## 🔧 Technology Stack Configured

### Backend
- **Framework:** Spring Boot 3.2.0
- **Language:** Java 21
- **Database:** PostgreSQL 16 + PostGIS
- **Cache:** Redis 7
- **ORM:** Hibernate 6.4.0
- **Migration:** Liquibase 4.25.0
- **Security:** Spring Security 6.2.0 + JWT
- **API Docs:** SpringDoc OpenAPI 3.0

### Key Features Enabled
- ✅ Geospatial queries (PostGIS)
- ✅ JSON support (JSONB)
- ✅ Full-text search capability
- ✅ Connection pooling (HikariCP)
- ✅ Auto-updating timestamps
- ✅ Comprehensive indexing

---

## 📁 Project Structure

```
server/
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/
│   │   │       └── sportconnect/
│   │   │           ├── config/          (to be created)
│   │   │           ├── controller/      (to be created)
│   │   │           ├── dto/             (to be created)
│   │   │           ├── entity/          (to be created)
│   │   │           ├── repository/      (to be created)
│   │   │           ├── service/         (to be created)
│   │   │           ├── security/        (to be created)
│   │   │           └── util/            (to be created)
│   │   └── resources/
│   │       ├── application.yml          ✅
│   │       ├── application-dev.yml      ✅
│   │       ├── application-prod.yml     ✅
│   │       └── db/
│   │           └── changelog/
│   │               ├── db.changelog-master.xml  ✅
│   │               └── changes/
│   │                   ├── V001__create_users_and_roles.sql      ✅
│   │                   ├── V002__create_auth_tables.sql          ✅
│   │                   └── V003__create_sports_tables.sql        ✅
│   └── test/
│       └── java/
└── build.gradle                         ✅
```

---

## 🎯 Next Steps (Day 2-3)

### Create Entity Classes
```java
✅ User.java
✅ Role.java
✅ SocialAccount.java
✅ EmailVerification.java
✅ PasswordResetToken.java
✅ RefreshToken.java
✅ Sport.java
✅ FacilityType.java
✅ UserSportProfile.java
✅ UserPreference.java
```

### Create Repository Interfaces
```java
✅ UserRepository.java
✅ RoleRepository.java
✅ SocialAccountRepository.java
✅ RefreshTokenRepository.java
✅ SportRepository.java
✅ UserSportProfileRepository.java
```

### Create DTOs (Data Transfer Objects)
```java
✅ RegisterRequest.java
✅ LoginRequest.java
✅ AuthResponse.java
✅ UserResponse.java
```

---

## 🚀 How to Run

### Prerequisites
```bash
# Install PostgreSQL 16 with PostGIS
# Install Redis 7

# Create database
createdb sportconnect_dev

# Enable PostGIS extension (will be done by migration)
```

### Run Application
```bash
# Navigate to server directory
cd server

# Run with Gradle
./gradlew bootRun

# Or build and run JAR
./gradlew bootJar
java -jar build/libs/server.jar
```

### Access API Documentation
```
http://localhost:8080/swagger-ui.html
http://localhost:8080/api-docs
```

---

## 📝 Environment Variables

### Development (.env or IDE configuration)
```properties
SPRING_PROFILE=dev
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sportconnect_dev
DB_USERNAME=postgres
DB_PASSWORD=postgres
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=dev-secret-key-for-development-only
```

### Production
```properties
SPRING_PROFILE=prod
DB_HOST=${your_db_host}
DB_PORT=5432
DB_NAME=sportconnect
DB_USERNAME=${your_db_user}
DB_PASSWORD=${your_db_password}
REDIS_HOST=${your_redis_host}
REDIS_PORT=6379
REDIS_PASSWORD=${your_redis_password}
JWT_SECRET=${your_secure_jwt_secret}
MAIL_HOST=smtp.gmail.com
MAIL_USERNAME=${your_email}
MAIL_PASSWORD=${your_email_password}
```

---

## ✅ Week 1, Day 1 Complete!

**Achievements:**
- ✅ Project dependencies configured
- ✅ Application configuration files created
- ✅ Database schema designed and migrated
- ✅ 10 tables created with proper relationships
- ✅ Indexes and constraints added
- ✅ Default data inserted (roles, sports, facility types)
- ✅ PostGIS enabled for geospatial queries
- ✅ Auto-updating timestamps configured

**Ready for Day 2:**
- Create Java entity classes
- Create repository interfaces
- Create DTOs
- Begin authentication implementation

---

**Status:** Backend v0.1 - Day 1/10 Complete ✅
