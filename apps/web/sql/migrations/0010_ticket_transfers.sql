-- Existing tc1 credentials remain valid only at generation zero.
ALTER TABLE tickets ADD COLUMN credential_version integer NOT NULL DEFAULT 0 CHECK (credential_version >= 0);
ALTER TABLE usuarios ADD COLUMN phone text NOT NULL DEFAULT '';
-- No approved business defaults: absence of a policy disables transfer.
CREATE TABLE ticket_transfer_policies (
 event_id text PRIMARY KEY REFERENCES events(id), enabled boolean NOT NULL,
 deadline timestamptz, max_transfers integer CHECK(max_transfers > 0),
 fee_clp integer CHECK(fee_clp >= 0), allow_courtesy boolean NOT NULL,
 identity_rule text NOT NULL CHECK(identity_rule IN ('NONE','IDENTITY_REQUIRED','NON_TRANSFERABLE')),
 approval_reference text NOT NULL CHECK(length(btrim(approval_reference)) BETWEEN 3 AND 200),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ticket_types ADD COLUMN transfer_disabled boolean NOT NULL DEFAULT false;
CREATE TABLE ticket_transfers (
 id uuid PRIMARY KEY, ticket_id text NOT NULL REFERENCES tickets(id),
 sender_id uuid NOT NULL REFERENCES usuarios(id), sender_email text NOT NULL, recipient_email text NOT NULL,
 recipient_id uuid REFERENCES usuarios(id), credential_version integer NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','ACCEPTED','CANCELLED','EXPIRED')),
 request_key uuid NOT NULL, token_hash text NOT NULL UNIQUE, invitation_revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 accepted_at timestamptz, cancelled_at timestamptz,
 UNIQUE(sender_id,request_key), CHECK(sender_email <> recipient_email)
);
CREATE UNIQUE INDEX ticket_transfer_pending ON ticket_transfers(ticket_id) WHERE state='PENDING';
CREATE INDEX ticket_transfer_sender ON ticket_transfers(sender_id,created_at DESC);
CREATE INDEX ticket_transfer_history ON ticket_transfers(ticket_id,created_at DESC);
CREATE TABLE ticket_ownership_history (
 ticket_id text NOT NULL REFERENCES tickets(id), sequence integer NOT NULL,
 owner_email text NOT NULL, owner_id uuid REFERENCES usuarios(id),
 transfer_id uuid REFERENCES ticket_transfers(id), acquired_at timestamptz NOT NULL,
 PRIMARY KEY(ticket_id,sequence)
);
-- Snapshot the authoritative pre-migration owner, not the original checkout contact.
INSERT INTO ticket_ownership_history(ticket_id,sequence,owner_email,acquired_at)
 SELECT t.id,0,lower(coalesce(nullif(btrim(t.owner_email),''),nullif(btrim(o.owner_email),''),nullif(btrim(o.buyer_email),''),t.buyer_email)),t.created_at
 FROM tickets t JOIN orders o ON o.id=t.order_id;
CREATE FUNCTION ticket_initial_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO ticket_ownership_history(ticket_id,sequence,owner_email,acquired_at)
 SELECT NEW.id,0,lower(coalesce(nullif(btrim(NEW.owner_email),''),nullif(btrim(o.owner_email),''),nullif(btrim(o.buyer_email),''),NEW.buyer_email)),NEW.created_at FROM orders o WHERE o.id=NEW.order_id;
 RETURN NEW;
END $$;
CREATE TRIGGER ticket_initial_owner AFTER INSERT ON tickets FOR EACH ROW EXECUTE FUNCTION ticket_initial_owner();
CREATE TRIGGER ticket_history_immutable BEFORE UPDATE OR DELETE ON ticket_ownership_history FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();
ALTER TABLE mail_jobs DROP CONSTRAINT mail_jobs_purpose_check;
ALTER TABLE mail_jobs ADD CONSTRAINT mail_jobs_purpose_check CHECK(purpose IN ('TICKET','SECURITY','TRANSFER'));
ALTER TABLE mail_jobs ADD COLUMN credential_version integer DEFAULT 0;
UPDATE mail_jobs SET credential_version=0 WHERE purpose='TICKET';
CREATE TABLE ticket_transfer_messages (
 id uuid PRIMARY KEY, transfer_id uuid NOT NULL REFERENCES ticket_transfers(id),
 kind text NOT NULL CHECK(kind IN ('INVITATION','ACCEPTED','CANCELLED')),
 revision integer NOT NULL, payload_cipher text NOT NULL, expires_at timestamptz NOT NULL
);
