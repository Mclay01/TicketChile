-- No policy defaults, historical financial backfill, credentials or provider calls.
ALTER TABLE admin_users ADD COLUMN capabilities text[] NOT NULL DEFAULT ARRAY['operations.read','moderation.write','support.write','audit.read','reports.read'];
CREATE FUNCTION security_can_admin(actor_kind text, actor_id text, actor_version integer, capability text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT actor_kind='ADMIN' AND EXISTS (
 SELECT 1 FROM admin_users u JOIN identity_accounts a ON a.kind='ADMIN' AND a.id=u.id
 JOIN identity_mfa m ON m.kind=a.kind AND m.principal_id=a.id
 WHERE u.id=actor_id AND u.is_active AND NOT a.disabled AND a.version=actor_version
 AND m.enabled AND (u.role='SUPERADMIN' OR (u.role='ADMIN' AND capability=ANY(u.capabilities))))
$$;

ALTER TABLE organizer_users ADD COLUMN review_state text NOT NULL DEFAULT 'PENDING'
 CHECK(review_state IN ('PENDING','NEEDS_INFORMATION','APPROVED','REJECTED','SUSPENDED'));
UPDATE organizer_users SET review_state=CASE WHEN NOT is_active THEN 'SUSPENDED' WHEN approved THEN 'APPROVED' ELSE 'PENDING' END;
ALTER TABLE events ADD COLUMN moderation_block boolean NOT NULL DEFAULT false;
CREATE TABLE admin_operations (
 id uuid PRIMARY KEY, request_key text NOT NULL UNIQUE, actor_id text NOT NULL,
 action text NOT NULL, target_id text NOT NULL, reason text NOT NULL, fingerprint text NOT NULL,
 previous_state text, new_state text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER admin_operations_immutable BEFORE UPDATE OR DELETE ON admin_operations FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();

CREATE TABLE commission_versions (
 id uuid PRIMARY KEY, scope text NOT NULL CHECK(scope IN ('GLOBAL','ORGANIZER','EVENT')),
 organizer_id text REFERENCES organizer_users(id), event_id text REFERENCES events(id),
 basis_points integer NOT NULL CHECK(basis_points BETWEEN 0 AND 10000),
 fixed_clp integer NOT NULL CHECK(fixed_clp BETWEEN 0 AND 100000000),
 effective_at timestamptz NOT NULL, policy_reference text NOT NULL, actor_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((scope='GLOBAL' AND organizer_id IS NULL AND event_id IS NULL) OR
 (scope='ORGANIZER' AND organizer_id IS NOT NULL AND event_id IS NULL) OR
 (scope='EVENT' AND organizer_id IS NULL AND event_id IS NOT NULL))
);
CREATE TRIGGER commission_versions_immutable BEFORE UPDATE OR DELETE ON commission_versions FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();
CREATE INDEX commission_effective ON commission_versions(scope,effective_at DESC);
CREATE TABLE payment_finance_snapshots (
 payment_id text PRIMARY KEY REFERENCES payments(id), organizer_id text NOT NULL REFERENCES organizer_users(id),
 commission_id uuid REFERENCES commission_versions(id), gross_clp integer NOT NULL,
 commission_clp integer, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(commission_clp IS NULL OR commission_clp BETWEEN 0 AND gross_clp)
);
CREATE TRIGGER payment_finance_immutable BEFORE UPDATE OR DELETE ON payment_finance_snapshots FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();
CREATE FUNCTION snapshot_payment_finance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE org text; policy commission_versions%ROWTYPE; fee bigint;
BEGIN
 SELECT organizer_id INTO org FROM organizer_events WHERE event_id=NEW.event_id;
 IF org IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO policy FROM commission_versions c WHERE c.effective_at<=NEW.created_at AND
 (c.scope='GLOBAL' OR c.organizer_id=org OR c.event_id=NEW.event_id)
 ORDER BY CASE c.scope WHEN 'EVENT' THEN 3 WHEN 'ORGANIZER' THEN 2 ELSE 1 END DESC,c.effective_at DESC,c.created_at DESC,c.id DESC LIMIT 1;
 IF policy.id IS NOT NULL THEN fee:=floor(NEW.amount_clp::numeric*policy.basis_points/10000)+policy.fixed_clp;
 IF fee>NEW.amount_clp THEN RAISE EXCEPTION 'commission exceeds gross'; END IF; END IF;
 INSERT INTO payment_finance_snapshots(payment_id,organizer_id,commission_id,gross_clp,commission_clp)
 VALUES(NEW.id,org,policy.id,NEW.amount_clp,fee);
 RETURN NEW;
END $$;
CREATE TRIGGER payment_finance_snapshot AFTER INSERT ON payments FOR EACH ROW EXECUTE FUNCTION snapshot_payment_finance();

CREATE TABLE refunds (
 id uuid PRIMARY KEY, payment_id text NOT NULL REFERENCES payments(id), order_id text NOT NULL REFERENCES orders(id),
 amount_clp integer NOT NULL CHECK(amount_clp>0), status text NOT NULL DEFAULT 'REQUESTED'
 CHECK(status IN ('REQUESTED','APPROVED','PROCESSING','UNKNOWN','COMPLETED','FAILED','REJECTED')),
 policy_reference text, provider_ref text UNIQUE, first_attempt_at timestamptz, lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX refund_one_live ON refunds(payment_id) WHERE status NOT IN ('FAILED','REJECTED');
CREATE TABLE refund_tickets(refund_id uuid REFERENCES refunds(id),ticket_id text REFERENCES tickets(id),PRIMARY KEY(refund_id,ticket_id));
CREATE TRIGGER refund_tickets_immutable BEFORE UPDATE OR DELETE ON refund_tickets FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();
CREATE TABLE refund_evidence (
 id uuid PRIMARY KEY, refund_id uuid NOT NULL REFERENCES refunds(id), provider_ref text NOT NULL,
 status text NOT NULL, amount_clp integer NOT NULL, source text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(refund_id,provider_ref,status)
);
CREATE TRIGGER refund_evidence_immutable BEFORE UPDATE OR DELETE ON refund_evidence FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();

CREATE TABLE settlements (
 id uuid PRIMARY KEY, organizer_id text NOT NULL REFERENCES organizer_users(id), event_id text NOT NULL REFERENCES events(id),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','PAID','CANCELLED')),
 gross_clp bigint NOT NULL, refunds_clp bigint NOT NULL, commission_clp bigint NOT NULL,
 adjustments_clp bigint NOT NULL DEFAULT 0, net_clp bigint NOT NULL,
 policy_reference text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE settlement_lines (
 settlement_id uuid REFERENCES settlements(id), payment_id text REFERENCES payments(id),
 gross_clp integer NOT NULL, refunds_clp integer NOT NULL, commission_clp integer NOT NULL,
 commission_id uuid NOT NULL REFERENCES commission_versions(id), PRIMARY KEY(settlement_id,payment_id)
);
CREATE TRIGGER settlement_lines_immutable BEFORE UPDATE OR DELETE ON settlement_lines FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();
CREATE TABLE settlement_claims(payment_id text PRIMARY KEY REFERENCES payments(id),settlement_id uuid NOT NULL REFERENCES settlements(id));
CREATE TABLE settlement_adjustments(id uuid PRIMARY KEY,settlement_id uuid NOT NULL REFERENCES settlements(id),amount_clp integer NOT NULL,reason text NOT NULL,actor_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER settlement_adjustments_immutable BEFORE UPDATE OR DELETE ON settlement_adjustments FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();
CREATE TABLE payout_records(id uuid PRIMARY KEY,settlement_id uuid NOT NULL UNIQUE REFERENCES settlements(id),reference text NOT NULL UNIQUE,amount_clp bigint NOT NULL CHECK(amount_clp>0),actor_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER payout_records_immutable BEFORE UPDATE OR DELETE ON payout_records FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();

CREATE TABLE support_cases(id uuid PRIMARY KEY,subject text NOT NULL,status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','RESOLVED')),order_id text REFERENCES orders(id),organizer_id text REFERENCES organizer_users(id),event_id text REFERENCES events(id),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE support_notes(id uuid PRIMARY KEY,case_id uuid NOT NULL REFERENCES support_cases(id),body text NOT NULL,actor_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TRIGGER support_notes_immutable BEFORE UPDATE OR DELETE ON support_notes FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();
CREATE INDEX support_backlog ON support_cases(status,created_at DESC);
CREATE INDEX refund_backlog ON refunds(status,created_at DESC);
CREATE INDEX refund_admission ON refunds(order_id) WHERE status IN ('PROCESSING','UNKNOWN','COMPLETED');
CREATE INDEX settlement_backlog ON settlements(status,created_at DESC);
