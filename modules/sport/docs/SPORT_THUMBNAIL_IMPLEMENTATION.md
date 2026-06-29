# Sport Thumbnail Implementation - Embedded Resources

## Decision
- **Image Format**: PNG (user already has PNG images)
- **Storage**: Embedded resources in sport-impl module
- **Approach**: Phase 1 - Embedded Resources (MVP)

---

## Implementation Steps

### Step 1: Create Directory Structure
```
modules/sport/sport-impl/src/main/resources/images/sports/
```

### Step 2: Add Image Files
Place the 12 PNG images in the directory:
- badminton.png
- tennis.png
- pickleball.png
- table_tennis.png
- soccer.png
- basketball.png
- volleyball.png
- gym_fitness.png
- swimming.png
- running.png
- cycling.png
- yoga.png

**Image Requirements**:
- Format: PNG
- Recommended size: 200x200px (square)
- Recommended file size: < 100KB each
- Naming: lowercase with underscores

### Step 3: Update Database Migration

Since V003__create_sports_tables.sql may already be applied, create a new migration:

**File**: `V013__update_sports_with_thumbnails_and_metadata.sql`

```sql
-- V013: Update sports with thumbnails and metadata
-- Add icon_url, category, min_players, max_players data

UPDATE sports SET 
    icon_url = '/images/sports/badminton.png',
    category = 'Racquet',
    min_players = 2,
    max_players = 4
WHERE name = 'Badminton';

UPDATE sports SET 
    icon_url = '/images/sports/tennis.png',
    category = 'Racquet',
    min_players = 2,
    max_players = 4
WHERE name = 'Tennis';

UPDATE sports SET 
    icon_url = '/images/sports/pickleball.png',
    category = 'Racquet',
    min_players = 2,
    max_players = 4
WHERE name = 'Pickleball';

UPDATE sports SET 
    icon_url = '/images/sports/table_tennis.png',
    category = 'Racquet',
    min_players = 2,
    max_players = 4
WHERE name = 'Table Tennis';

UPDATE sports SET 
    icon_url = '/images/sports/soccer.png',
    category = 'Team',
    min_players = 11,
    max_players = 22
WHERE name = 'Soccer';

UPDATE sports SET 
    icon_url = '/images/sports/basketball.png',
    category = 'Team',
    min_players = 5,
    max_players = 10
WHERE name = 'Basketball';

UPDATE sports SET 
    icon_url = '/images/sports/volleyball.png',
    category = 'Team',
    min_players = 6,
    max_players = 12
WHERE name = 'Volleyball';

UPDATE sports SET 
    icon_url = '/images/sports/gym_fitness.png',
    category = 'Individual',
    min_players = 1,
    max_players = 50
WHERE name = 'Gym/Fitness';

UPDATE sports SET 
    icon_url = '/images/sports/swimming.png',
    category = 'Individual',
    min_players = 1,
    max_players = 50
WHERE name = 'Swimming';

UPDATE sports SET 
    icon_url = '/images/sports/running.png',
    category = 'Individual',
    min_players = 1,
    max_players = 50
WHERE name = 'Running';

UPDATE sports SET 
    icon_url = '/images/sports/cycling.png',
    category = 'Individual',
    min_players = 1,
    max_players = 50
WHERE name = 'Cycling';

UPDATE sports SET 
    icon_url = '/images/sports/yoga.png',
    category = 'Individual',
    min_players = 1,
    max_players = 50
WHERE name = 'Yoga';
```

### Step 4: Configure Spring ResourceHandler

Create configuration class in sport-impl module:

**File**: `modules/sport/sport-impl/src/main/java/com/sportconnect/sport/config/WebConfig.java`

```java
package com.sportconnect.sport.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/images/**")
                .addResourceLocations("classpath:/images/")
                .setCachePeriod(31536000); // 1 year cache in seconds
    }
}
```

### Step 4.5: Configure Security to Allow Public Access

Update SecurityConfig to allow public access to images and sports API:

