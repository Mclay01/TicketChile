-- Additive media adoption; existing local objects remain READY and untouched.
ALTER TABLE media_objects
 ADD COLUMN purpose text CHECK(purpose IN ('POSTER','HERO_DESKTOP','HERO_MOBILE')),
 ADD COLUMN provider text NOT NULL DEFAULT 'local' CHECK(provider IN ('local','s3')),
 ADD COLUMN store_identity text NOT NULL DEFAULT 'local',
 ADD COLUMN width integer CHECK(width > 0), ADD COLUMN height integer CHECK(height > 0),
 ADD COLUMN checksum text CHECK(checksum ~ '^[a-f0-9]{64}$'),
 ADD COLUMN created_by text,
 ADD COLUMN request_key text,
 ADD COLUMN fingerprint text,
 ADD COLUMN state text NOT NULL DEFAULT 'READY' CHECK(state IN ('UPLOADING','READY','DELETING','DELETED')),
 ADD COLUMN touched_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN orphaned_at timestamptz,
 ADD COLUMN deleted_at timestamptz,
 ADD COLUMN attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN last_error text;
CREATE UNIQUE INDEX media_upload_retry_idx ON media_objects(organizer_id,created_by,request_key) WHERE request_key IS NOT NULL;
CREATE INDEX media_cleanup_idx ON media_objects(state,touched_at) WHERE state <> 'DELETED';
CREATE TABLE media_variants (
 media_id uuid NOT NULL REFERENCES media_objects(id),
 name text NOT NULL CHECK(name IN ('hero','card','thumb')),
 object_key text NOT NULL UNIQUE,
 bytes integer NOT NULL CHECK(bytes > 0 AND bytes <= 5242880),
 width integer NOT NULL CHECK(width > 0), height integer NOT NULL CHECK(height > 0),
 checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(media_id,name)
);
-- Originals are retained for reviewed rollback, never returned to clients or audit.
CREATE TABLE media_legacy_adoptions (
 event_id text NOT NULL REFERENCES events(id),
 slot text NOT NULL CHECK(slot IN ('image','hero_desktop','hero_mobile')),
 source_checksum text NOT NULL,
 original_value text NOT NULL,
 media_id uuid REFERENCES media_objects(id),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPLIED','CONFLICT','FAILED')),
 attempts integer NOT NULL DEFAULT 0, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,slot,source_checksum)
);

-- Coordinate every event reference writer with cleanup, including internal jobs.
-- No event deletion is introduced: all existing references retain their assets.
CREATE FUNCTION media_event_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_refs text[] := ARRAY[]::text[]; next_refs text[]; item record;
BEGIN
 IF TG_OP='UPDATE' THEN previous_refs:=ARRAY[OLD.image,OLD.hero_desktop,OLD.hero_mobile]; END IF;
 next_refs:=ARRAY[NEW.image,NEW.hero_desktop,NEW.hero_mobile];
 FOR item IN SELECT id,state FROM media_objects
   WHERE '/api/media/'||id=ANY(previous_refs||next_refs) ORDER BY id FOR UPDATE
 LOOP
   IF '/api/media/'||item.id=ANY(next_refs) THEN
     IF item.state<>'READY' THEN RAISE EXCEPTION 'Media is not ready' USING ERRCODE='23514'; END IF;
     UPDATE media_objects SET orphaned_at=NULL,touched_at=now() WHERE id=item.id;
   ELSIF '/api/media/'||item.id=ANY(previous_refs) THEN
     UPDATE media_objects SET orphaned_at=now(),touched_at=now() WHERE id=item.id;
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER media_event_reference_guard BEFORE INSERT OR UPDATE OF image,hero_desktop,hero_mobile ON events
 FOR EACH ROW EXECUTE FUNCTION media_event_references();
