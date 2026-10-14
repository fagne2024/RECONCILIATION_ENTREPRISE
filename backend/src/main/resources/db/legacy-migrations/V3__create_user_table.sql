CREATE TABLE IF NOT EXISTS user (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL
);
 
INSERT INTO user (username, password) VALUES ('yamar.ndao', 'yamar') ON CONFLICT DO NOTHING; 