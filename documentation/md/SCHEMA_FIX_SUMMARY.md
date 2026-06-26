# Schema Validation Fix Summary

## Problem
The application failed to start with schema validation errors:
```
Error creating bean with name 'entityManagerFactory': Schema-validation: wrong column type encountered in column [id] in table [sports]; found [bigserial (Types#BIGINT)], but expecting [uuid (Types#UUID)]
```

## Root Cause
Mismatch between entity definitions and database schema:
- **Sport entity**: Used `UUID` as ID type with `@GeneratedValue(strategy = GenerationType.UUID)`
- **Database migration**: Used `BIGSERIAL` (BIGINT) for sports table ID
- **UserSportProfile entity**: Used `UUID` for both ID and sportId
- **Database migration**: Used `BIGSERIAL` for user_sport_profiles table

## Solution
Changed entities to match the existing database schema (using `Long` instead of `UUID`):

### Files Modified

#### 1. Entity Classes
- `Sport.java` - Changed ID from `UUID` to `Long`, strategy from `UUID` to `IDENTITY`
- `UserSportProfile.java` - Changed ID and sportId from `UUID` to `Long`

#### 2. Repository Interfaces
- `SportRepository.java` - Changed generic type from `JpaRepository<Sport, UUID>` to `JpaRepository<Sport, Long>`
- `UserSportProfileRepository.java` - Changed generic type and sportId parameters from `UUID` to `Long`

#### 3. DTOs
- `SportResponse.java` - Changed id from `UUID` to `Long`
- `UserSportProfileResponse.java` - Changed id and sportId from `UUID` to `Long`
- `CreateUserSportProfileRequest.java` - Changed sportId from `UUID` to `Long`

#### 4. Service Interfaces
- `SportService.java` - Changed all sportId parameters from `UUID` to `Long`
- `UserSportProfileService.java` - Changed profileId and sportId parameters from `UUID` to `Long`

#### 5. Service Implementations
- `SportServiceImpl.java` - Updated all method signatures to use `Long` for sportId
- `UserSportProfileServiceImpl.java` - Updated all method signatures to use `Long` for profileId and sportId

#### 6. Controllers
- `SportController.java` - Changed all `@PathVariable` sportId and profileId from `UUID` to `Long`

## Database Schema (No Changes Required)
The database migrations remain unchanged:
- `sports` table: `id BIGSERIAL PRIMARY KEY`
- `user_sport_profiles` table: `id BIGSERIAL PRIMARY KEY`, `sport_id BIGINT REFERENCES sports(id)`
- All other social tables (posts, comments, etc.): Already using `BIGSERIAL` correctly

## Testing
After these changes:
1. All entities now match their database schema
2. Schema validation should pass
3. Server should start successfully

## Notes
- User-related tables correctly use `UUID` (users, roles, etc.)
- Social feed tables correctly use `BIGSERIAL/BIGINT` (posts, comments, likes, etc.)
- The fix maintains consistency: sports are identified by `Long`, users by `UUID`
