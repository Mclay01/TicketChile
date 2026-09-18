ALTER TABLE payments ADD COLUMN verified_at timestamptz;
ALTER TABLE payments ADD COLUMN provider_intent text;
ALTER TABLE payments ADD COLUMN fulfillment_status text NOT NULL DEFAULT 'PENDING'
 CHECK (fulfillment_status IN ('PENDING','ISSUED','REVIEW'));
ALTER TABLE payments ADD COLUMN creation_state text NOT NULL DEFAULT 'UNKNOWN'
 CHECK (creation_state IN ('NEW','CREATING','READY','UNKNOWN'));
ALTER TABLE payments ADD COLUMN checkout_url text;
ALTER TABLE payments ADD COLUMN request_key text;
ALTER TABLE payments ADD COLUMN request_hash text;
ALTER TABLE payments ADD COLUMN creation_started_at timestamptz;
ALTER TABLE payments ADD COLUMN last_reconciled_at timestamptz;
ALTER TABLE payments ADD COLUMN fee_clp integer NOT NULL DEFAULT 0 CHECK (fee_clp >= 0);
CREATE UNIQUE INDEX payments_request_key ON payments(lower(owner_email),request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX payments_provider_intent ON payments(provider,provider_intent) WHERE provider_intent IS NOT NULL;
UPDATE payments SET creation_state='READY' WHERE provider_ref IS NOT NULL;
UPDATE payments SET fulfillment_status='ISSUED' WHERE order_id IS NOT NULL AND status='PAID';
-- Existing PAID rows are not retroactively certified as verified evidence.
CREATE TABLE payment_evidence (
 provider text NOT NULL, reference text NOT NULL, observation_key text NOT NULL,
 payment_id text NOT NULL REFERENCES payments(id), status text NOT NULL,
 amount_clp integer NOT NULL, currency text NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(provider,observation_key)
);
ALTER TABLE tickets ADD COLUMN issuance_index integer;
WITH slots AS (SELECT id,row_number() OVER(PARTITION BY order_id,ticket_type_id ORDER BY created_at,id) AS n FROM tickets)
 UPDATE tickets t SET issuance_index=slots.n FROM slots WHERE slots.id=t.id;
CREATE UNIQUE INDEX tickets_issuance_slot ON tickets(order_id,ticket_type_id,issuance_index);
CREATE TABLE mail_jobs (
 id uuid PRIMARY KEY, dedupe_key text NOT NULL UNIQUE,
 purpose text NOT NULL CHECK(purpose IN ('TICKET','SECURITY')),
 source_id text NOT NULL, recipient text NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENDING','SENT','CANCELLED','REVIEW')),
 payload_cipher text, attempts integer NOT NULL DEFAULT 0, first_attempt_at timestamptz,
 lease_until timestamptz, lease_token uuid, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz,
 delivery_transport text CHECK(delivery_transport IN ('RESEND','TEST'))
);
CREATE INDEX mail_jobs_pending ON mail_jobs(state,next_attempt_at);
