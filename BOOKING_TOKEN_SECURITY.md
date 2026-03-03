# Booking Token Security Analysis

## Question: Can an Anonymous User Create a Fake Token?

### Short Answer: **NO, if implemented correctly** ✅

But let's analyze all potential attack vectors and how to prevent them.

---

## Potential Attack Vectors

### Attack 1: Random Token Generation ❌

**Attack Scenario:**
```
Attacker tries to guess valid token:
├── Generates random: BK-XXXX-XXXX-XXXX
├── Shows to vendor
└── Hopes it's valid
```

**Why It Fails:**
- Token space is huge: 36^12 = 4.7 trillion combinations
- Token must exist in database
- Token must match booking details
- Token must not be expired or used
- **Probability of success: ~0%**

**Prevention:**
```sql
-- Token lookup requires exact match
SELECT * FROM booking_tokens 
WHERE token_code = 'BK-A7F3-9D2E-C1B4'
AND is_used = FALSE
AND expires_at > NOW();

-- No match = Invalid token
```

---

### Attack 2: Token Reuse ❌

**Attack Scenario:**
```
Attacker sees someone's QR code:
├── Takes photo of QR code
├── Uses it before legitimate user
└── Gets free booking
```

**Why It Can Succeed (if not prevented):**
- Token is valid
- Token hasn't been used yet
- System accepts first use

**Prevention Strategy:**

#### Solution 1: One-Time Use Token (Recommended) ⭐
```sql
-- Mark token as used immediately
UPDATE booking_tokens 
SET is_used = TRUE,
    used_at = NOW(),
    used_by_vendor_id = :vendorId
WHERE token_code = :token
AND is_used = FALSE;

-- Second attempt fails
-- Token already marked as used
```

#### Solution 2: Time-Window Verification
```sql
-- Token only valid 15 minutes before booking
SELECT * FROM booking_tokens bt
JOIN bookings b ON bt.booking_id = b.id
WHERE bt.token_code = :token
AND b.booking_date = CURRENT_DATE
AND b.start_time BETWEEN (CURRENT_TIME - INTERVAL '15 minutes') 
                     AND (CURRENT_TIME + INTERVAL '15 minutes');
```

#### Solution 3: Location-Based Verification
```sql
-- Token only valid at correct facility
SELECT * FROM booking_tokens bt
JOIN bookings b ON bt.booking_id = b.id
JOIN facilities f ON b.facility_id = f.id
WHERE bt.token_code = :token
AND f.vendor_id = :currentVendorId;

-- Token won't work at wrong facility
```

---

### Attack 3: Token Forgery (Creating Fake QR Code) ❌

**Attack Scenario:**
```
Attacker creates fake QR code:
├── Generates QR with fake data
├── Shows to vendor
└── Vendor scans it
```

