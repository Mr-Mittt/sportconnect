# Booking Verification & Equipment Trading System

## Overview

Two core marketplace features:
1. **Booking Marketplace**: Book facilities + transfer/resell bookings
2. **Equipment Marketplace**: Buy/sell/rent sports equipment

Both with verification, transfer tracking, and secure transactions.

---

## 1. Booking Verification & Transfer System

### Features

**Booking Creation:**
- ✅ Unique verification code
- ✅ QR code for check-in
- ✅ Immutable transfer history
- ✅ Vendor verification portal

**Booking Transfer:**
- ✅ User can sell/transfer booking
- ✅ Transfer marketplace
- ✅ Price negotiation
- ✅ Automatic ownership update
- ✅ Notification to all parties

**Verification:**
- ✅ Vendor scans QR code
- ✅ See complete transfer chain
- ✅ Verify current owner
- ✅ One-time use protection

---

### Database Schema - Bookings

```sql
-- Bookings (enhanced)
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
    is_transferable BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Booking tokens (verification codes)
CREATE TABLE booking_tokens (
    id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    token_code VARCHAR(50) UNIQUE NOT NULL,
    qr_code_url VARCHAR(500),
    qr_code_data TEXT,
    current_owner_id UUID NOT NULL REFERENCES users(id),
    original_owner_id UUID NOT NULL REFERENCES users(id),
    transfer_count INTEGER DEFAULT 0,
    is_used BOOLEAN DEFAULT FALSE,
    used_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(booking_id)
);

-- Booking transfers (immutable history)
CREATE TABLE booking_transfers (
    id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(id),
    booking_token_id BIGINT NOT NULL REFERENCES booking_tokens(id),
    from_user_id UUID NOT NULL REFERENCES users(id),
    to_user_id UUID NOT NULL REFERENCES users(id),
    transfer_type VARCHAR(50) NOT NULL,
    transfer_price DECIMAL(10, 2),
    platform_fee DECIMAL(10, 2),
    transfer_reason VARCHAR(255),
    transfer_hash VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prevent updates/deletes (immutability)
CREATE RULE no_update_booking_transfers AS ON UPDATE TO booking_transfers DO INSTEAD NOTHING;
CREATE RULE no_delete_booking_transfers AS ON DELETE TO booking_transfers DO INSTEAD NOTHING;

-- Booking transfer marketplace listings
CREATE TABLE booking_listings (
    id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(id),
    seller_id UUID NOT NULL REFERENCES users(id),
    asking_price DECIMAL(10, 2) NOT NULL,
    original_price DECIMAL(10, 2) NOT NULL,
    description TEXT,
    is_negotiable BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) DEFAULT 'active',
    views_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    UNIQUE(booking_id)
);

-- Token verifications (audit trail)
CREATE TABLE token_verifications (
    id BIGSERIAL PRIMARY KEY,
    booking_token_id BIGINT NOT NULL REFERENCES booking_tokens(id),
    verified_by_user_id UUID REFERENCES users(id),
    verified_by_vendor_id BIGINT REFERENCES vendors(id),
    verification_method VARCHAR(50),
    verification_result VARCHAR(50),
    ip_address VARCHAR(50),
    device_info JSONB,
    location JSONB,
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. Equipment Trading Marketplace

### Features

**Equipment Listings:**
- ✅ Sell new/used equipment
- ✅ Rent equipment (hourly/daily)
- ✅ Equipment verification
- ✅ Condition ratings
- ✅ Photos and descriptions

**Trading:**
- ✅ Buy/sell/rent
- ✅ Price negotiation
- ✅ Secure payments
- ✅ Delivery options
- ✅ Meetup coordination

**Trust & Safety:**
- ✅ Seller ratings
- ✅ Equipment verification
- ✅ Dispute resolution
- ✅ Escrow payments

---

### Database Schema - Equipment

```sql
-- Equipment categories
CREATE TABLE equipment_categories (
    id BIGSERIAL PRIMARY KEY,
    sport_id BIGINT REFERENCES sports(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    parent_category_id BIGINT REFERENCES equipment_categories(id),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Equipment brands
CREATE TABLE equipment_brands (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    logo_url VARCHAR(500),
    website VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Equipment listings
CREATE TABLE equipment_listings (
    id BIGSERIAL PRIMARY KEY,
    seller_id UUID NOT NULL REFERENCES users(id),
    category_id BIGINT NOT NULL REFERENCES equipment_categories(id),
    brand_id BIGINT REFERENCES equipment_brands(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    listing_type VARCHAR(50) NOT NULL,
    condition VARCHAR(50),
    price DECIMAL(10, 2),
    rental_price_hourly DECIMAL(10, 2),
    rental_price_daily DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'USD',
    quantity INTEGER DEFAULT 1,
    images JSONB,
    specifications JSONB,
    location_city VARCHAR(100),
    location_state VARCHAR(100),
    location_country VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    is_negotiable BOOLEAN DEFAULT TRUE,
    delivery_available BOOLEAN DEFAULT FALSE,
    meetup_available BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) DEFAULT 'active',
    views_count INTEGER DEFAULT 0,
    favorites_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Equipment transactions
CREATE TABLE equipment_transactions (
    id BIGSERIAL PRIMARY KEY,
    listing_id BIGINT NOT NULL REFERENCES equipment_listings(id),
    buyer_id UUID NOT NULL REFERENCES users(id),
    seller_id UUID NOT NULL REFERENCES users(id),
    transaction_type VARCHAR(50) NOT NULL,
    quantity INTEGER DEFAULT 1,
    price DECIMAL(10, 2) NOT NULL,
    platform_fee DECIMAL(10, 2),
    delivery_fee DECIMAL(10, 2),
    total_amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    payment_status VARCHAR(50) DEFAULT 'pending',
    delivery_method VARCHAR(50),
    delivery_address TEXT,
    tracking_number VARCHAR(100),
    rental_start_date DATE,
    rental_end_date DATE,
    rental_duration_days INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Equipment rental periods (for rental tracking)
CREATE TABLE equipment_rentals (
    id BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT NOT NULL REFERENCES equipment_transactions(id),
    listing_id BIGINT NOT NULL REFERENCES equipment_listings(id),
    renter_id UUID NOT NULL REFERENCES users(id),
    owner_id UUID NOT NULL REFERENCES users(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    pickup_time TIMESTAMP,
    return_time TIMESTAMP,
    deposit_amount DECIMAL(10, 2),
    deposit_status VARCHAR(50),
    condition_at_pickup VARCHAR(50),
    condition_at_return VARCHAR(50),
    damage_notes TEXT,
    status VARCHAR(50) DEFAULT 'reserved',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Equipment reviews
CREATE TABLE equipment_reviews (
    id BIGSERIAL PRIMARY KEY,
    listing_id BIGINT NOT NULL REFERENCES equipment_listings(id),
    transaction_id BIGINT REFERENCES equipment_transactions(id),
    reviewer_id UUID NOT NULL REFERENCES users(id),
    seller_id UUID NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_type VARCHAR(50),
    title VARCHAR(255),
    comment TEXT,
    images JSONB,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User favorites (watchlist)
CREATE TABLE equipment_favorites (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    listing_id BIGINT NOT NULL REFERENCES equipment_listings(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, listing_id)
);

-- Offers/negotiations
CREATE TABLE equipment_offers (
    id BIGSERIAL PRIMARY KEY,
    listing_id BIGINT NOT NULL REFERENCES equipment_listings(id),
    buyer_id UUID NOT NULL REFERENCES users(id),
    seller_id UUID NOT NULL REFERENCES users(id),
    offer_amount DECIMAL(10, 2) NOT NULL,
    message TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    counter_offer_amount DECIMAL(10, 2),
    counter_message TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seller ratings (aggregate)
CREATE TABLE seller_ratings (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    total_sales INTEGER DEFAULT 0,
    total_rentals INTEGER DEFAULT 0,
    average_rating DECIMAL(3, 2) DEFAULT 0.00,
    total_reviews INTEGER DEFAULT 0,
    response_rate DECIMAL(5, 2) DEFAULT 0.00,
    response_time_hours DECIMAL(8, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);
```

---

## Token/Code Generation System

### Booking Token Format

```
Format: BK-XXXX-XXXX-XXXX
Example: BK-A7F3-9D2E-C1B4

Components:
├── BK: Booking prefix
├── A7F3: Random alphanumeric
├── 9D2E: Random alphanumeric
└── C1B4: Checksum

Hash: SHA256(booking_id + user_id + timestamp + secret)
```

### QR Code Data

```json
{
  "type": "booking",
  "token": "BK-A7F3-9D2E-C1B4",
  "booking_id": 12345,
  "facility_name": "Court 1",
  "vendor_name": "Downtown Sports",
  "date": "2026-03-15",
  "time": "10:00-12:00",
  "current_owner": "user-c-uuid",
  "verify_url": "https://sportconnect.com/verify/BK-A7F3-9D2E-C1B4"
}
```

---

## API Endpoints

### Booking Verification & Transfer

```
-- Booking tokens
GET    /api/bookings/{id}/token
POST   /api/bookings/{id}/generate-token
GET    /api/tokens/{token}/verify
GET    /api/tokens/{token}/details
GET    /api/tokens/{token}/history

-- Transfers
POST   /api/bookings/{id}/transfer
GET    /api/bookings/{id}/transfers
PUT    /api/transfers/{id}/accept
PUT    /api/transfers/{id}/reject

-- Transfer marketplace
GET    /api/marketplace/bookings
POST   /api/marketplace/bookings
GET    /api/marketplace/bookings/{id}
PUT    /api/marketplace/bookings/{id}
DELETE /api/marketplace/bookings/{id}

-- Vendor verification
POST   /api/vendor/verify-token
GET    /api/vendor/verifications
GET    /api/vendor/bookings/today
```

### Equipment Marketplace

```
-- Listings
GET    /api/equipment
POST   /api/equipment
GET    /api/equipment/{id}
PUT    /api/equipment/{id}
DELETE /api/equipment/{id}
POST   /api/equipment/{id}/images

-- Categories & Brands
GET    /api/equipment/categories
GET    /api/equipment/brands

-- Transactions
POST   /api/equipment/{id}/buy
POST   /api/equipment/{id}/rent
GET    /api/equipment/transactions
GET    /api/equipment/transactions/{id}

-- Offers
POST   /api/equipment/{id}/offer
GET    /api/equipment/offers/received
GET    /api/equipment/offers/sent
PUT    /api/equipment/offers/{id}/accept
PUT    /api/equipment/offers/{id}/counter

-- Favorites
POST   /api/equipment/{id}/favorite
DELETE /api/equipment/{id}/favorite
GET    /api/equipment/favorites

-- Reviews
POST   /api/equipment/{id}/review
GET    /api/equipment/{id}/reviews
GET    /api/users/{id}/seller-rating
```

---

## User Flows

### 1. Booking Transfer Flow

```
┌─────────────────────────────────────────────────────────┐
│ User A creates booking                                   │
│ ├── Books Court 1, March 15, 10:00-12:00               │
│ ├── Pays $100                                           │
│ └── Receives token: BK-A7F3-9D2E-C1B4                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ User A can't make it, wants to sell                     │
│ ├── Lists on transfer marketplace                       │
│ ├── Asking price: $80 (discount)                        │
│ └── Description: "Can't make it, selling cheap"         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ User C browses marketplace                               │
│ ├── Sees listing                                        │
│ ├── Checks facility details                            │
│ └── Decides to buy                                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ User C purchases                                         │
│ ├── Pays $80 to User A                                 │
│ ├── Platform fee: $8 (10%)                             │
│ ├── User A receives: $72                               │
│ └── Transfer initiated                                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ System processes transfer                                │
│ ├── Update booking owner: User A → User C              │
│ ├── Create transfer record (immutable)                 │
│ ├── Generate new QR code (optional)                    │
│ ├── Notify User A: Transfer complete                   │
│ ├── Notify User C: You received booking                │
│ └── Notify Vendor: Ownership changed                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ March 15 - User C arrives at facility                   │
│ ├── Shows QR code to vendor                            │
│ ├── Vendor scans code                                  │
│ ├── System verifies:                                   │
│ │   ├── Token valid ✅                                 │
│ │   ├── Current owner: User C ✅                       │
│ │   ├── Date matches ✅                                │
│ │   ├── Not used ✅                                    │
│ │   └── Transfer chain: A → C ✅                       │
│ ├── Vendor confirms check-in                           │
│ └── Token marked as used                               │
└─────────────────────────────────────────────────────────┘
```

### 2. Equipment Sale Flow

```
┌─────────────────────────────────────────────────────────┐
│ User A lists badminton racket                           │
│ ├── Title: "Yonex Astrox 99 Pro"                       │
│ ├── Condition: Excellent                               │
│ ├── Price: $150 (negotiable)                           │
│ ├── Photos: 5 images                                   │
│ └── Location: New York                                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ User B searches for rackets                             │
│ ├── Filters: Badminton, Yonex, $100-200               │
│ ├── Finds User A's listing                            │
│ └── Interested but wants discount                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ User B makes offer                                       │
│ ├── Offer: $120                                        │
│ ├── Message: "Can you do $120?"                        │
│ └── Waits for response                                 │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ User A reviews offer                                     │
│ ├── Considers: $120 vs $150                           │
│ ├── Counter-offers: $135                               │
│ └── Message: "Meet in the middle at $135?"            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ User B accepts counter-offer                            │
│ ├── Agrees to $135                                     │
│ ├── Chooses meetup at Downtown Sports                  │
│ └── Proceeds to payment                                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Payment processing                                       │
│ ├── User B pays $135                                   │
│ ├── Platform holds in escrow                           │
│ ├── Platform fee: $13.50 (10%)                         │
│ └── Meetup scheduled                                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Meetup & exchange                                        │
│ ├── Both arrive at location                            │
│ ├── User B inspects racket                             │
│ ├── User B confirms receipt in app                     │
│ └── Platform releases payment to User A                │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ Post-transaction                                         │
│ ├── User A receives: $121.50                           │
│ ├── User B leaves review                               │
│ ├── User A's seller rating updated                     │
│ └── Transaction complete                               │
└─────────────────────────────────────────────────────────┘
```

---

## Frontend Pages

### Booking Marketplace

```
/app/marketplace/bookings
├── Search & filters
├── Booking cards with:
│   ├── Facility name & photo
│   ├── Date & time
│   ├── Original price vs asking price
│   ├── Discount percentage
│   └── "Buy Now" button
└── Sort by: price, date, discount
```

### Equipment Marketplace

```
/app/marketplace/equipment
├── Search & filters
│   ├── Sport type
│   ├── Category
│   ├── Condition
│   ├── Price range
│   ├── Location
│   └── Listing type (sale/rent)
├── Equipment cards
└── Map view (optional)
```

### My Listings

```
/app/my-listings
├── Active bookings for transfer
├── Equipment listings
├── Offers received
├── Sales history
└── Analytics
```

---

## Payment Integration

### Booking Transfers

```
Transfer Price: $80
├── Buyer pays: $80
├── Platform fee: $8 (10%)
├── Seller receives: $72
└── Original vendor: Already paid $100
```

### Equipment Sales

```
Sale Price: $135
├── Buyer pays: $135
├── Platform fee: $13.50 (10%)
├── Seller receives: $121.50
└── Escrow until delivery confirmed
```

### Equipment Rentals

```
Rental: $20/day for 3 days
├── Renter pays: $60 + $50 deposit
├── Platform fee: $6 (10%)
├── Owner receives: $54 (after return)
└── Deposit returned if no damage
```

---

## Trust & Safety Features

### For Bookings
- ✅ Verified booking tokens
- ✅ Transfer history tracking
- ✅ Vendor verification
- ✅ Dispute resolution
- ✅ Refund protection

### For Equipment
- ✅ Seller ratings & reviews
- ✅ Verified purchases
- ✅ Photo verification
- ✅ Escrow payments
- ✅ Meetup safety tips
- ✅ Report listing feature
- ✅ Damage deposit for rentals

---

## Mobile Features

### QR Code Scanner (Vendor App)
```
Vendor scans booking QR code
    ↓
Shows:
├── ✅ Valid / ❌ Invalid
├── Current owner name
├── Booking details
├── Transfer history
├── Payment status
└── Check-in button
```

### Equipment Listing (Mobile)
```
Quick list equipment:
├── Take photos
├── Auto-detect brand (image recognition)
├── Suggest price (based on similar items)
├── One-tap publish
└── Share to social media
```

---

## Next Steps

1. ✅ Finalize database schema
2. ✅ Implement booking token system
3. ✅ Build transfer marketplace
4. ✅ Create equipment marketplace
5. ✅ Add QR code generation
6. ✅ Build vendor verification portal
7. ✅ Implement escrow payments
8. ✅ Add rating/review system

**Ready to start implementation?**
