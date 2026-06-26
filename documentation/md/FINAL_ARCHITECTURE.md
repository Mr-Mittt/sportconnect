# Final Architecture - Multi-Sport Community Platform

## Project Overview

**Platform Name**: SportConnect (placeholder)
**Purpose**: Multi-sport community platform connecting users with sport facilities
**Supported Sports**: Badminton, Pickleball, Soccer, Gym, and more (configurable)

---

## Architecture Decisions ✅

### 1. Routing: Path-Based
```
sportconnect.com
├── /                               → Landing page
├── /app                            → Main user application
│   ├── /app/search                → Search facilities
│   ├── /app/facility/:id          → Facility details
│   └── /app/my-bookings           → User bookings
├── /vendor                         → Vendor dashboard
│   ├── /vendor/dashboard
│   ├── /vendor/facilities
│   └── /vendor/bookings
├── /admin                          → Admin panel
└── /api                            → Backend API
```

### 2. Sport Filtering: In-App
- Sport selector in main app
- Filter facilities by sport
- No sport-specific subdomains

### 3. Multi-Sport Support
- Sports table with configurable sports
- No initial data (will be added via admin)
- Vendors can support multiple sports
- Facilities can offer multiple sports

### 4. Authentication: Custom JWT
- Interface-based design for easy Keycloak migration
- Email/password + social login
- Role-based access control

---

## Complete Database Schema

### 1. Authentication & Users

