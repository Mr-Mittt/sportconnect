# Complete Schema Validation Fixes

## All Migration Files Fixed

### ✅ V001__create_users_and_roles.sql
**Table: users**
- ✅ Added `city VARCHAR(100)`
- ✅ Added `country VARCHAR(100)`

All columns now match User entity:
- id, email, password_hash, first_name, last_name
- username, phone_number, date_of_birth, gender, bio
- avatar_url, cover_url, location
- **city, country** ← ADDED
- is_email_verified, is_active, last_login_at
- created_at, updated_at

### ✅ V003__create_sports_tables.sql

**Table: sports**
- ✅ Changed id from UUID to BIGSERIAL
- ✅ Added `category VARCHAR(50)`
- ✅ Added `min_players INTEGER`
- ✅ Added `max_players INTEGER`

**Table: user_sport_profiles**
- ✅ Changed id from UUID to BIGSERIAL
- ✅ Changed sport_id from UUID to BIGINT
- ✅ Renamed `years_experience` → `years_of_experience`
- ✅ Renamed `notes` → `bio`
- ✅ Removed `play_frequency` column
- ✅ Made `skill_level` nullable (removed NOT NULL)

### ✅ V004__create_posts_tables.sql
All tables already correct:
- posts ✅
- post_media ✅
- post_likes ✅
- comments ✅
- comment_likes ✅

### ✅ V005__create_social_tables.sql
All tables already correct:
- user_follows ✅
- hashtags ✅
- post_hashtags ✅
- notifications ✅
- user_blocks ✅
- post_reports ✅

## Summary of All Changes

### Entity Type Changes
- Sport.id: UUID → Long
- UserSportProfile.id: UUID → Long
- UserSportProfile.sportId: UUID → Long

### Added Columns
1. **sports table:**
   - category
   - min_players
   - max_players

2. **users table:**
   - city
   - country

3. **user_sport_profiles table:**
   - bio (renamed from notes)
   - years_of_experience (renamed from years_experience)

### Removed Columns
- user_sport_profiles.play_frequency

### Modified Constraints
- user_sport_profiles.skill_level: NOT NULL → nullable

## Files Modified
1. `V001__create_users_and_roles.sql` - Added city, country
2. `V003__create_sports_tables.sql` - Fixed sports and user_sport_profiles tables
3. 12 Java entity/DTO/service/controller files - Changed UUID to Long for Sport IDs

## Database Recreation Required
Since Liquibase already ran the old migrations, you must:

```bash
# Find container
docker ps

# Recreate database
docker exec -it <container_name> psql -U postgres -c "DROP DATABASE IF EXISTS sportconnect_dev;"
docker exec -it <container_name> psql -U postgres -c "CREATE DATABASE sportconnect_dev;"

# Enable extensions
docker exec -it <container_name> psql -U postgres -d sportconnect_dev -c "CREATE EXTENSION IF NOT EXISTS postgis;"
docker exec -it <container_name> psql -U postgres -d sportconnect_dev -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

# Start server
./gradlew bootRun
```

## Verification
All schema validation errors should now be resolved:
- ✅ No missing columns
- ✅ No type mismatches
- ✅ All relationships correct
- ✅ All constraints match entities
