-- V003: Create Sports and User Preferences Tables
-- Week 1-2: Backend v0.1 - Foundation

-- Sports table
CREATE TABLE sports (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50),
    icon_url VARCHAR(500),
    min_players INTEGER,
    max_players INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default sports
INSERT INTO sports (name, description) VALUES
    ('Badminton', 'Racquet sport played with a shuttlecock'),
    ('Tennis', 'Racquet sport played with a ball'),
    ('Pickleball', 'Paddle sport combining elements of tennis, badminton, and table tennis'),
    ('Table Tennis', 'Indoor racquet sport also known as ping pong'),
    ('Soccer', 'Team sport played with a ball'),
    ('Basketball', 'Team sport played with a ball and hoops'),
    ('Volleyball', 'Team sport played with a ball over a net'),
    ('Gym/Fitness', 'General fitness and workout activities'),
    ('Swimming', 'Water-based sport and exercise'),
    ('Running', 'Track and field running activities'),
    ('Cycling', 'Bicycle riding sport'),
    ('Yoga', 'Mind and body practice');

-- Facility types table
CREATE TABLE facility_types (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default facility types
INSERT INTO facility_types (name, description) VALUES
    ('Indoor Court', 'Indoor sports court'),
    ('Outdoor Court', 'Outdoor sports court'),
    ('Stadium', 'Large sports stadium'),
    ('Gym', 'Fitness gym or training facility'),
    ('Pool', 'Swimming pool'),
    ('Field', 'Sports field (grass or turf)'),
    ('Track', 'Running or cycling track'),
    ('Studio', 'Yoga or fitness studio');

-- User sport profiles (skill levels and preferences per sport)
CREATE TABLE user_sport_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sport_id BIGINT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    skill_level VARCHAR(50),
    years_of_experience INTEGER,
    preferred_position VARCHAR(100),
    bio TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, sport_id)
);

CREATE INDEX idx_user_sport_profiles_user_id ON user_sport_profiles(user_id);
CREATE INDEX idx_user_sport_profiles_sport_id ON user_sport_profiles(sport_id);
CREATE INDEX idx_user_sport_profiles_skill_level ON user_sport_profiles(skill_level);

-- User preferences (general app preferences)
CREATE TABLE user_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language VARCHAR(10) DEFAULT 'en',
    timezone VARCHAR(50) DEFAULT 'UTC',
    distance_unit VARCHAR(10) DEFAULT 'km',
    notification_email BOOLEAN DEFAULT TRUE,
    notification_push BOOLEAN DEFAULT TRUE,
    notification_sms BOOLEAN DEFAULT FALSE,
    privacy_profile VARCHAR(20) DEFAULT 'public',
    privacy_location VARCHAR(20) DEFAULT 'friends',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Trigger to auto-update updated_at for sports
CREATE TRIGGER update_sports_updated_at BEFORE UPDATE ON sports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at for user_sport_profiles
CREATE TRIGGER update_user_sport_profiles_updated_at BEFORE UPDATE ON user_sport_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to auto-update updated_at for user_preferences
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