```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    date_of_birth DATE,
    gender VARCHAR(20),
    email_verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP
);

-- User roles (many-to-many)
CREATE TABLE user_roles (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role)
);

-- Social accounts
CREATE TABLE social_accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_user_id)
);

-- Email verification tokens
CREATE TABLE email_verification_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    expires_at TIMESTAMP NOT NULL,
    verified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Sports & Facility Types

```sql
-- Sports table
CREATE TABLE sports (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(10),
    color VARCHAR(20),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Facility types (sport-specific)
CREATE TABLE facility_types (
    id BIGSERIAL PRIMARY KEY,
    sport_id BIGINT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(sport_id, code)
);

-- Example data will be added via admin panel:
-- Sports: badminton, pickleball, soccer, gym, basketball, tennis, volleyball
-- Facility types: 
--   badminton -> INDOOR_COURT, OUTDOOR_COURT
--   soccer -> FULL_FIELD, HALF_FIELD, FUTSAL
--   gym -> GYM, FITNESS_CENTER, CROSSFIT
```

### 3. Vendors & Facilities

```sql
-- Vendors
CREATE TABLE vendors (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(255) NOT NULL,
    description TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100),
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    logo_url VARCHAR(500),
    cover_image_url VARCHAR(500),
    rating DECIMAL(3, 2) DEFAULT 0.00,
    total_reviews INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Facilities (courts, fields, gyms, etc.)
CREATE TABLE facilities (
    id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    location_type VARCHAR(50),
    surface_type VARCHAR(50),
    capacity INTEGER,
    amenities JSONB,
    images JSONB,
    hourly_rate DECIMAL(10, 2),
    peak_hour_rate DECIMAL(10, 2),
    status VARCHAR(20) DEFAULT 'AVAILABLE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Facility sports (many-to-many)
CREATE TABLE facility_sports (
    id BIGSERIAL PRIMARY KEY,
    facility_id BIGINT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    sport_id BIGINT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    facility_type_id BIGINT REFERENCES facility_types(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, sport_id)
);

-- Operating hours
CREATE TABLE operating_hours (
    id BIGSERIAL PRIMARY KEY,
    facility_id BIGINT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL,
    open_time TIME,
    close_time TIME,
    is_closed BOOLEAN DEFAULT FALSE,
    special_pricing JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(facility_id, day_of_week)
);
```

### 4. Bookings & Reviews

```sql
-- Bookings
CREATE TABLE bookings (
    id BIGSERIAL PRIMARY KEY,
    facility_id BIGINT NOT NULL REFERENCES facilities(id),
    user_id UUID NOT NULL REFERENCES users(id),
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    duration_hours DECIMAL(4, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    payment_status VARCHAR(20) DEFAULT 'UNPAID',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reviews
CREATE TABLE reviews (
    id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    facility_id BIGINT REFERENCES facilities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    images JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Review replies (vendor responses)
CREATE TABLE review_replies (
    id BIGSERIAL PRIMARY KEY,
    review_id BIGINT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    vendor_id BIGINT NOT NULL REFERENCES vendors(id),
    reply TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5. Indexes for Performance

```sql
-- User indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

-- Vendor indexes
CREATE INDEX idx_vendors_user_id ON vendors(user_id);
CREATE INDEX idx_vendors_status ON vendors(status);
CREATE INDEX idx_vendors_city ON vendors(city);
CREATE INDEX idx_vendors_location ON vendors(latitude, longitude);

-- Facility indexes
CREATE INDEX idx_facilities_vendor_id ON facilities(vendor_id);
CREATE INDEX idx_facilities_status ON facilities(status);

-- Facility sports indexes
CREATE INDEX idx_facility_sports_facility_id ON facility_sports(facility_id);
CREATE INDEX idx_facility_sports_sport_id ON facility_sports(sport_id);

-- Booking indexes
CREATE INDEX idx_bookings_facility_id ON bookings(facility_id);
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);

-- Review indexes
CREATE INDEX idx_reviews_vendor_id ON reviews(vendor_id);
CREATE INDEX idx_reviews_facility_id ON reviews(facility_id);
CREATE INDEX idx_reviews_user_id ON reviews(user_id);
```

---

## Backend Structure

### Package Organization

```
server/src/main/java/com/sportconnect/
├── config/
│   ├── SecurityConfig.java
│   ├── JwtConfig.java
│   └── WebConfig.java
│
├── domain/
│   ├── user/
│   │   ├── User.java
│   │   ├── UserRole.java
│   │   └── SocialAccount.java
│   ├── sport/
│   │   ├── Sport.java
│   │   └── FacilityType.java
│   ├── vendor/
│   │   ├── Vendor.java
│   │   ├── Facility.java
│   │   ├── FacilitySport.java
│   │   └── OperatingHours.java
│   ├── booking/
│   │   └── Booking.java
│   └── review/
│       ├── Review.java
│       └── ReviewReply.java
│
├── repository/
│   ├── UserRepository.java
│   ├── SportRepository.java
│   ├── VendorRepository.java
│   ├── FacilityRepository.java
│   ├── BookingRepository.java
│   └── ReviewRepository.java
│
├── service/
│   ├── auth/
│   │   ├── AuthenticationService.java (interface)
│   │   ├── JwtAuthenticationService.java
│   │   └── JwtTokenService.java
│   ├── SportService.java
│   ├── VendorService.java
│   ├── FacilityService.java
│   ├── BookingService.java
│   └── ReviewService.java
│
├── controller/
│   ├── AuthController.java
│   ├── SportController.java
│   ├── FacilityController.java
│   ├── BookingController.java
│   ├── VendorController.java
│   └── ReviewController.java
│
├── dto/
│   ├── auth/
│   ├── sport/
│   ├── facility/
│   ├── booking/
│   └── vendor/
│
└── exception/
    ├── GlobalExceptionHandler.java
    ├── ResourceNotFoundException.java
    └── UnauthorizedException.java
```

---

## Frontend Structure

```
client/src/
├── App.js                          → Main router
├── index.js
│
├── apps/
│   ├── user/                       → User-facing app
│   │   ├── App.js
│   │   ├── routes.js
│   │   ├── pages/
│   │   │   ├── Home.js
│   │   │   ├── Search.js
│   │   │   ├── FacilityDetails.js
│   │   │   ├── Booking.js
│   │   │   ├── MyBookings.js
│   │   │   └── Profile.js
│   │   └── components/
│   │       ├── SportFilter.js
│   │       ├── FacilityCard.js
│   │       ├── BookingCalendar.js
│   │       └── SearchFilters.js
│   │
│   ├── vendor/                     → Vendor dashboard
│   │   ├── App.js
│   │   ├── routes.js
│   │   ├── pages/
│   │   │   ├── Dashboard.js
│   │   │   ├── FacilityManagement.js
│   │   │   ├── FacilityForm.js
│   │   │   ├── BookingManagement.js
│   │   │   ├── Analytics.js
│   │   │   ├── Reviews.js
│   │   │   └── Settings.js
│   │   └── components/
│   │       ├── FacilityList.js
│   │       ├── FacilityForm.js
│   │       ├── SportSelector.js
│   │       ├── BookingTable.js
│   │       ├── RevenueChart.js
│   │       └── OperatingHoursEditor.js
│   │
│   └── admin/                      → Admin panel
│       ├── App.js
│       ├── routes.js
│       ├── pages/
│       │   ├── Dashboard.js
│       │   ├── UserManagement.js
│       │   ├── VendorManagement.js
│       │   ├── SportManagement.js
│       │   └── SystemSettings.js
│       └── components/
│
├── shared/                         → Shared across apps
│   ├── components/
│   │   ├── Header.js
│   │   ├── Footer.js
│   │   ├── ProtectedRoute.js
│   │   ├── SportIcon.js
│   │   └── AuthForms/
│   │       ├── LoginForm.js
│   │       └── RegisterForm.js
│   ├── contexts/
│   │   ├── AuthContext.js
│   │   └── SportContext.js
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useSports.js
│   │   └── useFacilities.js
│   ├── services/
│   │   ├── api.js
│   │   ├── authService.js
│   │   ├── sportService.js
│   │   ├── facilityService.js
│   │   ├── bookingService.js
│   │   └── vendorService.js
│   └── utils/
│       ├── formatters.js
│       └── validators.js
│
└── config/
    ├── routes.js
    └── constants.js
```

---

## API Endpoints Summary

### Public APIs
```
GET    /api/sports                  → List all active sports
GET    /api/sports/{id}             → Get sport details
GET    /api/facilities              → Search facilities (with filters)
GET    /api/facilities/{id}         → Get facility details
GET    /api/reviews/facility/{id}   → Get facility reviews
```

### Authentication APIs
```
POST   /api/auth/register           → Register new user
POST   /api/auth/login              → Login
POST   /api/auth/logout             → Logout
POST   /api/auth/refresh            → Refresh token
GET    /api/auth/oauth2/authorize/{provider}
GET    /api/auth/oauth2/callback/{provider}
```

### User APIs (Authenticated)
```
GET    /api/users/me                → Get current user
PUT    /api/users/me                → Update profile
POST   /api/bookings                → Create booking
GET    /api/bookings/my             → Get user's bookings
PUT    /api/bookings/{id}           → Update booking
DELETE /api/bookings/{id}           → Cancel booking
POST   /api/reviews                 → Create review
```

### Vendor APIs (Role: VENDOR)
```
GET    /api/vendor/dashboard        → Dashboard stats
GET    /api/vendor/facilities       → List vendor's facilities
POST   /api/vendor/facilities       → Create facility
PUT    /api/vendor/facilities/{id}  → Update facility
DELETE /api/vendor/facilities/{id}  → Delete facility
POST   /api/vendor/facilities/{id}/sports → Add sport to facility
GET    /api/vendor/bookings         → List vendor's bookings
PUT    /api/vendor/bookings/{id}    → Update booking status
GET    /api/vendor/analytics        → Analytics data
POST   /api/vendor/reviews/{id}/reply → Reply to review
```

### Admin APIs (Role: ADMIN)
```
GET    /api/admin/users             → List all users
POST   /api/admin/sports            → Create sport
PUT    /api/admin/sports/{id}       → Update sport
GET    /api/admin/vendors           → List all vendors
PUT    /api/admin/vendors/{id}/approve → Approve vendor
```

---

## Authentication - Keycloak Migration Ready

### Interface Design
```java
public interface AuthenticationService {
    TokenResponse login(LoginRequest request);
    UserDTO register(RegisterRequest request);
    TokenResponse refreshToken(String refreshToken);
    void logout(String token);
    UserDTO getCurrentUser();
}
```

### Current Implementation (JWT)
```java
@Service
@ConditionalOnProperty(name = "auth.provider", havingValue = "jwt", matchIfMissing = true)
public class JwtAuthenticationService implements AuthenticationService {
    // JWT implementation
}
```

### Future Implementation (Keycloak)
```java
@Service
@ConditionalOnProperty(name = "auth.provider", havingValue = "keycloak")
public class KeycloakAuthenticationService implements AuthenticationService {
    // Keycloak implementation
}
```

### Configuration
```yaml
# application.yml
auth:
  provider: jwt  # Switch to 'keycloak' when ready
```

---

## Key Features

### For Users
- ✅ Browse facilities by sport
- ✅ Search and filter (location, price, rating)
- ✅ View facility details and reviews
- ✅ Book facilities
- ✅ Manage bookings
- ✅ Write reviews

### For Vendors
- ✅ Manage multiple facilities
- ✅ Support multiple sports per facility
- ✅ Set operating hours and pricing
- ✅ View and manage bookings
- ✅ Analytics dashboard
- ✅ Respond to reviews

### For Admins
- ✅ Manage sports and facility types
- ✅ Approve vendor registrations
- ✅ Manage users
- ✅ System configuration

---

## Next Steps

1. ✅ Create Liquibase migrations for database schema
2. ✅ Implement domain entities (JPA)
3. ✅ Create repositories
4. ✅ Implement authentication service (JWT)
5. ✅ Build vendor management APIs
6. ✅ Create frontend routing structure
7. ✅ Build vendor dashboard UI

**Ready to start implementation?**
