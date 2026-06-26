# Entity vs Migration Comparison

## ✅ FIXED: Sports Table
**Entity:** `Sport.java`
**Migration:** `V003__create_sports_tables.sql`

| Column | Entity | Migration | Status |
|--------|--------|-----------|--------|
| id | Long | BIGSERIAL | ✅ FIXED |
| name | String | VARCHAR(100) | ✅ |
| description | String | TEXT | ✅ |
| category | String | VARCHAR(50) | ✅ ADDED |
| icon_url | String | VARCHAR(500) | ✅ |
| min_players | Integer | INTEGER | ✅ ADDED |
| max_players | Integer | INTEGER | ✅ ADDED |
| is_active | Boolean | BOOLEAN | ✅ |
| created_at | LocalDateTime | TIMESTAMP | ✅ |
| updated_at | LocalDateTime | TIMESTAMP | ✅ |

## ✅ FIXED: User Sport Profiles Table
**Entity:** `UserSportProfile.java`
**Migration:** `V003__create_sports_tables.sql`

| Column | Entity | Migration | Status |
|--------|--------|-----------|--------|
| id | Long | BIGSERIAL | ✅ FIXED |
| user_id | UUID | UUID | ✅ |
| sport_id | Long | BIGINT | ✅ FIXED |
| skill_level | String | VARCHAR(50) | ✅ FIXED (removed NOT NULL) |
| years_of_experience | Integer | INTEGER | ✅ FIXED (renamed from years_experience) |
| preferred_position | String | VARCHAR(100) | ✅ |
| bio | String | TEXT | ✅ FIXED (renamed from notes) |
| is_active | Boolean | BOOLEAN | ✅ |
| created_at | LocalDateTime | TIMESTAMP | ✅ |
| updated_at | LocalDateTime | TIMESTAMP | ✅ |
| ~~play_frequency~~ | - | - | ✅ REMOVED |

## ✅ Posts Table
**Entity:** `Post.java`
**Migration:** `V004__create_posts_tables.sql`

| Column | Entity | Migration | Status |
|--------|--------|-----------|--------|
| id | Long | BIGSERIAL | ✅ |
| user_id | UUID | UUID | ✅ |
| content | String | TEXT | ✅ |
| location | Point | GEOGRAPHY(POINT, 4326) | ✅ |
| location_name | String | VARCHAR(255) | ✅ |
| sport_id | Long | BIGINT | ✅ |
| visibility | String | VARCHAR(20) | ✅ |
| is_active | Boolean | BOOLEAN | ✅ |
| created_at | LocalDateTime | TIMESTAMP | ✅ |
| updated_at | LocalDateTime | TIMESTAMP | ✅ |

## ✅ Comments Table
**Entity:** `Comment.java`
**Migration:** `V004__create_posts_tables.sql`

| Column | Entity | Migration | Status |
|--------|--------|-----------|--------|
| id | Long | BIGSERIAL | ✅ |
| post_id | Long | BIGINT | ✅ |
| user_id | UUID | UUID | ✅ |
| parent_comment_id | Long | BIGINT | ✅ |
| content | String | TEXT | ✅ |
| is_active | Boolean | BOOLEAN | ✅ |
| created_at | LocalDateTime | TIMESTAMP | ✅ |
| updated_at | LocalDateTime | TIMESTAMP | ✅ |

## ✅ Post Likes Table
**Entity:** `PostLike.java`
**Migration:** `V004__create_posts_tables.sql`

| Column | Entity | Migration | Status |
|--------|--------|-----------|--------|
| id | Long | BIGSERIAL | ✅ |
| post_id | Long | BIGINT | ✅ |
| user_id | UUID | UUID | ✅ |
| created_at | LocalDateTime | TIMESTAMP | ✅ |

## ✅ Comment Likes Table
**Entity:** `CommentLike.java`
**Migration:** `V004__create_posts_tables.sql`

| Column | Entity | Migration | Status |
|--------|--------|-----------|--------|
| id | Long | BIGSERIAL | ✅ |
| comment_id | Long | BIGINT | ✅ |
| user_id | UUID | UUID | ✅ |
| created_at | LocalDateTime | TIMESTAMP | ✅ |

## ✅ Post Media Table
**Entity:** `PostMedia.java`
**Migration:** `V004__create_posts_tables.sql`

| Column | Entity | Migration | Status |
|--------|--------|-----------|--------|
| id | Long | BIGSERIAL | ✅ |
| post_id | Long (via @ManyToOne) | BIGINT | ✅ |
| media_type | String | VARCHAR(20) | ✅ |
| media_url | String | VARCHAR(500) | ✅ |
| thumbnail_url | String | VARCHAR(500) | ✅ |
| display_order | Integer | INTEGER | ✅ |
| created_at | LocalDateTime | TIMESTAMP | ✅ |

## ✅ User Follows Table
**Entity:** `UserFollow.java`
**Migration:** `V005__create_social_tables.sql`

| Column | Entity | Migration | Status |
|--------|--------|-----------|--------|
| id | Long | BIGSERIAL | ✅ |
| follower_id | UUID | UUID | ✅ |
| following_id | UUID | UUID | ✅ |
| created_at | LocalDateTime | TIMESTAMP | ✅ |

## ✅ Hashtags Table
**Entity:** `Hashtag.java`
**Migration:** `V005__create_social_tables.sql`

| Column | Entity | Migration | Status |
|--------|--------|-----------|--------|
| id | Long | BIGSERIAL | ✅ |
| tag | String | VARCHAR(100) | ✅ |
| usage_count | Integer | INTEGER | ✅ |
| created_at | LocalDateTime | TIMESTAMP | ✅ |

## ✅ Post Hashtags Table
**Entity:** `PostHashtag.java`
**Migration:** `V005__create_social_tables.sql`

| Column | Entity | Migration | Status |
|--------|--------|-----------|--------|
| id | Long | BIGSERIAL | ✅ |
| post_id | Long (via @ManyToOne) | BIGINT | ✅ |
| hashtag_id | Long (via @ManyToOne) | BIGINT | ✅ |
| created_at | LocalDateTime | TIMESTAMP | ✅ |

## Summary
- **Total Tables Checked:** 11
- **Tables with Issues Fixed:** 2 (Sports, UserSportProfiles)
- **Tables Already Correct:** 9
- **All schemas now match entities** ✅

## Actions Required
1. Drop and recreate database to apply fixed migrations
2. Enable PostGIS extension
3. Start server - all schema validations should pass
