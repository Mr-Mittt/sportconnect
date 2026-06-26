# Payment Integration Plan

## Overview

Payment system for multi-sport facility booking platform supporting:
- User payments for bookings
- Vendor payouts
- Platform commission
- Multiple payment methods
- Refunds and cancellations

---

## Payment Flow Options

### Option 1: Direct Payment to Vendor (Simpler) ⭐

```
User → Payment Gateway → Vendor
                ↓
         Platform Commission (optional)
```

**Flow:**
1. User books facility
2. User pays full amount
3. Payment goes to vendor
4. Platform takes commission (if applicable)

**Pros:**
- ✅ Simpler implementation
- ✅ Faster vendor payouts
- ✅ Less liability for platform
- ✅ Lower compliance requirements

**Cons:**
- ❌ Less control over transactions
- ❌ Harder to enforce commission
- ❌ Vendor needs payment account

---

### Option 2: Platform as Payment Aggregator (Recommended) ⭐⭐

```
User → Platform → Hold Funds → Vendor Payout
         ↓
    Commission Deducted
```

**Flow:**
1. User books and pays platform
2. Platform holds funds
3. After booking completion, platform pays vendor (minus commission)
4. Automated payout schedule (weekly/monthly)

**Pros:**
- ✅ Full control over transactions
- ✅ Easy commission management
- ✅ Better dispute handling
- ✅ Trust and safety features
- ✅ Can offer platform wallet

**Cons:**
- ❌ More complex implementation
- ❌ Higher compliance requirements
- ❌ Platform holds funds (liability)
- ❌ Need payment license in some regions

---

## Recommended Payment Gateway

### Primary Recommendation: **Stripe Connect** ⭐⭐⭐

**Why Stripe Connect:**
- ✅ Built for marketplace platforms
- ✅ Handles vendor payouts automatically
- ✅ Commission management built-in
- ✅ Supports 135+ currencies
- ✅ Strong fraud protection
- ✅ Excellent documentation
- ✅ Available in most countries

**Stripe Connect Models:**

#### 1. Standard Account (Recommended for Start)
```
- Vendor creates own Stripe account
- Platform facilitates payment
- Vendor sees full transaction details
- Platform takes commission via application fee
```

#### 2. Express Account (Best for Growth)
```
- Platform creates account for vendor
- Simplified onboarding
- Platform controls experience
- Vendor has limited Stripe dashboard access
```

#### 3. Custom Account (Enterprise)
```
- Full white-label solution
- Platform owns entire experience
- Most complex to implement
```

---

### Alternative Options

**1. PayPal Commerce Platform**
- ✅ Widely recognized
- ✅ Good for international
- ❌ Higher fees than Stripe
- ❌ Less developer-friendly

**2. Square**
- ✅ Good for in-person payments
- ✅ Simple integration
- ❌ Limited marketplace features
- ❌ US-focused

**3. Razorpay (Asia-focused)**
- ✅ Great for India/Southeast Asia
- ✅ Local payment methods
- ❌ Limited global reach

---

## Database Schema for Payments

```sql
-- Payment accounts (Stripe Connect accounts)
CREATE TABLE payment_accounts (
    id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    provider VARCHAR(50) DEFAULT 'stripe',
    account_id VARCHAR(255) NOT NULL,
    account_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'pending',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    charges_enabled BOOLEAN DEFAULT FALSE,
    payouts_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(vendor_id)
);

-- Payments
CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    booking_id BIGINT NOT NULL REFERENCES bookings(id),
    user_id UUID NOT NULL REFERENCES users(id),
    vendor_id BIGINT NOT NULL REFERENCES vendors(id),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    platform_fee DECIMAL(10, 2) DEFAULT 0.00,
    vendor_amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    provider VARCHAR(50) DEFAULT 'stripe',
    provider_payment_id VARCHAR(255),
    provider_charge_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refunds
CREATE TABLE refunds (
    id BIGSERIAL PRIMARY KEY,
    payment_id BIGINT NOT NULL REFERENCES payments(id),
    booking_id BIGINT NOT NULL REFERENCES bookings(id),
    amount DECIMAL(10, 2) NOT NULL,
    reason VARCHAR(255),
    provider_refund_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payouts (to vendors)
CREATE TABLE payouts (
    id BIGSERIAL PRIMARY KEY,
    vendor_id BIGINT NOT NULL REFERENCES vendors(id),
    payment_account_id BIGINT NOT NULL REFERENCES payment_accounts(id),
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    provider VARCHAR(50) DEFAULT 'stripe',
    provider_payout_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    arrival_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions (audit trail)
CREATE TABLE transactions (
    id BIGSERIAL PRIMARY KEY,
    payment_id BIGINT REFERENCES payments(id),
    refund_id BIGINT REFERENCES refunds(id),
    payout_id BIGINT REFERENCES payouts(id),
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Platform wallet (optional - for future)
CREATE TABLE wallet_balances (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    vendor_id BIGINT REFERENCES vendors(id),
    balance DECIMAL(10, 2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id),
    UNIQUE(vendor_id)
);
```

