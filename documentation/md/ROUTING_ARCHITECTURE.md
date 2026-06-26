# App Routing & Sub-Domain Architecture

## Business Requirements Update

### Multi-Sport Support
The platform supports multiple sports:
- 🏸 Badminton
- 🎾 Pickleball  
- ⚽ Soccer/Football
- 🏋️ Gym/Fitness
- 🏀 Basketball
- 🎾 Tennis
- 🏐 Volleyball
- And more...

**Vendors can specify which sports their facilities support.**

---

## Routing Architecture Options

### Option 1: Sub-Domain Based (Recommended) ⭐

```
Main Platform:
├── www.sportcommunity.com          → Landing page, about, pricing
├── app.sportcommunity.com          → Main application (all sports)
├── vendor.sportcommunity.com       → Vendor dashboard
├── admin.sportcommunity.com        → Admin panel
└── api.sportcommunity.com          → API backend

Optional Sport-Specific:
├── badminton.sportcommunity.com    → Badminton-focused view
├── pickleball.sportcommunity.com   → Pickleball-focused view
└── soccer.sportcommunity.com       → Soccer-focused view
```

**Pros:**
- ✅ Clear separation of concerns
- ✅ Easy to scale independently
- ✅ Better SEO (sport-specific domains)
- ✅ Can deploy different versions per subdomain
- ✅ Easier to add new sports
- ✅ Professional appearance

**Cons:**
- ❌ More complex DNS/SSL setup
- ❌ Need wildcard SSL certificate
- ❌ CORS configuration needed

---

### Option 2: Path-Based Routing

```
www.sportcommunity.com
├── /                               → Landing page
├── /app                            → Main application
│   ├── /app/badminton             → Badminton section
│   ├── /app/pickleball            → Pickleball section
│   └── /app/soccer                → Soccer section
├── /vendor                         → Vendor dashboard
│   ├── /vendor/dashboard
│   ├── /vendor/courts
│   └── /vendor/bookings
├── /admin                          → Admin panel
└── /api                            → API backend
```

**Pros:**
- ✅ Simpler setup (single domain)
- ✅ No CORS issues
- ✅ Single SSL certificate
- ✅ Easier local development

**Cons:**
- ❌ Less clear separation
- ❌ Harder to scale independently
- ❌ All in one deployment

---

### Option 3: Hybrid Approach (Best of Both) ⭐⭐

```
Production:
├── www.sportcommunity.com          → Marketing site
├── app.sportcommunity.com          → User application
│   ├── /badminton                 → Sport-specific views
│   ├── /pickleball
│   └── /soccer
├── vendor.sportcommunity.com       → Vendor dashboard
├── admin.sportcommunity.com        → Admin panel
└── api.sportcommunity.com          → API backend

Development:
└── localhost:3000
    ├── /                           → User app
    ├── /vendor                     → Vendor dashboard
    ├── /admin                      → Admin panel
    └── (API on localhost:8080)
```

**Pros:**
- ✅ Professional in production
- ✅ Simple in development
- ✅ Clear separation
- ✅ Easy to scale
- ✅ Best of both worlds

---

## Recommended Architecture: Hybrid Approach

### Frontend Structure

```
client/
├── public/
├── src/
│   ├── App.js                      → Main app router
│   ├── index.js
│   │
│   ├── apps/                       → Separate applications
│   │   ├── user/                   → User-facing app
│   │   │   ├── App.js
│   │   │   ├── routes/
│   │   │   ├── pages/
│   │   │   │   ├── Home.js
│   │   │   │   ├── Search.js
│   │   │   │   ├── CourtDetails.js
│   │   │   │   ├── Booking.js
│   │   │   │   └── Profile.js
│   │   │   └── components/
│   │   │
│   │   ├── vendor/                 → Vendor dashboard
│   │   │   ├── App.js
│   │   │   ├── routes/
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.js
│   │   │   │   ├── FacilityManagement.js
│   │   │   │   ├── BookingManagement.js
│   │   │   │   ├── Analytics.js
│   │   │   │   └── Settings.js
│   │   │   └── components/
│   │   │
│   │   └── admin/                  → Admin panel
│   │       ├── App.js
│   │       ├── routes/
│   │       ├── pages/
│   │       └── components/
│   │
│   ├── shared/                     → Shared across apps
│   │   ├── components/
│   │   │   ├── Header.js
│   │   │   ├── Footer.js
│   │   │   ├── SportSelector.js
│   │   │   └── AuthForms.js
│   │   ├── contexts/
│   │   │   ├── AuthContext.js
│   │   │   └── SportContext.js
│   │   ├── hooks/
│   │   ├── services/
│   │   │   ├── authService.js
│   │   │   ├── facilityService.js
│   │   │   ├── bookingService.js
│   │   │   └── sportService.js
│   │   └── utils/
│   │
│   └── config/
│       ├── routes.js               → Route configuration
│       └── sports.js               → Sport definitions
```

