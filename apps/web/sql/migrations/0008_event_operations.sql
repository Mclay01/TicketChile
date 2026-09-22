CREATE OR REPLACE FUNCTION staff_role_capabilities(role_name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE role_name
 WHEN 'ORGANIZER_MANAGER' THEN ARRAY['event.read','event.edit','scanner.read','scanner.checkin','attendees.read','attendees.export','courtesy.issue','courtesy.revoke','promotions.manage','attendees.resend']
 WHEN 'ORGANIZER_DOOR' THEN ARRAY['scanner.read','scanner.checkin']
 WHEN 'ORGANIZER_FINANCE' THEN ARRAY['finance.read']
 WHEN 'ORGANIZER_SUPPORT' THEN ARRAY['attendees.read','attendees.resend'] ELSE ARRAY[]::text[] END
$$;

CREATE OR REPLACE FUNCTION security_can_event(actor_kind text,actor_id text,actor_version integer,ev text,cap text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (
 SELECT 1 FROM organizer_events oe JOIN organizer_users owner ON owner.id=oe.organizer_id
 JOIN identity_accounts tenant ON tenant.kind='ORGANIZER' AND tenant.id=owner.id AND NOT tenant.disabled
 JOIN identity_accounts a ON a.kind=actor_kind AND a.id=actor_id AND a.version=actor_version AND NOT a.disabled
 JOIN identity_principals p ON p.kind=a.kind AND p.id=a.id AND p.active AND p.verified
 WHERE oe.event_id=ev AND owner.is_active AND owner.approved AND owner.verified
 AND ((actor_kind='ORGANIZER' AND actor_id=oe.organizer_id AND cap IN
 ('event.read','event.edit','scanner.read','scanner.checkin','attendees.read','attendees.export','finance.read','staff.manage','audit.read','courtesy.issue','courtesy.revoke','promotions.manage','attendees.resend'))
 OR (actor_kind='BUYER' AND EXISTS (SELECT 1 FROM organizer_staff s
 WHERE s.organizer_id=oe.organizer_id AND s.buyer_id::text=actor_id AND s.revoked_at IS NULL
 AND cap=ANY(s.capabilities) AND cap=ANY(staff_role_capabilities(s.role))
 AND (s.event_ids IS NULL OR ev=ANY(s.event_ids))))))
$$;

CREATE TABLE promotions (
 id uuid PRIMARY KEY, event_id text NOT NULL REFERENCES events(id), code text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('PERCENT','FIXED')), value integer NOT NULL,
 tier_ids text[] NOT NULL DEFAULT '{}', usage_limit integer NOT NULL CHECK(usage_limit BETWEEN 1 AND 1000000),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,code), CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'), CHECK(ends_at>starts_at),
 CHECK((kind='PERCENT' AND value BETWEEN 1 AND 99) OR (kind='FIXED' AND value BETWEEN 1 AND 100000000))
);
CREATE TABLE promotion_reservations (
 hold_id text PRIMARY KEY REFERENCES holds(id), promotion_id uuid NOT NULL REFERENCES promotions(id),
 discount_clp bigint NOT NULL CHECK(discount_clp>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotion_reservations_promotion ON promotion_reservations(promotion_id,hold_id);
ALTER TABLE hold_items ADD COLUMN original_unit_price_clp integer;

CREATE TABLE complimentary_issues (
 id uuid PRIMARY KEY, order_id text NOT NULL UNIQUE REFERENCES orders(id), event_id text NOT NULL REFERENCES events(id),
 ticket_type_id text NOT NULL, qty integer NOT NULL CHECK(qty BETWEEN 1 AND 10),
 actor_kind text NOT NULL, actor_id text NOT NULL, request_key uuid NOT NULL, request_hash text NOT NULL,
 reason text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor_kind,actor_id,request_key)
);
CREATE INDEX complimentary_event ON complimentary_issues(event_id,created_at);
CREATE TABLE courtesy_revocations (
 ticket_id text PRIMARY KEY REFERENCES tickets(id), actor_kind text NOT NULL, actor_id text NOT NULL,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE checkin_records (
 id uuid PRIMARY KEY, ticket_id text NOT NULL UNIQUE REFERENCES tickets(id), event_id text NOT NULL REFERENCES events(id),
 actor_kind text NOT NULL, actor_id text NOT NULL, method text NOT NULL CHECK(method IN ('QR','MANUAL')),
 gate text NOT NULL DEFAULT '', device text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkin_event_time ON checkin_records(event_id,created_at DESC);
CREATE TABLE event_access_config (
 event_id text PRIMARY KEY REFERENCES events(id), enabled boolean NOT NULL DEFAULT true,
 starts_at timestamptz, gates text[] NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tickets_event_tier_created ON tickets(event_id,ticket_type_id,created_at,id);
CREATE INDEX tickets_event_order ON tickets(event_id,order_id);
CREATE INDEX tickets_event_export ON tickets(event_id,id);

-- Operational history is append-only, including after cancellation.
CREATE FUNCTION operations_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Operational history is immutable'; END $$;
CREATE TRIGGER courtesy_history_immutable BEFORE UPDATE OR DELETE ON complimentary_issues FOR EACH ROW EXECUTE FUNCTION operations_history_immutable();
CREATE TRIGGER courtesy_revocation_immutable BEFORE UPDATE OR DELETE ON courtesy_revocations FOR EACH ROW EXECUTE FUNCTION operations_history_immutable();
CREATE TRIGGER checkin_history_immutable BEFORE UPDATE OR DELETE ON checkin_records FOR EACH ROW EXECUTE FUNCTION operations_history_immutable();
CREATE TRIGGER promotion_reservation_immutable BEFORE UPDATE OR DELETE ON promotion_reservations FOR EACH ROW EXECUTE FUNCTION operations_history_immutable();
