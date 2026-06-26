# Social Sports Community Platform - Complete Architecture

## Platform Vision

**A social network for sports enthusiasts** where users can:
- Share thoughts & moments (posts, videos, shorts)
- Chat with other players
- Find partners for games
- Discover courts & equipment (smart matching)
- Trade bookings & equipment
- Join and manage sport groups

**Think: Instagram + WhatsApp + Meetup + Marketplace - but for sports**

---

## User Types & Features

### **1. Normal User**
```
Social Features:
├── Post thoughts (text, images)
├── Share sport moments (videos, shorts)
├── Comment on posts
├── Like & react
├── Follow other users
├── Real-time chat (1-on-1 & group)
└── Notifications

Discovery Features:
├── Find sport partners (matching algorithm)
├── Search courts/facilities
├── Browse equipment marketplace
├── Smart vendor matching (AI-powered)
└── Discover groups

Marketplace:
├── Book facilities
├── Transfer/sell bookings
├── Buy/sell/rent equipment
└── Secure payments

Groups:
├── Join sport groups
├── Group chat
├── Group events
├── Group feed
└── Group marketplace
```

### **2. Group Owner**
```
All Normal User Features +

Group Management:
├── Create groups
├── Manage members (approve/remove)
├── Set group rules
├── Pin important posts
├── Moderate content
├── Organize events
├── Group analytics
└── Monetization (premium groups)
```

### **3. Vendor** (from previous design)
```
Facility Management:
├── List facilities
├── Manage bookings
├── Verify QR codes
├── Analytics
└── Payouts
```

### **4. Admin**
```
Platform Management:
├── User moderation
├── Content moderation
├── Vendor approval
├── Sport management
├── System settings
└── Analytics
```

---

## Core Features Deep Dive

### **1. Social Feed (Posts & Moments)**

**Post Types:**
- Text posts (thoughts, questions)
- Image posts (photos from games)
- Video posts (highlights, tutorials)
- Shorts (TikTok-style vertical videos)
- Polls (vote for best player, etc.)
- Event posts (game invitations)

**Features:**
```
✅ Create/edit/delete posts
✅ Like, comment, share
✅ Reactions (👍 🔥 ⚽ 🏸)
✅ Hashtags (#badminton #doubles)
✅ Mentions (@username)
✅ Privacy settings (public, friends, group-only)
✅ Report/block
✅ Trending posts
✅ Personalized feed algorithm
```

