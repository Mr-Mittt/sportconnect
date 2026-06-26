# Badminton Sport Community App - Architecture Proposal

## Business Overview

### User Types
1. **Service Vendors**
   - Court/Stadium Vendors
   - Equipment Shop Vendors

2. **Service Consumers**
   - Normal Users (Individual players)
   - Group Owner Users (Team/club organizers)

---

## Court/Stadium Vendor Management - Architecture

### 1. Database Schema Design

#### Core Entities

**Vendor Entity**
```sql
vendors
├── id (PK)
├── user_id (FK to users)
├── business_name
├── business_type (COURT_VENDOR, EQUIPMENT_VENDOR)
├── description
├── phone
├── email
├── address
├── city
├── country
├── latitude
├── longitude
├── logo_url
├── cover_image_url
├── rating (average)
├── total_reviews
├── status (PENDING, APPROVED, ACTIVE, SUSPENDED)
├── created_at
└── updated_at
```

**Court/Stadium Entity**
```sql
courts
├── id (PK)
├── vendor_id (FK to vendors)
├── name
├── court_type (INDOOR, OUTDOOR, SEMI_INDOOR)
├── surface_type (WOOD, SYNTHETIC, CONCRETE)
├── description
├── capacity (max players)
├── amenities (JSON: parking, shower, locker, etc.)
├── images (JSON array)
├── hourly_rate
├── peak_hour_rate
├── status (AVAILABLE, MAINTENANCE, CLOSED)
├── created_at
└── updated_at
```

**Booking/Schedule Entity**
```sql
bookings
├── id (PK)
├── court_id (FK to courts)
├── user_id (FK to users)
├── booking_date
├── start_time
├── end_time
├── duration_hours
├── total_price
├── status (PENDING, CONFIRMED, CANCELLED, COMPLETED)
├── payment_status (UNPAID, PAID, REFUNDED)
├── notes
├── created_at
└── updated_at
```

**Operating Hours Entity**
```sql
operating_hours
├── id (PK)
├── court_id (FK to courts)
├── day_of_week (0-6, Sunday-Saturday)
├── open_time
├── close_time
├── is_closed (boolean)
└── special_pricing (JSON)
```

**Reviews Entity**
```sql
reviews
├── id (PK)
├── vendor_id (FK to vendors)
├── court_id (FK to courts, nullable)
├── user_id (FK to users)
├── rating (1-5)
├── comment
├── images (JSON array)
├── created_at
└── updated_at
```

---

### 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React)                      │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Vendor     │  │    Court     │  │   Booking    │  │
│  │  Dashboard   │  │  Management  │  │  Management  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Analytics   │  │   Reviews    │  │   Settings   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          │ REST API (JSON)
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Backend (Spring Boot)                       │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐  │
│  │           Controllers Layer                       │  │
│  │  - VendorController                              │  │
│  │  - CourtController                               │  │
│  │  - BookingController                             │  │
│  │  - ReviewController                              │  │
│  └──────────────────────────────────────────────────┘  │
│                          │                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │           Service Layer                           │  │
│  │  - VendorService                                 │  │
│  │  - CourtService                                  │  │
│  │  - BookingService                                │  │
│  │  - NotificationService                           │  │
│  └──────────────────────────────────────────────────┘  │
│                          │                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │         Repository Layer (JPA)                    │  │
│  │  - VendorRepository                              │  │
│  │  - CourtRepository                               │  │
│  │  - BookingRepository                             │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Database (PostgreSQL)                       │
└─────────────────────────────────────────────────────────┘
```

---

### 3. API Endpoints Design

#### Vendor Management APIs

**Authentication & Profile**
```
POST   /api/vendors/register          - Register as vendor
GET    /api/vendors/profile           - Get vendor profile
PUT    /api/vendors/profile           - Update vendor profile
POST   /api/vendors/upload-logo       - Upload business logo
```

**Court Management**
```
GET    /api/vendors/courts            - List all vendor's courts
POST   /api/vendors/courts            - Create new court
GET    /api/vendors/courts/{id}       - Get court details
PUT    /api/vendors/courts/{id}       - Update court
DELETE /api/vendors/courts/{id}       - Delete court
POST   /api/vendors/courts/{id}/images - Upload court images
```

**Booking Management**
```
GET    /api/vendors/bookings          - List all bookings
GET    /api/vendors/bookings/{id}     - Get booking details
PUT    /api/vendors/bookings/{id}     - Update booking status
GET    /api/vendors/bookings/calendar - Get calendar view
GET    /api/vendors/bookings/stats    - Get booking statistics
```

**Operating Hours**
```
GET    /api/vendors/courts/{id}/hours - Get operating hours
PUT    /api/vendors/courts/{id}/hours - Update operating hours
```

**Analytics & Reports**
```
GET    /api/vendors/analytics/revenue - Revenue analytics
GET    /api/vendors/analytics/bookings - Booking analytics
GET    /api/vendors/analytics/popular-times - Popular time slots
GET    /api/vendors/reports/monthly   - Monthly reports
```

**Reviews**
```
GET    /api/vendors/reviews           - Get all reviews
GET    /api/vendors/reviews/stats     - Review statistics
POST   /api/vendors/reviews/{id}/reply - Reply to review
```

---

### 4. Frontend Architecture (React)

#### Page Structure

```
src/
├── pages/
│   └── vendor/
│       ├── VendorDashboard.js       - Main dashboard
│       ├── CourtManagement.js       - Court CRUD
│       ├── BookingManagement.js     - Booking calendar & list
│       ├── Analytics.js             - Charts & statistics
│       ├── Reviews.js               - Review management
│       └── Settings.js              - Vendor settings
├── components/
│   └── vendor/
│       ├── CourtCard.js             - Court display card
│       ├── CourtForm.js             - Add/Edit court form
│       ├── BookingCalendar.js       - Calendar view
│       ├── BookingTable.js          - Booking list table
│       ├── RevenueChart.js          - Revenue visualization
│       ├── OperatingHoursEditor.js  - Hours management
│       └── ReviewCard.js            - Review display
├── services/
│   ├── vendorService.js             - Vendor API calls
│   ├── courtService.js              - Court API calls
│   └── bookingService.js            - Booking API calls
└── hooks/
    ├── useVendor.js                 - Vendor state management
    ├── useCourts.js                 - Courts state management
    └── useBookings.js               - Bookings state management
