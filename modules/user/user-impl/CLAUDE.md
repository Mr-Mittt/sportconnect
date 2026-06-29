# CLAUDE.md — user-impl

User entity with UUID PK and PostGIS geolocation, role management, profile CRUD, and soft delete.

## Dependencies

| From | Why |
|---|---|
| `modules/user/user-api` | UserService interface + all DTOs |
| `modules/common` | ApiResponse<T>, shared exceptions |
| Hibernate Spatial 6.4.0 | Maps `geography(Point,4326)` to JTS `Point` |
| JTS 1.19.0 | `GeometryFactory`, `Point`, `Coordinate` |

## Key Classes

| Class | Purpose |
|---|---|
| `User` | UUID PK; PostGIS `Point` location; `isActive` soft delete; eager ManyToMany roles |
| `UserServiceImpl` | CRUD + location conversion; `GeometryFactory(PrecisionModel(), 4326)` created in constructor |
| `UserController` | `/api/users/**` — all GET endpoints are public (declared in auth-impl's `SecurityConfig`) |

## Location Pattern

```java
// Creating a point — always longitude=X, latitude=Y
Coordinate coord = new Coordinate(request.getLongitude(), request.getLatitude());
Point point = geometryFactory.createPoint(coord);

// Reading back
double latitude  = point.getY();
double longitude = point.getX();
```

## Endpoints

```
GET    /api/users/{userId}
GET    /api/users/email/{email}
GET    /api/users/username/{username}
GET    /api/users/check/email?email=
GET    /api/users/check/username?username=
PUT    /api/users/{userId}/profile       ROLE_USER
DELETE /api/users/{userId}               ROLE_ADMIN
```

## Run Tests

```bash
./gradlew :modules:user:user-impl:test
```

## Gotchas

- `leetcode.java` and `leetcodeSpec.groovy` are scratch files — not application code, ignore them.
- `UserServiceImpl.createUser()` fetches the `USER` role by name and throws `RuntimeException` if missing — V001 migration seeds it.
- `updateUserPassword()` receives a **pre-hashed** value from auth-impl — never hash it again here.
- `UserPreference` entity and table (V001) exist but have **no service or controller** yet.
- Always use `findByIdAndIsActiveTrue()` in new queries — `findById()` returns soft-deleted users too.