### Route Configuration

```javascript
// src/config/routes.js
export const ROUTES = {
  // Public routes
  HOME: '/',
  SEARCH: '/search',
  SPORT_HOME: '/:sport',              // /badminton, /pickleball
  FACILITY_DETAILS: '/:sport/facility/:id',
  
  // Auth routes
  LOGIN: '/login',
  REGISTER: '/register',
  
  // User routes (protected)
  USER_PROFILE: '/profile',
  USER_BOOKINGS: '/my-bookings',
  USER_FAVORITES: '/favorites',
  
  // Vendor routes (protected, role: VENDOR)
  VENDOR_BASE: '/vendor',
  VENDOR_DASHBOARD: '/vendor/dashboard',
  VENDOR_FACILITIES: '/vendor/facilities',
  VENDOR_BOOKINGS: '/vendor/bookings',
  VENDOR_ANALYTICS: '/vendor/analytics',
  VENDOR_SETTINGS: '/vendor/settings',
  
  // Admin routes (protected, role: ADMIN)
  ADMIN_BASE: '/admin',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_USERS: '/admin/users',
  ADMIN_VENDORS: '/admin/vendors',
  ADMIN_SPORTS: '/admin/sports',
};
```

### Sport Configuration

```javascript
// src/config/sports.js
export const SPORTS = [
  {
    id: 'badminton',
    name: 'Badminton',
    icon: '🏸',
    color: '#1976d2',
    facilityTypes: ['INDOOR_COURT', 'OUTDOOR_COURT'],
    bookingUnit: 'HOUR',
    minDuration: 1,
    maxPlayers: 4,
  },
  {
    id: 'pickleball',
    name: 'Pickleball',
    icon: '🎾',
    color: '#2e7d32',
    facilityTypes: ['INDOOR_COURT', 'OUTDOOR_COURT'],
    bookingUnit: 'HOUR',
    minDuration: 1,
    maxPlayers: 4,
  },
  {
    id: 'soccer',
    name: 'Soccer',
    icon: '⚽',
    color: '#d32f2f',
    facilityTypes: ['FULL_FIELD', 'HALF_FIELD', 'FUTSAL'],
    bookingUnit: 'HOUR',
    minDuration: 1,
    maxPlayers: 22,
  },
  {
    id: 'gym',
    name: 'Gym',
    icon: '🏋️',
    color: '#f57c00',
    facilityTypes: ['GYM', 'FITNESS_CENTER'],
    bookingUnit: 'SESSION',
    minDuration: 1,
    maxPlayers: 1,
  },
  // Add more sports...
];
```

---

## Backend API Structure

### API Routing

```
api.sportcommunity.com (or /api)
│
├── /auth                           → Authentication
│   ├── POST /register
│   ├── POST /login
│   ├── POST /logout
│   └── GET  /oauth2/...
│
├── /sports                         → Sport management
│   ├── GET    /sports              → List all sports
│   ├── GET    /sports/{id}         → Get sport details
│   └── GET    /sports/{id}/facilities → Facilities for sport
│
├── /facilities                     → Facility management
│   ├── GET    /facilities          → Search facilities
│   ├── GET    /facilities/{id}     → Get facility details
│   ├── POST   /facilities          → Create (vendor only)
│   ├── PUT    /facilities/{id}     → Update (vendor only)
│   └── DELETE /facilities/{id}     → Delete (vendor only)
│
├── /bookings                       → Booking management
│   ├── GET    /bookings            → List bookings
│   ├── POST   /bookings            → Create booking
│   ├── GET    /bookings/{id}       → Get booking details
│   ├── PUT    /bookings/{id}       → Update booking
│   └── DELETE /bookings/{id}       → Cancel booking
│
├── /vendor                         → Vendor-specific APIs
│   ├── GET    /vendor/dashboard    → Dashboard stats
│   ├── GET    /vendor/facilities   → Vendor's facilities
│   ├── GET    /vendor/bookings     → Vendor's bookings
│   └── GET    /vendor/analytics    → Analytics data
│
├── /admin                          → Admin APIs
│   ├── GET    /admin/users
│   ├── GET    /admin/vendors
│   └── POST   /admin/vendors/{id}/approve
│
└── /users                          → User management
    ├── GET    /users/me
    ├── PUT    /users/me
    └── POST   /users/me/avatar
```

---

## Database Schema Updates for Multi-Sport

### Sports Table (New)

```sql
sports
├── id (PK)
├── code (UNIQUE, e.g., 'badminton', 'pickleball')
├── name
├── icon
├── color
├── description
├── is_active (boolean)
├── display_order
├── created_at
└── updated_at
```

### Facility Types Table (New)