```

---

### 5. Key Features for Vendor Management

#### Dashboard Features
- **Overview Statistics**
  - Total courts
  - Today's bookings
  - Monthly revenue
  - Average rating
  - Occupancy rate

- **Quick Actions**
  - Add new court
  - View today's schedule
  - Respond to reviews
  - Update availability

#### Court Management Features
- **CRUD Operations**
  - Create, Read, Update, Delete courts
  - Upload multiple images
  - Set pricing (regular & peak hours)
  - Define amenities

- **Availability Management**
  - Set operating hours per day
  - Mark courts as unavailable
  - Set maintenance schedules
  - Block specific time slots

#### Booking Management Features
- **Calendar View**
  - Daily, weekly, monthly views
  - Color-coded by status
  - Drag-and-drop rescheduling
  - Quick booking creation

- **Booking Operations**
  - Approve/reject bookings
  - Cancel bookings
  - Send notifications
  - Process refunds

#### Analytics Features
- **Revenue Analytics**
  - Daily/weekly/monthly revenue
  - Revenue by court
  - Peak vs off-peak comparison
  - Payment status breakdown

- **Booking Analytics**
  - Booking trends
  - Popular time slots
  - Court utilization rate
  - Customer retention

---

### 6. Technology Stack Recommendation

**Backend**
- ✅ Spring Boot 3.2.0 (already configured)
- ✅ Spring Data JPA
- ✅ PostgreSQL
- ✅ Liquibase (migrations)
- ✅ Spring Security (authentication)
- ✅ JWT (token-based auth)
- ⚡ Spring Validation
- ⚡ MapStruct (DTO mapping)

**Frontend**
- ✅ React 18.2.0 (already configured)
- ✅ Material-UI (for UI components)
- ⚡ React Router (navigation)
- ⚡ React Query / SWR (data fetching)
- ⚡ Formik / React Hook Form (forms)
- ⚡ Chart.js / Recharts (analytics)
- ⚡ FullCalendar (booking calendar)
- ⚡ Axios (HTTP client - already have)

**Additional Services**
- ⚡ Firebase / AWS S3 (image storage)
- ⚡ SendGrid / AWS SES (email notifications)
- ⚡ Stripe / PayPal (payment processing)
- ⚡ Google Maps API (location services)

---

### 7. Security Considerations

**Authentication & Authorization**
```java
@PreAuthorize("hasRole('VENDOR')")
public class VendorController {
    // Only vendors can access
}

@PreAuthorize("hasRole('VENDOR') and @vendorSecurity.isOwner(#courtId)")
public void updateCourt(@PathVariable Long courtId) {
    // Only court owner can update
}
```

**Data Validation**
- Input validation on all endpoints
- File upload restrictions (size, type)
- SQL injection prevention (JPA)
- XSS prevention (sanitize inputs)

---

### 8. Scalability Considerations

**Database**
- Indexing on frequently queried fields
- Partitioning bookings by date
- Caching vendor/court data
- Read replicas for analytics

**API**
- Pagination for list endpoints
- Rate limiting per vendor
- Async processing for notifications
- CDN for images

---

### 9. User Flow Example

**Vendor Onboarding Flow**
```
1. Register as Vendor
   ↓
2. Complete Profile (business details, documents)
   ↓
3. Admin Approval (status: PENDING → APPROVED)
   ↓
4. Add First Court (name, type, pricing, images)
   ↓
5. Set Operating Hours
   ↓
6. Court goes LIVE
   ↓
7. Start receiving bookings
```

**Booking Management Flow**
```
1. Customer books court
   ↓
2. Vendor receives notification
   ↓
3. Vendor reviews booking
   ↓
4. Vendor approves/rejects
   ↓
5. Customer receives confirmation
   ↓
6. Booking appears in calendar
   ↓
7. After completion, customer can review
```

---

## Questions for You

Before we proceed with implementation, please confirm:

1. **User Authentication**: Do you want vendors to register separately or upgrade from normal users?

2. **Payment Integration**: Do you need payment processing now, or can we add it later?

3. **Approval Process**: Should vendor registrations require admin approval?

4. **Booking Rules**: 
   - Minimum booking duration?
   - Advance booking limit?
   - Cancellation policy?

5. **Pricing Model**:
   - Fixed hourly rate?
   - Peak/off-peak pricing?
   - Dynamic pricing?

6. **Multi-language Support**: Do you need internationalization?

7. **Mobile App**: Is this web-only, or will there be a mobile app later?

---

## Next Steps

Once you approve this architecture, we'll proceed with:

1. ✅ Create database entities and migrations
2. ✅ Implement backend APIs
3. ✅ Create frontend components
4. ✅ Integrate with Material-UI
5. ✅ Add authentication & authorization
6. ✅ Implement booking calendar
7. ✅ Add analytics dashboard

Let me know your thoughts and answers to the questions above!
