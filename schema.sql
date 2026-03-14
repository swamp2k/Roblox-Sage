DROP TABLE IF EXISTS experiences;
CREATE TABLE experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    wiki_url TEXT NOT NULL,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

DROP TABLE IF EXISTS search_cache;
CREATE TABLE search_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    query_hash TEXT NOT NULL,
    gemini_output TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(game_id) REFERENCES experiences(id)
);

CREATE INDEX idx_experiences_name ON experiences (name);
CREATE INDEX idx_search_cache_hash ON search_cache (game_id, query_hash);
