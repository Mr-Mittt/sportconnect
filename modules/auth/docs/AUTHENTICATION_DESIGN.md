# Authentication & Authorization Design

## Overview

Unified authentication system supporting:
- ✅ Email/Password registration
- ✅ Social login (Google, Facebook, etc.)
- ✅ Role-based access control
- ✅ JWT token-based authentication

---

## Database Schema

### Users Table
```sql
users
├── id (PK, UUID)
├── email (UNIQUE, NOT NULL)
├── password_hash (nullable for social login)
├── first_name
├── last_name
├── phone
├── avatar_url
├── date_of_birth
├── gender (MALE, FEMALE, OTHER)
├── email_verified (boolean, default: false)
├── status (ACTIVE, SUSPENDED, DELETED)
├── created_at
├── updated_at
└── last_login_at
```

### User Roles Table
```sql
user_roles
├── id (PK)
├── user_id (FK to users)
├── role (ENUM: USER, VENDOR, ADMIN, GROUP_OWNER)
├── created_at
└── updated_at

-- A user can have multiple roles
-- Example: A user can be both USER and VENDOR
```

### Social Accounts Table
```sql
social_accounts
├── id (PK)
├── user_id (FK to users)
├── provider (GOOGLE, FACEBOOK, APPLE)
├── provider_user_id (provider's unique ID)
├── access_token (encrypted)
├── refresh_token (encrypted)
├── expires_at
├── created_at
└── updated_at

-- UNIQUE constraint on (provider, provider_user_id)
```

### Email Verification Tokens
```sql
email_verification_tokens
├── id (PK)
├── user_id (FK to users)
├── token (UUID, UNIQUE)
├── expires_at
├── verified_at
└── created_at
```

### Password Reset Tokens
```sql
password_reset_tokens
├── id (PK)
├── user_id (FK to users)
├── token (UUID, UNIQUE)
├── expires_at
├── used_at
└── created_at
```

---

## Authentication Flow

### 1. Email/Password Registration

```
User Registration Flow:
┌─────────────────────────────────────────────────────────┐
│ 1. User submits registration form                       │
│    - Email (unique)                                     │
│    - Password (min 8 chars, hashed with BCrypt)        │
│    - First name, Last name                             │
│    - Optional: Phone, Date of birth                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Backend validates                                     │
│    - Email not already registered                       │
│    - Password meets requirements                        │
│    - All required fields present                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Create user record                                    │
│    - Hash password with BCrypt                          │
│    - Set email_verified = false                         │
│    - Assign default role: USER                          │
│    - Generate verification token                        │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Send verification email                               │
│    - Link: /verify-email?token={token}                 │
│    - Token expires in 24 hours                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 5. User clicks verification link                         │
│    - Mark email_verified = true                         │
│    - Delete verification token                          │
│    - Auto-login user                                    │
└─────────────────────────────────────────────────────────┘
```

### 2. Email/Password Login

```
Login Flow:
┌─────────────────────────────────────────────────────────┐
│ 1. User submits credentials                              │
│    - Email                                              │
│    - Password                                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Backend validates                                     │
│    - Find user by email                                 │
│    - Verify password with BCrypt                        │
│    - Check user status (not suspended)                  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Generate JWT tokens                                   │
│    - Access Token (15 min expiry)                       │
│    - Refresh Token (7 days expiry)                      │
│    - Include: user_id, email, roles                     │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Return tokens to client                               │
│    - Store access token in memory                       │
│    - Store refresh token in httpOnly cookie             │
└─────────────────────────────────────────────────────────┘
```

### 3. Social Login (OAuth2)

```
Social Login Flow (Google/Facebook):
┌─────────────────────────────────────────────────────────┐
│ 1. User clicks "Login with Google/Facebook"             │
│    - Redirect to OAuth provider                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 2. User authorizes on provider's site                    │
│    - Provider redirects back with authorization code    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Backend exchanges code for tokens                     │
│    - Get access_token from provider                     │
│    - Fetch user profile (email, name, avatar)           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Check if user exists                                  │
│    - Search by email or provider_user_id                │
└─────────────────────────────────────────────────────────┘
         ↓                              ↓
    Exists                         New User
         ↓                              ↓
┌──────────────────┐         ┌──────────────────────┐
│ Link social      │         │ Create new user      │
│ account if new   │         │ - email from provider│
│                  │         │ - no password        │
│                  │         │ - email_verified=true│
│                  │         │ - default role: USER │
│                  │         │ - create social_acc  │
└──────────────────┘         └──────────────────────┘
         ↓                              ↓
         └──────────────┬───────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Generate JWT tokens and return                        │
└─────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Authentication Endpoints

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh-token
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/verify-email?token={token}
POST   /api/auth/resend-verification
```

