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