```sql
facility_types
├── id (PK)
├── sport_id (FK to sports)
├── code (e.g., 'INDOOR_COURT', 'FULL_FIELD')
├── name
├── description
└── created_at
```

### Updated Facilities Table

```sql
facilities (renamed from courts)
├── id (PK)
├── vendor_id (FK to vendors)
├── sport_id (FK to sports)              ← NEW
├── facility_type_id (FK to facility_types) ← NEW
├── name
├── description
├── location_type (INDOOR, OUTDOOR, SEMI_INDOOR)
├── surface_type
├── capacity
├── amenities (JSON)
├── images (JSON)
├── hourly_rate
├── peak_hour_rate
├── status
├── created_at
└── updated_at
```

### Facility Sports (Many-to-Many)

```sql
facility_sports
├── id (PK)
├── facility_id (FK to facilities)
├── sport_id (FK to sports)
├── created_at
└── updated_at

-- A facility can support multiple sports
-- Example: A gym can offer badminton + pickleball
```

---

## URL Examples

### User-Facing URLs

```
Development:
http://localhost:3000/
http://localhost:3000/badminton
http://localhost:3000/badminton/facility/123
http://localhost:3000/vendor/dashboard

Production:
https://app.sportcommunity.com/
https://app.sportcommunity.com/badminton
https://app.sportcommunity.com/badminton/facility/123
https://vendor.sportcommunity.com/dashboard
```

### API URLs

```
Development:
http://localhost:8080/api/sports
http://localhost:8080/api/facilities?sport=badminton
http://localhost:8080/api/bookings

Production:
https://api.sportcommunity.com/sports
https://api.sportcommunity.com/facilities?sport=badminton
https://api.sportcommunity.com/bookings
```

---

## React Router Setup

```javascript
// src/App.js
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import UserApp from './apps/user/App';
import VendorApp from './apps/vendor/App';
import AdminApp from './apps/admin/App';
import { ProtectedRoute } from './shared/components/ProtectedRoute';

function App() {
  // Detect subdomain in production
  const subdomain = window.location.hostname.split('.')[0];
  
  // In development, use path-based routing
  const isDev = process.env.NODE_ENV === 'development';
  
  if (!isDev) {
    // Production: subdomain-based
    switch (subdomain) {
      case 'vendor':
        return <VendorApp />;
      case 'admin':
        return <AdminApp />;
      default:
        return <UserApp />;
    }
  }
  
  // Development: path-based
  return (
    <BrowserRouter>
      <Routes>
        {/* User routes */}
        <Route path="/*" element={<UserApp />} />
        
        {/* Vendor routes */}
        <Route path="/vendor/*" element={
          <ProtectedRoute requiredRole="VENDOR">
            <VendorApp />
          </ProtectedRoute>
        } />
        
        {/* Admin routes */}
        <Route path="/admin/*" element={
          <ProtectedRoute requiredRole="ADMIN">
            <AdminApp />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
```

---

## Migration to Keycloak - Easy Path

### Current Design (Keycloak-Ready)

```java
// Interface-based design
public interface AuthenticationService {
    UserDTO login(String email, String password);
    UserDTO register(RegisterRequest request);
    TokenDTO refreshToken(String refreshToken);
    void logout(String token);
}

// Current implementation
@Service
public class JwtAuthenticationService implements AuthenticationService {
    // JWT implementation
}

// Future Keycloak implementation
@Service
public class KeycloakAuthenticationService implements AuthenticationService {
    // Keycloak implementation
}
```

**Migration is just swapping the implementation!**

### Configuration Switch

```yaml
# application.yml
auth:
  provider: jwt  # or 'keycloak'
  
# When ready to migrate:
auth:
  provider: keycloak
  keycloak:
    realm: sportcommunity
    auth-server-url: https://auth.sportcommunity.com
    resource: sportcommunity-app
```

---

## Questions for You

1. **Domain Name**: Do you have a domain? Or should we use generic names in examples?

2. **Subdomain Preference**: 
   - Option A: `vendor.sportcommunity.com` (recommended)
   - Option B: `app.sportcommunity.com/vendor`

3. **Sport-Specific Subdomains**: Do you want them?
   - `badminton.sportcommunity.com`
   - Or just filter in the main app?

4. **Initial Sports**: Which sports should we support at launch?
   - Badminton ✅
   - Pickleball ✅
   - Soccer ✅
   - Gym ✅
   - Others?

5. **Vendor Multi-Sport**: Can one vendor have facilities for multiple sports?
   - Example: A sports complex with badminton + pickleball + gym

---

## Next Steps

Once you confirm the routing approach:

1. ✅ Finalize route structure
2. ✅ Update database schema for multi-sport
3. ✅ Implement authentication (Keycloak-ready)
4. ✅ Build vendor dashboard
5. ✅ Add sport management features

**What are your thoughts on the routing architecture?**
