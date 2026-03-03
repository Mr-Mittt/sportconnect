# Client-Server Connection Troubleshooting

## Problem
Client getting `401 Unauthorized` error when calling `/api/auth/register`

## Root Cause Analysis

### ✅ What's Already Correct
1. **SecurityConfig** - `/api/auth/**` is permitted for all (line 43)
2. **CORS Config** - `http://localhost:3000` is allowed (line 69)
3. **JWT Filter** - Only processes requests with Bearer token, doesn't block unauthenticated requests
4. **Proxy Config** - `package.json` has `"proxy": "http://localhost:8080"`
5. **AuthController** - `/api/auth/register` endpoint exists and is public

### 🔍 Likely Issues

#### Issue 1: Backend Server Not Running
**Check:**
```bash
# Verify server is running on port 8080
netstat -ano | findstr :8080

# Or check server logs
./gradlew bootRun
```

**Expected:** Server should be running and listening on port 8080

#### Issue 2: Database Not Ready
The server won't start if database connection fails.

**Check:**
```bash
# Verify PostgreSQL container is running
docker ps

# Check database exists
docker exec -it <container_name> psql -U postgres -l
```

**Expected:** `sportconnect_dev` database should exist with PostGIS extension

#### Issue 3: React Proxy Not Working
Create React App proxy only works in development mode.

**Check:**
```bash
# Make sure you're running in dev mode
npm start

# NOT npm run build
```

#### Issue 4: Port Mismatch
**Check application.yml:**
```yaml
server:
  port: 8080  # Must match proxy in package.json
```

## Solutions

### Solution 1: Start Backend Server
```bash
cd server
./gradlew bootRun
```

Wait for: `Started SportConnectApplication in X seconds`

### Solution 2: Recreate Database (if needed)
```bash
# Find container
docker ps

# Recreate database with all extensions
docker exec -it <container_name> psql -U postgres -c "DROP DATABASE IF EXISTS sportconnect_dev;"
docker exec -it <container_name> psql -U postgres -c "CREATE DATABASE sportconnect_dev;"
docker exec -it <container_name> psql -U postgres -d sportconnect_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"
docker exec -it <container_name> psql -U postgres -d sportconnect_dev -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

### Solution 3: Restart React Dev Server
```bash
# Stop current server (Ctrl+C)
# Clear cache and restart
rm -rf node_modules/.cache
npm start
```

### Solution 4: Test Backend Directly
Before testing through React, verify backend works:

```bash
# Test register endpoint directly
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "fullName": "Test User"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "user": { ... }
  }
}
```

## Step-by-Step Verification

### 1. Check Backend Server
```bash
# Terminal 1: Start backend
cd server
./gradlew bootRun

# Wait for: "Started SportConnectApplication"
```

### 2. Test Backend Endpoint
```bash
# Terminal 2: Test with curl
curl -v http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test1234","fullName":"Test"}'
```

### 3. Check React Dev Server
```bash
# Terminal 3: Start React
cd client
npm start

# Should open http://localhost:3000
```

### 4. Check Browser Console
- Open DevTools (F12)
- Go to Network tab
- Try to register
- Check:
  - Request URL (should be `/api/auth/register`)
  - Request Method (should be POST)
  - Status Code (should be 200, not 401)
  - Response Headers (check CORS headers)

## Common Mistakes

### ❌ Wrong: Using Full URL in Client Code
```javascript
// DON'T DO THIS
fetch('http://localhost:8080/api/auth/register', ...)
```

### ✅ Correct: Using Relative URL (Proxy Handles It)
```javascript
// DO THIS - proxy will forward to backend
fetch('/api/auth/register', ...)
```

### ❌ Wrong: Backend Not Running
Client shows 401 or network error because there's nothing listening on port 8080.

### ✅ Correct: Both Servers Running
- Backend: `http://localhost:8080` (Spring Boot)
- Frontend: `http://localhost:3000` (React Dev Server)
- Proxy forwards `/api/*` requests from 3000 → 8080

## Quick Checklist

- [ ] PostgreSQL container running
- [ ] Database `sportconnect_dev` exists
- [ ] PostGIS and uuid-ossp extensions enabled
- [ ] Backend server running on port 8080
- [ ] Backend shows "Started SportConnectApplication"
- [ ] React dev server running on port 3000
- [ ] Browser pointing to `http://localhost:3000`
- [ ] Network tab shows request going to `/api/auth/register`
- [ ] No CORS errors in console

## Still Not Working?

### Check Server Logs
Look for errors in backend console:
- Database connection errors
- Schema validation errors
- Port already in use

### Check Browser Console
Look for:
- CORS errors
- Network errors
- 401/403 errors

### Enable Debug Logging
Add to `application.yml`:
```yaml
logging:
  level:
    com.sportconnect: DEBUG
    org.springframework.security: DEBUG
    org.springframework.web.cors: DEBUG
```

Restart backend and check logs for security/CORS issues.