**Database Schema:**
```sql
CREATE TABLE posts (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    group_id BIGINT REFERENCES groups(id),
    post_type VARCHAR(50) NOT NULL, -- text, image, video, short, poll, event
    content TEXT,
    media_urls JSONB, -- array of image/video URLs
    privacy VARCHAR(50) DEFAULT 'public', -- public, friends, group
    sport_id BIGINT REFERENCES sports(id),
    location JSONB,
    hashtags TEXT[],
    mentions UUID[],
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    shares_count INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE post_media (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    media_type VARCHAR(50), -- image, video, short
    media_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    duration_seconds INTEGER,
    width INTEGER,
    height INTEGER,
    file_size BIGINT,
    display_order INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE post_likes (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    reaction_type VARCHAR(50) DEFAULT 'like', -- like, love, fire, sport-specific
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id)
);

CREATE TABLE comments (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    parent_comment_id BIGINT REFERENCES comments(id),
    content TEXT NOT NULL,
    mentions UUID[],
    likes_count INTEGER DEFAULT 0,
    replies_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE comment_likes (
    id BIGSERIAL PRIMARY KEY,
    comment_id BIGINT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id)
);

CREATE TABLE post_shares (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id),
    user_id UUID NOT NULL REFERENCES users(id),
    share_type VARCHAR(50), -- repost, share_to_group, share_external
    target_group_id BIGINT REFERENCES groups(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### **2. Real-Time Chat**

**Chat Types:**
- 1-on-1 direct messages
- Group chats (sport groups)
- Event chats (game coordination)

**Features:**
```
✅ Real-time messaging (WebSocket)
✅ Text, images, videos
✅ Voice messages
✅ Read receipts
✅ Typing indicators
✅ Message reactions
✅ Reply to message
✅ Delete/edit messages
✅ Search messages
✅ Mute conversations
✅ Block users
```

**Database Schema:**
```sql
CREATE TABLE conversations (
    id BIGSERIAL PRIMARY KEY,
    conversation_type VARCHAR(50) NOT NULL, -- direct, group, event
    name VARCHAR(255), -- for group chats
    avatar_url VARCHAR(500),
    group_id BIGINT REFERENCES groups(id),
    event_id BIGINT REFERENCES events(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE conversation_participants (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(50) DEFAULT 'member', -- admin, member
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    is_muted BOOLEAN DEFAULT FALSE,
    last_read_at TIMESTAMP,
    UNIQUE(conversation_id, user_id)
);

CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    message_type VARCHAR(50) DEFAULT 'text', -- text, image, video, voice, system
    content TEXT,
    media_url VARCHAR(500),
    reply_to_message_id BIGINT REFERENCES messages(id),
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE message_reactions (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    reaction VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);

CREATE TABLE message_read_receipts (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(message_id, user_id)
);
```

---

### **3. Find Partner (Matching System)**

**Features:**
```
✅ Create "looking for partner" posts
✅ Specify sport, skill level, location, time
✅ Smart matching algorithm
✅ Filter by distance, skill, availability
✅ Send partner requests
✅ Accept/decline requests
✅ Partner history & ratings
✅ Recurring partners (favorites)
```

**Database Schema:**
```sql
CREATE TABLE partner_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    sport_id BIGINT NOT NULL REFERENCES sports(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    skill_level VARCHAR(50), -- beginner, intermediate, advanced, expert
    preferred_location JSONB, -- {lat, lng, radius, address}
    preferred_dates DATE[],
    preferred_times JSONB, -- {day_of_week, start_time, end_time}
    max_distance_km INTEGER,
    min_skill_level VARCHAR(50),
    max_skill_level VARCHAR(50),
    gender_preference VARCHAR(50), -- any, male, female
    age_range JSONB, -- {min, max}
    status VARCHAR(50) DEFAULT 'active', -- active, matched, expired, cancelled
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE partner_matches (
    id BIGSERIAL PRIMARY KEY,
    request_id BIGINT NOT NULL REFERENCES partner_requests(id),
    requester_id UUID NOT NULL REFERENCES users(id),
    partner_id UUID NOT NULL REFERENCES users(id),
    match_score DECIMAL(5,2), -- 0-100 compatibility score
    status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, declined, expired
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP
);

CREATE TABLE user_sport_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    sport_id BIGINT NOT NULL REFERENCES sports(id),
    skill_level VARCHAR(50),
    years_experience INTEGER,
    preferred_position VARCHAR(100),
    play_frequency VARCHAR(50), -- daily, weekly, monthly, occasional
    preferred_times JSONB,
    bio TEXT,
    achievements TEXT[],
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_games INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, sport_id)
);

CREATE TABLE partner_ratings (
    id BIGSERIAL PRIMARY KEY,
    rater_id UUID NOT NULL REFERENCES users(id),
    rated_user_id UUID NOT NULL REFERENCES users(id),
    sport_id BIGINT REFERENCES sports(id),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    skill_rating INTEGER CHECK (skill_rating >= 1 AND skill_rating <= 5),
    punctuality_rating INTEGER CHECK (punctuality_rating >= 1 AND punctuality_rating <= 5),
    sportsmanship_rating INTEGER CHECK (sportsmanship_rating >= 1 AND sportsmanship_rating <= 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### **4. Groups**

**Features:**
```
✅ Create sport groups
✅ Public/private groups
✅ Member management
✅ Group feed (posts visible to members)
✅ Group chat
✅ Group events
✅ Group marketplace
✅ Group leaderboards
✅ Group challenges
✅ Membership tiers (free, premium)
```

**Database Schema:**
```sql
CREATE TABLE groups (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    avatar_url VARCHAR(500),
    cover_url VARCHAR(500),
    sport_id BIGINT REFERENCES sports(id),
    group_type VARCHAR(50) DEFAULT 'public', -- public, private, secret
    location JSONB,
    member_count INTEGER DEFAULT 0,
    post_count INTEGER DEFAULT 0,
    rules TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    requires_approval BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE group_members (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(50) DEFAULT 'member', -- owner, admin, moderator, member
    status VARCHAR(50) DEFAULT 'active', -- pending, active, banned
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    UNIQUE(group_id, user_id)
);

CREATE TABLE group_events (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT NOT NULL REFERENCES groups(id),
    created_by UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type VARCHAR(50), -- game, tournament, meetup, training
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location JSONB,
    facility_id BIGINT REFERENCES facilities(id),
    max_participants INTEGER,
    current_participants INTEGER DEFAULT 0,
    registration_deadline TIMESTAMP,
    status VARCHAR(50) DEFAULT 'upcoming', -- upcoming, ongoing, completed, cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_participants (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES group_events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'registered', -- registered, attended, no_show, cancelled
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);
```

---

### **5. Smart Vendor Matching**

**AI-Powered Recommendations:**
```
✅ Recommend facilities based on:
  ├── User location
  ├── Sport preferences
  ├── Skill level
  ├── Budget
  ├── Availability
  ├── Past bookings
  ├── Friend activity
  └── Reviews/ratings

✅ Equipment recommendations:
  ├── Based on skill level
  ├── Budget
  ├── Sport
  └── Popular among similar users
```

**Database Schema:**
```sql
CREATE TABLE user_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    favorite_sports BIGINT[],
    preferred_locations JSONB[],
    budget_range JSONB, -- {min, max}
    preferred_times JSONB,
    notification_settings JSONB,
    privacy_settings JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

CREATE TABLE user_activity_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    activity_type VARCHAR(50), -- view_facility, book, search, etc.
    entity_type VARCHAR(50), -- facility, equipment, user, group
    entity_id BIGINT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recommendations (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    recommendation_type VARCHAR(50), -- facility, equipment, partner, group
    entity_id BIGINT,
    score DECIMAL(5,2),
    reason TEXT,
    is_clicked BOOLEAN DEFAULT FALSE,
    is_converted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### **6. Notifications**

**Notification Types:**
```
Social:
├── New follower
├── Post like/comment
├── Mention in post/comment
├── New message
└── Friend request

Groups:
├── Group invitation
├── New group post
├── Event invitation
└── Group announcement

Marketplace:
├── Booking confirmation
├── Transfer request
├── Equipment offer
└── Payment received

Matching:
├── Partner match found
├── Partner request
└── Event invitation
```

**Database Schema:**
```sql
CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    message TEXT,
    entity_type VARCHAR(50), -- post, comment, message, booking, etc.
    entity_id BIGINT,
    sender_id UUID REFERENCES users(id),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    action_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read, created_at);
```

---

## Updated Technology Stack

### **Backend**
```
Core:
├── Java 21
├── Spring Boot 3.2.0
├── Spring Security + JWT
├── Spring Data JPA
└── PostgreSQL

Real-Time:
├── Spring WebSocket (STOMP)
├── Redis (pub/sub for chat)
└── Server-Sent Events (SSE) for notifications

Media:
├── AWS S3 / Cloudinary (image/video storage)
├── FFmpeg (video processing)
└── Image compression

AI/ML:
├── Python microservice (recommendations)
├── Scikit-learn / TensorFlow
└── Collaborative filtering

Search:
├── Elasticsearch (posts, users, groups)
└── Full-text search

Caching:
├── Redis (sessions, feed cache)
└── CDN (media delivery)
```

### **Frontend**
```
Web:
├── React 18
├── Material-UI
├── Socket.io client (real-time)
├── React Query (data fetching)
├── Infinite scroll
└── Video player (Video.js)

Mobile:
├── React Native
├── React Native Camera
├── React Native Video
├── Push notifications (Firebase)
└── Real-time chat (Socket.io)
```

---

## API Endpoints Overview

### **Social Features**
```
POST   /api/posts                    # Create post
GET    /api/posts/feed               # Get personalized feed
GET    /api/posts/{id}               # Get post details
POST   /api/posts/{id}/like          # Like post
POST   /api/posts/{id}/comment       # Comment on post
POST   /api/posts/{id}/share         # Share post
GET    /api/posts/trending           # Trending posts
GET    /api/posts/hashtag/{tag}      # Posts by hashtag

POST   /api/videos/upload            # Upload video
POST   /api/shorts                   # Create short video
GET    /api/shorts/feed              # Shorts feed
```

### **Chat**
```
WebSocket: /ws/chat

GET    /api/conversations            # Get user's conversations
POST   /api/conversations            # Create conversation
GET    /api/conversations/{id}/messages  # Get messages
POST   /api/conversations/{id}/messages  # Send message
PUT    /api/messages/{id}/read       # Mark as read
DELETE /api/messages/{id}            # Delete message
```

### **Partner Finding**
```
POST   /api/partner-requests         # Create request
GET    /api/partner-requests/matches # Get matches
POST   /api/partner-requests/{id}/accept  # Accept match
GET    /api/users/{id}/sport-profile # Get sport profile
POST   /api/partner-ratings          # Rate partner
```

### **Groups**
```
POST   /api/groups                   # Create group
GET    /api/groups                   # Browse groups
GET    /api/groups/{id}              # Get group details
POST   /api/groups/{id}/join         # Join group
POST   /api/groups/{id}/posts        # Post to group
GET    /api/groups/{id}/members      # Get members
POST   /api/groups/{id}/events       # Create event
```

### **Recommendations**
```
GET    /api/recommendations/facilities  # Recommended facilities
GET    /api/recommendations/partners    # Recommended partners
GET    /api/recommendations/groups      # Recommended groups
GET    /api/recommendations/equipment   # Recommended equipment
```

---

## Revised Implementation Plan

### **Phase 1: Foundation (Weeks 1-3)**
```
Week 1: Core Setup
├── Database schema
├── Authentication (JWT + social)
├── User profiles
└── Basic API structure

Week 2: Social Foundation
├── Posts (text, images)
├── Comments
├── Likes
├── Feed algorithm (basic)
└── File upload (S3)

Week 3: Real-Time Chat
├── WebSocket setup
├── 1-on-1 messaging
├── Message history
├── Read receipts
└── Notifications
```

### **Phase 2: Social Features (Weeks 4-6)**
```
Week 4: Video & Shorts
├── Video upload
├── Video processing
├── Shorts feed
├── Video player
└── Thumbnails

Week 5: Groups
├── Create/join groups
├── Group posts
├── Group chat
├── Member management
└── Group events

Week 6: Partner Finding
├── Partner requests
├── Sport profiles
├── Matching algorithm
├── Partner ratings
└── Recommendations
```

### **Phase 3: Marketplace (Weeks 7-8)**
```
Week 7: Facility Booking
├── Browse facilities
├── Booking system
├── QR verification
├── Transfer marketplace
└── Payment integration

Week 8: Equipment Marketplace
├── List equipment
├── Buy/sell/rent
├── Offers
├── Escrow
└── Reviews
```

### **Phase 4: Frontend (Weeks 9-12)**
```
Week 9: Core UI
├── Feed
├── Post creation
├── Comments
├── Chat interface
└── Notifications

Week 10: Discovery
├── Partner finding UI
├── Group browsing
├── Facility search
├── Equipment marketplace
└── Recommendations

Week 11: Group Features
├── Group pages
├── Event management
├── Group chat
├── Member management
└── Group settings

Week 12: Polish & Launch
├── Testing
├── Performance optimization
├── Mobile responsiveness
├── PWA setup
└── Deployment
```

### **Phase 5: Mobile App (Months 4-5)**
```
React Native app with all features
```

---

## This is Now a MUCH Bigger Platform!

**Previous scope:** Facility booking + equipment marketplace  
**New scope:** Full social network + marketplace + matching

**Estimated timeline:**
- MVP: 12 weeks (web)
- Mobile: +8 weeks
- Total: 5 months

**This is similar to building:**
- Social feed: Instagram/Facebook
- Chat: WhatsApp
- Partner finding: Tinder (for sports)
- Groups: Facebook Groups
- Marketplace: eBay/Craigslist
- Booking: Existing design

**Questions:**
1. Is this the full vision or start smaller?
2. Priority order of features?
3. Team size (this is a lot for one developer)?
4. Budget/timeline constraints?

Should I create a phased MVP approach to launch faster?