### Social Login Endpoints

```
GET    /api/auth/oauth2/authorize/{provider}
       - Redirects to provider's OAuth page
       - Providers: google, facebook

GET    /api/auth/oauth2/callback/{provider}
       - Handles OAuth callback
       - Exchanges code for tokens
       - Creates/links user account

POST   /api/auth/social/link
       - Link social account to existing user

DELETE /api/auth/social/unlink/{provider}
       - Unlink social account
```

### User Profile Endpoints

```
GET    /api/users/me
PUT    /api/users/me
PUT    /api/users/me/password
POST   /api/users/me/avatar
DELETE /api/users/me
```

### Role Management Endpoints (Admin only)

```
POST   /api/users/{userId}/roles
DELETE /api/users/{userId}/roles/{role}
GET    /api/users/{userId}/roles
```

---

## JWT Token Structure

### Access Token Payload
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "roles": ["USER", "VENDOR"],
  "iat": 1234567890,
  "exp": 1234568790,
  "type": "access"
}
```

### Refresh Token Payload
```json
{
  "sub": "user-uuid",
  "iat": 1234567890,
  "exp": 1235172690,
  "type": "refresh"
}
```

---

## Role-Based Access Control (RBAC)

### User Roles

**1. USER (Default)**
- Browse courts/stadiums
- Make bookings
- Write reviews
- Join groups
- View own profile

**2. VENDOR**
- All USER permissions
- Manage own courts/stadiums
- View bookings for own courts
- Respond to reviews
- View analytics

**3. GROUP_OWNER**
- All USER permissions
- Create and manage groups
- Organize group bookings
- Invite members

**4. ADMIN**
- All permissions
- Manage all users
- Approve vendor registrations
- Moderate reviews
- System configuration

### Permission Matrix

| Feature | USER | VENDOR | GROUP_OWNER | ADMIN |
|---------|------|--------|-------------|-------|
| Browse courts | ✅ | ✅ | ✅ | ✅ |
| Make bookings | ✅ | ✅ | ✅ | ✅ |
| Write reviews | ✅ | ✅ | ✅ | ✅ |
| Manage courts | ❌ | ✅ (own) | ❌ | ✅ (all) |
| View bookings | ✅ (own) | ✅ (own courts) | ✅ (group) | ✅ (all) |
| Create groups | ❌ | ❌ | ✅ | ✅ |
| Approve vendors | ❌ | ❌ | ❌ | ✅ |
| Moderate content | ❌ | ❌ | ❌ | ✅ |

---

## Spring Security Configuration

### Security Filter Chain

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) {
        http
            .csrf().disable()
            .authorizeHttpRequests(auth -> auth
                // Public endpoints
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/courts/search").permitAll()
                
                // User endpoints
                .requestMatchers("/api/bookings/**").hasAnyRole("USER", "VENDOR")
                
                // Vendor endpoints
                .requestMatchers("/api/vendors/**").hasRole("VENDOR")
                
                // Admin endpoints
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                
                // All other requests require authentication
                .anyRequest().authenticated()
            )
            .oauth2Login(oauth2 -> oauth2
                .authorizationEndpoint()
                    .baseUri("/api/auth/oauth2/authorize")
                .and()
                .redirectionEndpoint()
                    .baseUri("/api/auth/oauth2/callback/*")
                .and()
                .userInfoEndpoint()
                    .userService(customOAuth2UserService)
            )
            .sessionManagement()
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            .and()
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
            
        return http.build();
    }
}
```

### JWT Authentication Filter

```java
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    
    @Override
    protected void doFilterInternal(HttpServletRequest request, 
                                    HttpServletResponse response, 
                                    FilterChain filterChain) {
        String token = extractToken(request);
        
        if (token != null && jwtService.validateToken(token)) {
            String userId = jwtService.getUserIdFromToken(token);
            List<String> roles = jwtService.getRolesFromToken(token);
            
            Authentication auth = new JwtAuthentication(userId, roles);
            SecurityContextHolder.getContext().setAuthentication(auth);
        }
        
        filterChain.doFilter(request, response);
    }
}
```

