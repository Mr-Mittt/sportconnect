# Authorization Header Fix

## Problem
After successful login, the JWT token was stored in `localStorage` but **not added to subsequent API requests**. This caused `JwtAuthenticationFilter` to fail at line 36 because no Authorization header was present.

## Root Cause
The client was using plain `fetch()` calls without adding the `Authorization: Bearer <token>` header.

## Solution

### 1. Created Axios API Utility (`client/src/utils/api.js`)
- **Request Interceptor**: Automatically adds `Authorization: Bearer <token>` to all requests
- **Response Interceptor**: Handles 401 errors and automatic token refresh
- **Token Refresh Flow**: If access token expires, automatically uses refresh token to get a new one

### 2. Updated SocialFeed Component
Changed from:
```javascript
const response = await fetch('/api/posts/feed?...');
```

To:
```javascript
import api from '../../utils/api';
const response = await api.get('/posts/feed?...');
```

## How It Works

### Login Flow
1. User logs in via `/api/auth/login`
2. Server returns `accessToken` and `refreshToken`
3. Client stores both in `localStorage`
4. Client navigates to `/feed`

### Authenticated Request Flow
1. Component makes API call: `api.get('/posts/feed')`
2. **Request Interceptor** adds header: `Authorization: Bearer <accessToken>`
3. Server's `JwtAuthenticationFilter` validates token
4. Request succeeds ✅

### Token Refresh Flow
1. Access token expires (401 error)
2. **Response Interceptor** catches 401
3. Calls `/api/auth/refresh` with `refreshToken`
4. Gets new `accessToken`
5. Retries original request with new token
6. If refresh fails → redirect to `/login`

## Usage

### For New Components
Always use the `api` utility instead of `fetch()`:

```javascript
import api from '../utils/api';

// GET request
const response = await api.get('/posts/feed');

// POST request
const response = await api.post('/posts', { content: 'Hello' });

// PUT request
const response = await api.put('/posts/123', { content: 'Updated' });

// DELETE request
const response = await api.delete('/posts/123');
```

### For Login/Register (Public Endpoints)
These can still use `fetch()` since they don't require authentication:
```javascript
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
```

## Files Modified
1. ✅ Created `client/src/utils/api.js` - Axios instance with interceptors
2. ✅ Updated `client/src/components/social/SocialFeed.jsx` - Use api utility

## Testing
1. Login at `http://localhost:3000/login`
2. Navigate to `/feed`
3. Check browser DevTools → Network tab
4. Verify requests have `Authorization: Bearer <token>` header
5. Feed should load successfully ✅

## Next Steps
Update other components that make authenticated API calls to use the `api` utility:
- CreatePostForm
- PostCard (for like/comment actions)
- Any user profile components
- Any sport-related components
