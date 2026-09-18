-- Additive discovery metadata; existing media is deliberately left untouched.
CREATE TABLE event_categories (slug text PRIMARY KEY, name text NOT NULL, position integer NOT NULL DEFAULT 0);
INSERT INTO event_categories(slug,name,position) VALUES
 ('conciertos','Conciertos',1),('fiestas','Fiestas',2),('festivales','Festivales',3),
 ('deportes','Deportes',4),('teatro','Teatro',5),('stand-up','Stand-up',6),('familiar','Familiar',7);
ALTER TABLE events ADD COLUMN category_slug text REFERENCES event_categories(slug);
CREATE INDEX events_discovery_idx ON events(date_iso,id) WHERE is_published;
CREATE INDEX events_category_idx ON events(category_slug,date_iso) WHERE is_published;
CREATE TABLE media_objects (
 id uuid PRIMARY KEY, organizer_id text NOT NULL REFERENCES organizer_users(id),
 event_id text REFERENCES events(id), object_key text NOT NULL UNIQUE,
 content_type text NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
 bytes integer NOT NULL CHECK(bytes > 0 AND bytes <= 5242880),
 created_at timestamptz NOT NULL DEFAULT now()
);