**QR Code Data (Attacker's Attempt):**
```json
{
  "token": "BK-FAKE-FAKE-FAKE",
  "booking_id": 99999,
  "facility_name": "Court 1",
  "date": "2026-03-15",
  "time": "10:00-12:00"
}
```

**Why It Fails:**
1. **Database Validation**
   ```java
   // Backend verifies token exists in database
   BookingToken token = tokenRepository.findByTokenCode("BK-FAKE-FAKE-FAKE");
   if (token == null) {
       throw new InvalidTokenException("Token not found");
   }
   ```

2. **Hash Verification**
   ```java
   // Token includes cryptographic hash
   String expectedHash = generateHash(bookingId, userId, timestamp, SECRET_KEY);
   if (!token.getHash().equals(expectedHash)) {
       throw new InvalidTokenException("Token hash mismatch");
   }
   ```

3. **Vendor Verification**
   ```java
   // Token must belong to vendor's facility
   if (!token.getBooking().getFacility().getVendor().getId().equals(vendorId)) {
       throw new UnauthorizedException("Token not for this facility");
   }
   ```

**Prevention:**
- ✅ Never trust QR code data alone
- ✅ Always validate against database
- ✅ Use cryptographic hashing
- ✅ Verify vendor ownership

---

### Attack 4: Database Injection ❌

**Attack Scenario:**
```
Attacker tries SQL injection:
├── Token: BK-XXXX'; DROP TABLE bookings; --
└── Hopes to bypass validation
```

**Why It Fails:**
- Using JPA/Hibernate with parameterized queries
- Input validation and sanitization
- No direct SQL concatenation

**Prevention:**
```java
// Safe: Parameterized query
@Query("SELECT bt FROM BookingToken bt WHERE bt.tokenCode = :token")
BookingToken findByTokenCode(@Param("token") String token);

// Unsafe: Never do this
// String query = "SELECT * FROM booking_tokens WHERE token_code = '" + token + "'";
```

---

### Attack 5: Man-in-the-Middle (MITM) ❌

**Attack Scenario:**
```
Attacker intercepts token during transfer:
├── User A transfers to User C
├── Attacker intercepts token
└── Uses it before User C
```

**Why It Can Succeed (if not prevented):**
- Token transmitted over network
- Attacker captures token
- Uses it immediately

**Prevention:**

#### Solution 1: HTTPS Only
```yaml
# application.yml
server:
  ssl:
    enabled: true
  require-ssl: true
```

#### Solution 2: Token Regeneration on Transfer
```java
// Generate new token after transfer
public void transferBooking(Long bookingId, UUID toUserId) {
    // Update ownership
    booking.setUserId(toUserId);
    
    // Generate NEW token (old one becomes invalid)
    String newToken = generateUniqueToken();
    bookingToken.setTokenCode(newToken);
    bookingToken.setCurrentOwnerId(toUserId);
    
    // Old token can't be used
}
```

#### Solution 3: Transfer Confirmation Required
```java
// Transfer requires recipient confirmation
public void confirmTransfer(String transferId, String confirmationCode) {
    Transfer transfer = transferRepository.findById(transferId);
    
    // Verify confirmation code sent to recipient
    if (!transfer.getConfirmationCode().equals(confirmationCode)) {
        throw new InvalidConfirmationException();
    }
    
    // Only then activate new token
    transfer.setStatus(TransferStatus.COMPLETED);
    bookingToken.setCurrentOwnerId(transfer.getToUserId());
}
```

---

### Attack 6: Replay Attack ❌

**Attack Scenario:**
```
Attacker records valid verification request:
├── Captures HTTP request with valid token
├── Replays it later
└── Gets multiple check-ins
```

**Why It Fails:**
- One-time use tokens
- Timestamp validation
- Nonce/request ID

**Prevention:**
```java
@PostMapping("/vendor/verify-token")
public VerificationResponse verifyToken(@RequestBody VerificationRequest request) {
    // Check if already used
    if (token.isUsed()) {
        throw new TokenAlreadyUsedException();
    }
    
    // Check timestamp (prevent old replays)
    if (request.getTimestamp() < System.currentTimeMillis() - 60000) {
        throw new RequestExpiredException();
    }
    
    // Mark as used immediately (atomic operation)
    tokenRepository.markAsUsed(token.getId());
    
    // Log verification
    verificationLogRepository.save(new VerificationLog(
        token.getId(),
        vendorId,
        request.getIpAddress(),
        request.getDeviceInfo()
    ));
}
```

---

## Secure Token Generation

### Current Implementation (Secure)

```java
public class BookingTokenService {
    
    private static final String SECRET_KEY = "your-secret-key-from-env";
    
    public String generateToken(Booking booking, User user) {
        // Generate random component
        String randomPart = generateRandomAlphanumeric(12);
        
        // Create token code
        String tokenCode = String.format("BK-%s-%s-%s",
            randomPart.substring(0, 4),
            randomPart.substring(4, 8),
            randomPart.substring(8, 12)
        );
        
        // Generate cryptographic hash
        String hash = generateSecureHash(
            booking.getId(),
            user.getId(),
            System.currentTimeMillis(),
            SECRET_KEY
        );
        
        // Create token entity
        BookingToken token = new BookingToken();
        token.setTokenCode(tokenCode);
        token.setHash(hash);
        token.setBookingId(booking.getId());
        token.setCurrentOwnerId(user.getId());
        token.setOriginalOwnerId(user.getId());
        token.setExpiresAt(booking.getBookingDate().atTime(booking.getEndTime()));
        
        return tokenRepository.save(token);
    }
    
    private String generateSecureHash(Long bookingId, UUID userId, 
                                      long timestamp, String secret) {
        String data = bookingId + "|" + userId + "|" + timestamp;
        return Hashing.sha256()
            .hashString(data + secret, StandardCharsets.UTF_8)
            .toString();
    }
}
```

---

## Verification Flow (Secure)

```java
@Service
public class TokenVerificationService {
    
    @Transactional
    public VerificationResult verifyToken(String tokenCode, Long vendorId) {
        // 1. Find token in database
        BookingToken token = tokenRepository.findByTokenCode(tokenCode)
            .orElseThrow(() -> new InvalidTokenException("Token not found"));
        
        // 2. Check if already used
        if (token.isUsed()) {
            throw new TokenAlreadyUsedException("Token already used at " + token.getUsedAt());
        }
        
        // 3. Check expiration
        if (token.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new TokenExpiredException("Token expired");
        }
        
        // 4. Load booking details
        Booking booking = token.getBooking();
        
        // 5. Verify vendor ownership
        if (!booking.getFacility().getVendor().getId().equals(vendorId)) {
            throw new UnauthorizedException("Token not valid for this facility");
        }
        
        // 6. Verify booking date
        if (!booking.getBookingDate().equals(LocalDate.now())) {
            throw new InvalidDateException("Booking is for " + booking.getBookingDate());
        }
        
        // 7. Verify time window (15 min before to 15 min after start)
        LocalTime now = LocalTime.now();
        LocalTime startTime = booking.getStartTime();
        if (now.isBefore(startTime.minusMinutes(15)) || 
            now.isAfter(startTime.plusMinutes(15))) {
            throw new InvalidTimeException("Outside check-in window");
        }
        
        // 8. Verify hash (if using hash-based tokens)
        if (!verifyTokenHash(token)) {
            throw new InvalidTokenException("Token hash verification failed");
        }
        
        // 9. Mark as used (ATOMIC - prevents race condition)
        int updated = tokenRepository.markAsUsedAtomic(
            token.getId(), 
            vendorId, 
            LocalDateTime.now()
        );
        
        if (updated == 0) {
            // Another request already marked it as used
            throw new ConcurrentUseException("Token was just used by another request");
        }
        
        // 10. Log verification
        logVerification(token, vendorId);
        
        // 11. Return success
        return VerificationResult.builder()
            .valid(true)
            .bookingId(booking.getId())
            .currentOwner(token.getCurrentOwner())
            .originalOwner(token.getOriginalOwner())
            .transferHistory(getTransferHistory(token))
            .build();
    }
    
    @Query("UPDATE BookingToken SET isUsed = true, usedAt = :usedAt, " +
           "usedByVendorId = :vendorId WHERE id = :tokenId AND isUsed = false")
    int markAsUsedAtomic(@Param("tokenId") Long tokenId, 
                        @Param("vendorId") Long vendorId,
                        @Param("usedAt") LocalDateTime usedAt);
}
```

---

## Additional Security Measures

### 1. Rate Limiting

```java
@RateLimiter(name = "tokenVerification", fallbackMethod = "rateLimitFallback")
@PostMapping("/vendor/verify-token")
public VerificationResponse verifyToken(@RequestBody VerificationRequest request) {
    // Limit: 10 verification attempts per minute per vendor
}
```

### 2. IP Whitelisting (Optional)

```java
// Only allow verification from vendor's registered IP
if (!vendorService.isIpWhitelisted(vendorId, request.getIpAddress())) {
    throw new UnauthorizedIpException();
}
```

### 3. Device Fingerprinting

```java
// Track device used for verification
VerificationLog log = new VerificationLog();
log.setDeviceFingerprint(request.getDeviceFingerprint());
log.setUserAgent(request.getUserAgent());
log.setIpAddress(request.getIpAddress());

// Alert on suspicious patterns
if (suspiciousActivityDetector.isAnomalous(log)) {
    alertService.notifySecurityTeam(log);
}
```

### 4. Geolocation Verification

```java
// Verify check-in location matches facility location
double distance = calculateDistance(
    request.getLatitude(), 
    request.getLongitude(),
    facility.getLatitude(),
    facility.getLongitude()
);

if (distance > 100) { // 100 meters
    throw new LocationMismatchException("Check-in too far from facility");
}
```

---

## QR Code Security Best Practices

### 1. Signed QR Codes

```java
// QR code includes signature
QRCodeData qrData = new QRCodeData();
qrData.setToken(tokenCode);
qrData.setBookingId(bookingId);
qrData.setTimestamp(System.currentTimeMillis());

// Add signature
String signature = signData(qrData, PRIVATE_KEY);
qrData.setSignature(signature);

// Generate QR code with signed data
String qrCodeJson = objectMapper.writeValueAsString(qrData);
```

### 2. QR Code Verification

```java
// Verify signature when scanning
QRCodeData qrData = parseQRCode(scannedData);

if (!verifySignature(qrData, qrData.getSignature(), PUBLIC_KEY)) {
    throw new InvalidQRCodeException("QR code signature invalid");
}

// Then verify token in database
verifyToken(qrData.getToken(), vendorId);
```

### 3. Dynamic QR Codes (Advanced)

```java
// QR code changes every 30 seconds
public String generateDynamicQRCode(String tokenCode) {
    long timestamp = System.currentTimeMillis() / 30000; // 30-second window
    String dynamicToken = tokenCode + "|" + timestamp;
    String hash = Hashing.sha256()
        .hashString(dynamicToken + SECRET_KEY, StandardCharsets.UTF_8)
        .toString();
    
    return tokenCode + "|" + timestamp + "|" + hash;
}

// Verification accepts tokens within time window
public boolean verifyDynamicQRCode(String scannedData) {
    String[] parts = scannedData.split("\\|");
    String tokenCode = parts[0];
    long timestamp = Long.parseLong(parts[1]);
    String providedHash = parts[2];
    
    // Check if timestamp is within acceptable window (±1 period = 60 seconds)
    long currentPeriod = System.currentTimeMillis() / 30000;
    if (Math.abs(currentPeriod - timestamp) > 2) {
        return false; // QR code too old
    }
    
    // Verify hash
    String expectedHash = Hashing.sha256()
        .hashString(tokenCode + "|" + timestamp + SECRET_KEY, StandardCharsets.UTF_8)
        .toString();
    
    return expectedHash.equals(providedHash);
}
```

---

## Summary: Attack Prevention

| Attack Vector | Can Succeed? | Prevention |
|--------------|-------------|------------|
| Random token generation | ❌ No | Database validation, huge token space |
| Token reuse | ❌ No | One-time use, atomic marking |
| Token forgery | ❌ No | Database validation, cryptographic hash |
| SQL injection | ❌ No | Parameterized queries, JPA |
| MITM | ❌ No | HTTPS, token regeneration on transfer |
| Replay attack | ❌ No | One-time use, timestamp validation |
| Brute force | ❌ No | Rate limiting, account lockout |

---

## Recommended Implementation

### Minimum Security (MVP)

```java
✅ Database validation
✅ One-time use tokens
✅ Expiration checking
✅ Vendor ownership verification
✅ HTTPS only
✅ Parameterized queries
```

### Enhanced Security (Production)

```java
✅ All minimum security features
✅ Cryptographic hashing
✅ Rate limiting
✅ Geolocation verification
✅ Device fingerprinting
✅ Audit logging
✅ Anomaly detection
```

### Advanced Security (Enterprise)

```java
✅ All enhanced security features
✅ Signed QR codes
✅ Dynamic QR codes (rotating)
✅ IP whitelisting
✅ Multi-factor verification
✅ Real-time fraud detection
✅ Blockchain anchoring (optional)
```

---

## Conclusion

**Can an anonymous user create a fake token?**

**NO** - if you implement:
1. ✅ Database validation (token must exist)
2. ✅ Cryptographic hashing (token must be valid)
3. ✅ One-time use (token can't be reused)
4. ✅ Vendor verification (token must match facility)
5. ✅ HTTPS (prevent interception)

**The token system is secure because:**
- Tokens are generated server-side only
- Tokens are stored in database with cryptographic hashes
- QR codes are just pointers to database records
- All verification happens server-side
- Multiple layers of validation

**An attacker would need to:**
- Hack your database (to create valid token)
- Break SHA-256 hashing (computationally infeasible)
- Bypass all validation layers
- **Probability: Essentially 0%**

Your booking verification system is **secure** with proper implementation! 🔒