**File**: `modules/auth/auth-impl/src/main/java/com/sportconnect/auth/config/SecurityConfig.java`

Add this line to the authorizeHttpRequests section:
```java
.requestMatchers("/images/**").permitAll()
```

**Note**: `/api/sports/**` is already configured as public, allowing unregistered users to load the sport list for profile initialization.

### Step 5: Verify SportResponse DTO

Ensure `SportResponse` includes icon_url field:

**File**: `modules/sport/sport-api/src/main/java/com/sportconnect/sport/api/dto/SportResponse.java`

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SportResponse {

    private Long id;
    private String name;
    private String description;
    private String category;
    private String iconUrl;  // This should already exist
    private Integer minPlayers;
    private Integer maxPlayers;
    private Boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

### Step 6: Update Liquibase Changelog

Add the new migration to the master changelog:

**File**: `server/src/main/resources/db/changelog/db.changelog-master.xml`

```xml
<changeSet id="013" author="sportconnect">
    <sqlFile path="changes/V013__update_sports_with_thumbnails_and_metadata.sql" relativeToChangelogFile="true"/>
</changeSet>
```

---

## Testing

### 1. Verify Images are Accessible
Start the application and test:
```
GET http://localhost:8080/images/sports/badminton.png
```
Expected: Image returned with 200 status

### 2. Verify API Returns icon_url
```
GET http://localhost:8080/api/sports
```
Expected: Response includes icon_url field for each sport

### 3. Verify Frontend Display
- Images should display in sport selection UI
- Images should load quickly (cached for 1 year)
- Images should be 200x200px

---

## Migration Path to Cloud Storage (Future)

When ready to migrate to S3 + CloudFront:

1. Upload images to S3 bucket
2. Configure CloudFront CDN
3. Update database with CDN URLs:
```sql
UPDATE sports SET icon_url = 'https://cdn.sportconnect.com/sports/badminton.png' WHERE name = 'Badminton';
```
4. Remove images from module resources
5. Remove or update WebConfig

---

## Checklist

- [x] Create directory: `modules/sport/sport-impl/src/main/resources/images/sports/`
- [ ] Add 12 PNG images to the directory
- [x] Create migration: `V013__update_sports_with_thumbnails_and_metadata.sql`
- [x] Create WebConfig class in sport-impl
- [x] Update SecurityConfig to allow public image access
- [x] Update db.changelog-master.xml
- [ ] Run migration to update database
- [ ] Test image access via `/images/sports/{name}.png`
- [ ] Test API returns icon_url
- [ ] Verify frontend displays images

---

## Completed Actions

1. ✅ Created directory: `modules/sport/sport-impl/src/main/resources/images/sports/`
2. ✅ Created WebConfig.java in sport-impl module
3. ✅ Created V013__update_sports_with_thumbnails_and_metadata.sql migration
4. ✅ Updated SecurityConfig.java to allow public access to `/images/**`
5. ✅ Updated db.changelog-master.xml to include V013 migration
6. ✅ Created implementation documentation

---

## Remaining Actions

### 1. Add PNG Images
Place your the 12 PNG images in:
```
modules/sport/sport-impl/src/main/resources/images/sports/
```

Required filenames:
- badminton.png
- tennis.png
- pickleball.png
- table_tennis.png
- soccer.png
- basketball.png
- volleyball.png
- gym_fitness.png
- swimming.png
- running.png
- cycling.png
- yoga.png

### 2. Run Migration
Start the application to run the Liquibase migration, or run manually:
```bash
./gradlew :server:bootRun
```

### 3. Test
- Test image access: `GET http://localhost:8080/images/sports/badminton.png`
- Test API: `GET http://localhost:8080/api/sports` (check icon_url field)

---

## Notes

- Images will be cached for 1 year (31536000 seconds)
- Images are served from classpath resources
- No external dependencies required
- Easy to migrate to cloud storage later
- Database stores relative paths, not absolute URLs