---

## Frontend Implementation

### Auth Context (React)

```jsx
// src/contexts/AuthContext.js
import { createContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on mount
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const userData = await authService.getCurrentUser();
      setUser(userData);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await authService.login(email, password);
    setUser(response.user);
    return response;
  };

  const loginWithGoogle = async () => {
    window.location.href = '/api/auth/oauth2/authorize/google';
  };

  const register = async (userData) => {
    const response = await authService.register(userData);
    return response;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  const hasRole = (role) => {
    return user?.roles?.includes(role);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      loginWithGoogle,
      register,
      logout,
      hasRole,
      isAuthenticated: !!user,
      isVendor: hasRole('VENDOR'),
      isAdmin: hasRole('ADMIN'),
    }}>
      {children}
    </AuthContext.Provider>
  );
}
```

### Protected Route Component

```jsx
// src/components/ProtectedRoute.js
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute({ children, requiredRole }) {
  const { user, loading, hasRole } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to="/unauthorized" />;
  }

  return children;
}

// Usage:
<Route path="/vendor/*" element={
  <ProtectedRoute requiredRole="VENDOR">
    <VendorDashboard />
  </ProtectedRoute>
} />
```

### Login Page Example

```jsx
// src/pages/Login.js
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button, TextField, Box, Divider } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import FacebookIcon from '@mui/icons-material/Facebook';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loginWithGoogle } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <Box sx={{ maxWidth: 400, mx: 'auto', mt: 8 }}>
      <form onSubmit={handleSubmit}>
        <TextField
          fullWidth
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          margin="normal"
          required
        />
        <TextField
          fullWidth
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          margin="normal"
          required
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          sx={{ mt: 2 }}
        >
          Login
        </Button>
      </form>

      <Divider sx={{ my: 3 }}>OR</Divider>

      <Button
        variant="outlined"
        fullWidth
        startIcon={<GoogleIcon />}
        onClick={loginWithGoogle}
        sx={{ mb: 1 }}
      >
        Continue with Google
      </Button>

      <Button
        variant="outlined"
        fullWidth
        startIcon={<FacebookIcon />}
        sx={{ mb: 1 }}
      >
        Continue with Facebook
      </Button>
    </Box>
  );
}
```

---

## Security Best Practices

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

### Token Security
- Access tokens: Short-lived (15 minutes)
- Refresh tokens: Longer-lived (7 days)
- Refresh tokens stored in httpOnly cookies
- Access tokens stored in memory (not localStorage)

### Rate Limiting
- Login attempts: 5 per 15 minutes per IP
- Registration: 3 per hour per IP
- Password reset: 3 per hour per email

### Additional Security
- HTTPS only in production
- CORS configuration
- SQL injection prevention (JPA)
- XSS prevention (input sanitization)
- CSRF protection for state-changing operations

---

## Dependencies Required

### Backend (Spring Boot)
```gradle
dependencies {
    // Security
    implementation 'org.springframework.boot:spring-boot-starter-security'
    implementation 'org.springframework.boot:spring-boot-starter-oauth2-client'
    
    // JWT
    implementation 'io.jsonwebtoken:jjwt-api:0.11.5'
    runtimeOnly 'io.jsonwebtoken:jjwt-impl:0.11.5'
    runtimeOnly 'io.jsonwebtoken:jjwt-jackson:0.11.5'
    
    // Password hashing
    implementation 'org.springframework.security:spring-security-crypto'
    
    // Validation
    implementation 'org.springframework.boot:spring-boot-starter-validation'
}
```

### Frontend (React)
```json
{
  "dependencies": {
    "react-router-dom": "^6.x",
    "axios": "^1.6.2",
    "@mui/material": "^5.x",
    "@mui/icons-material": "^5.x"
  }
}
```

---

## Next Steps

1. ✅ Implement User entity and repositories
2. ✅ Create authentication service layer
3. ✅ Set up Spring Security configuration
4. ✅ Implement JWT token generation/validation
5. ✅ Configure OAuth2 for Google/Facebook
6. ✅ Create authentication endpoints
7. ✅ Build frontend auth context and components
8. ✅ Add role-based route protection

Ready to proceed with implementation?
