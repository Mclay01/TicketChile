ALTER TABLE events ADD COLUMN lifecycle text;
UPDATE events SET lifecycle=CASE WHEN is_published THEN 'PUBLISHED' ELSE 'DRAFT' END;
ALTER TABLE events ADD CONSTRAINT event_lifecycle CHECK (lifecycle IN ('DRAFT','IN_REVIEW','PUBLISHED','PAUSED','ENDED','CANCELLED'));
ALTER TABLE events ALTER COLUMN lifecycle SET NOT NULL;
-- Compatibility on insertion only. Old publication UPDATEs cannot bypass lifecycle services.
CREATE FUNCTION initial_event_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.lifecycle IS NULL THEN NEW.lifecycle := CASE WHEN NEW.is_published THEN 'PUBLISHED' ELSE 'DRAFT' END; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER initial_event_lifecycle BEFORE INSERT ON events FOR EACH ROW EXECUTE FUNCTION initial_event_lifecycle();
ALTER TABLE events ADD CONSTRAINT publication_matches_lifecycle CHECK (is_published=(lifecycle='PUBLISHED'));
ALTER TABLE events ALTER COLUMN date_iso DROP NOT NULL;
ALTER TABLE events ADD COLUMN end_at timestamptz;
ALTER TABLE events ADD COLUMN timezone text NOT NULL DEFAULT 'America/Santiago';
ALTER TABLE events ADD COLUMN address text NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN region text NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN age_policy text NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN access_info text NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN visibility text NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC','UNLISTED'));
ALTER TABLE events ADD COLUMN capacity integer NOT NULL DEFAULT 0 CHECK (capacity>=0);
UPDATE events e SET capacity=COALESCE((SELECT sum(capacity) FROM ticket_types WHERE event_id=e.id),0);
ALTER TABLE events ADD COLUMN faq text NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision>0);
ALTER TABLE events ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE events ADD COLUMN cancellation_followup text CHECK (cancellation_followup='REVIEW_REQUIRED');
ALTER TABLE events ADD CONSTRAINT event_dates CHECK (end_at IS NULL OR date_iso IS NULL OR end_at>date_iso);
ALTER TABLE ticket_types ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE ticket_types ADD COLUMN sales_start timestamptz;
ALTER TABLE ticket_types ADD COLUMN sales_end timestamptz;
ALTER TABLE ticket_types ADD COLUMN visible boolean NOT NULL DEFAULT true;
ALTER TABLE ticket_types ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE ticket_types ADD CONSTRAINT tier_window CHECK (sales_start IS NULL OR sales_end IS NULL OR sales_end>sales_start);
CREATE INDEX organizer_events_tenant ON organizer_events(organizer_id,event_id);