---

## Payment Flow Implementation

### 1. Vendor Onboarding (Stripe Connect)

```
┌─────────────────────────────────────────────────────────┐
│ 1. Vendor registers on platform                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Platform creates Stripe Connect account              │
│    - POST /api/vendor/payment-account/create            │
│    - Backend calls Stripe API                           │
│    - Returns onboarding URL                             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Vendor completes Stripe onboarding                   │
│    - Redirected to Stripe hosted page                   │
│    - Provides business details, bank account            │
│    - Stripe verifies information                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Stripe webhook notifies platform                     │
│    - account.updated event                              │
│    - Update payment_accounts status                     │
│    - Enable vendor to receive bookings                  │
└─────────────────────────────────────────────────────────┘
```

### 2. Booking Payment Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. User selects facility and time slot                  │
│    - Calculate total price                              │
│    - Show price breakdown                               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. User proceeds to payment                             │
│    - POST /api/bookings/create                          │
│    - Backend creates booking (status: PENDING)          │
│    - Backend creates Stripe PaymentIntent               │
│    - Returns client_secret to frontend                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. User enters payment details                          │
│    - Stripe Elements (card form)                        │
│    - Frontend confirms payment with client_secret       │
│    - Stripe processes payment                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Payment successful                                    │
│    - Stripe webhook: payment_intent.succeeded           │
│    - Update booking status: CONFIRMED                   │
│    - Update payment status: PAID                        │
│    - Send confirmation email                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 5. After booking completion                              │
│    - Stripe automatically transfers to vendor           │
│    - Platform fee deducted                              │
│    - Create payout record                               │
└─────────────────────────────────────────────────────────┘
```

### 3. Refund Flow

```
┌─────────────────────────────────────────────────────────┐
│ 1. User requests cancellation                           │
│    - PUT /api/bookings/{id}/cancel                      │
│    - Check cancellation policy                          │
│    - Calculate refund amount                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Process refund                                        │
│    - POST /api/payments/{id}/refund                     │
│    - Create refund in Stripe                            │
│    - Update booking status: CANCELLED                   │
│    - Create refund record                               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Refund processed                                      │
│    - Stripe webhook: charge.refunded                    │
│    - Update refund status: COMPLETED                    │
│    - Send refund confirmation email                     │
│    - Funds returned to user (5-10 days)                 │
└─────────────────────────────────────────────────────────┘
```

---

## Commission Structure

### Recommended Model

**Platform Commission: 10-15%**

Example breakdown:
```
Booking Price: $100
├── Platform Fee: $10 (10%)
├── Payment Processing: $3.20 (2.9% + $0.30)
└── Vendor Receives: $86.80
```

### Configurable Commission

```sql
-- Platform settings
CREATE TABLE platform_settings (
    id BIGSERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert commission settings
INSERT INTO platform_settings (key, value, description) VALUES
('commission_rate', '10.0', 'Platform commission percentage'),
('commission_type', 'percentage', 'percentage or fixed'),
('min_commission', '1.0', 'Minimum commission in USD');
```

### Per-Vendor Commission (Optional)

```sql
-- Vendor-specific commission
ALTER TABLE vendors ADD COLUMN commission_rate DECIMAL(5, 2);
ALTER TABLE vendors ADD COLUMN commission_type VARCHAR(20) DEFAULT 'percentage';

-- NULL = use platform default
-- Custom rate for special vendors
```

---

## Payment Methods Support

### Phase 1: Launch (Essential)
- ✅ Credit/Debit Cards (Visa, Mastercard, Amex)
- ✅ Digital Wallets (Apple Pay, Google Pay)

### Phase 2: Growth (3-6 months)
- ✅ Bank transfers (ACH, SEPA)
- ✅ Buy Now Pay Later (Klarna, Afterpay)
- ✅ Local payment methods (region-specific)

### Phase 3: Advanced (6-12 months)
- ✅ Platform wallet/credits
- ✅ Subscription plans
- ✅ Gift cards

---

## API Endpoints

### Vendor Payment Account
```
POST   /api/vendor/payment-account/create
GET    /api/vendor/payment-account
PUT    /api/vendor/payment-account/update
GET    /api/vendor/payment-account/onboarding-url
GET    /api/vendor/payment-account/dashboard-url
```

### Payments
```
POST   /api/payments/create-intent
POST   /api/payments/confirm
GET    /api/payments/{id}
GET    /api/payments/booking/{bookingId}
```

### Refunds
```
POST   /api/refunds/create
GET    /api/refunds/{id}
GET    /api/refunds/booking/{bookingId}
```

### Payouts (Vendor)
```
GET    /api/vendor/payouts
GET    /api/vendor/payouts/{id}
GET    /api/vendor/balance
```

### Webhooks
```
POST   /api/webhooks/stripe
```

---

## Security Considerations

### PCI Compliance
- ✅ Never store card details
- ✅ Use Stripe Elements (PCI-compliant)
- ✅ Tokenize payment methods
- ✅ HTTPS only

### Fraud Prevention
- ✅ Stripe Radar (built-in fraud detection)
- ✅ 3D Secure authentication
- ✅ Velocity checks (limit bookings per user)
- ✅ IP address verification

### Data Protection
- ✅ Encrypt sensitive data
- ✅ Audit trail for all transactions
- ✅ Regular security audits
- ✅ GDPR compliance

---

## Implementation Phases

### Phase 1: MVP (Week 1-2)
```
✅ Stripe Connect integration
✅ Vendor onboarding flow
✅ Basic payment for bookings
✅ Webhook handling
✅ Payment confirmation emails
```

### Phase 2: Core Features (Week 3-4)
```
✅ Refund processing
✅ Cancellation policies
✅ Payment history
✅ Vendor payout tracking
✅ Commission calculation
```

### Phase 3: Advanced (Month 2-3)
```
✅ Multiple payment methods
✅ Partial refunds
✅ Dispute handling
✅ Analytics dashboard
✅ Automated payouts
```

### Phase 4: Optimization (Month 3+)
```
✅ Platform wallet
✅ Subscription plans
✅ Dynamic pricing
✅ Promotional codes
✅ Gift cards
```

---

## Cost Analysis

### Stripe Fees

**Standard Pricing:**
- Online payments: 2.9% + $0.30 per transaction
- Connect platform fee: No additional fee
- Payout fee: $0 (included)

**Example Transaction:**
```
Booking: $100
├── Stripe fee: $3.20 (2.9% + $0.30)
├── Platform commission: $10.00 (10%)
├── Vendor receives: $86.80
└── Platform net: $6.80 (after Stripe fee)
```

### Monthly Costs (Estimated)

**100 bookings/month @ $50 average:**
```
Total GMV: $5,000
├── Stripe fees: ~$160
├── Platform revenue: $500 (10% commission)
└── Platform net: $340
```

**1,000 bookings/month @ $50 average:**
```
Total GMV: $50,000
├── Stripe fees: ~$1,600
├── Platform revenue: $5,000
└── Platform net: $3,400
```

---

## Testing Strategy

### Stripe Test Mode
```
✅ Use test API keys
✅ Test card numbers provided by Stripe
✅ Simulate webhooks
✅ Test all payment scenarios
```

### Test Scenarios
```
1. Successful payment
2. Failed payment (insufficient funds)
3. 3D Secure authentication
4. Refund processing
5. Partial refund
6. Webhook failures
7. Vendor payout
8. Commission calculation
```

---

## Compliance & Legal

### Required
- ✅ Terms of Service (payment terms)
- ✅ Privacy Policy (payment data handling)
- ✅ Refund Policy
- ✅ Vendor Agreement (commission terms)

### Recommended
- ✅ Payment processing agreement
- ✅ Dispute resolution process
- ✅ Chargeback handling policy
- ✅ Tax documentation (1099-K for vendors)

---

## Monitoring & Analytics

### Key Metrics
```
- Total transaction volume (GMV)
- Platform revenue (commissions)
- Average booking value
- Payment success rate
- Refund rate
- Chargeback rate
- Vendor payout schedule
```

### Alerts
```
- Failed payments
- High refund rate
- Webhook failures
- Suspicious activity
- Payout failures
```

---

## Recommendation Summary

### For MVP Launch: ⭐

**Payment Gateway**: Stripe Connect (Express Accounts)
**Model**: Platform as aggregator
**Commission**: 10% platform fee
**Payment Methods**: Cards + Digital Wallets
**Timeline**: 2-3 weeks implementation

**Why:**
- ✅ Fast implementation
- ✅ Professional solution
- ✅ Scalable
- ✅ Great developer experience
- ✅ Built-in fraud protection

### Future Enhancements:
- Month 2: Add refund automation
- Month 3: Multiple payment methods
- Month 6: Platform wallet
- Month 12: Subscription plans

---

## Questions for You

1. **Commission Rate**: What percentage do you want to charge vendors?
   - Suggested: 10-15%
   - Industry standard: 10-20%

2. **Payout Schedule**: How often should vendors receive payouts?
   - Daily (Stripe default)
   - Weekly (recommended for control)
   - Monthly (better cash flow for platform)

3. **Cancellation Policy**: What's the refund policy?
   - Full refund if cancelled 24h+ before
   - 50% refund if cancelled 12-24h before
   - No refund if cancelled <12h before

4. **Minimum Booking Amount**: Any minimum?
   - Suggested: $10-20 (to cover processing fees)

5. **Currency Support**: Which currencies initially?
   - USD only for MVP?
   - Multi-currency from start?

6. **Region**: Where will you launch first?
   - Important for payment method selection
   - Affects Stripe availability

**Ready to proceed with Stripe Connect integration?**
