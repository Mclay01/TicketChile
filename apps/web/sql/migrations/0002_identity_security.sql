-- Additive M3 security foundation. Existing financial/history tables are retained.
ALTER TABLE admin_users ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE admin_users ADD COLUMN role text NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN','SUPERADMIN'));
ALTER TABLE admin_users ADD COLUMN email text;
ALTER TABLE admin_users ADD COLUMN email_verified_at timestamptz;
ALTER TABLE usuarios ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE TABLE identity_accounts (
 kind text NOT NULL CHECK (kind IN ('BUYER','ORGANIZER','ADMIN')), id text NOT NULL,
 version integer NOT NULL DEFAULT 1, disabled boolean NOT NULL DEFAULT false,
 mfa_required boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(kind,id)
);
INSERT INTO identity_accounts(kind,id,mfa_required)
 SELECT 'BUYER',id::text,false FROM usuarios UNION ALL
 SELECT 'ORGANIZER',id,true FROM organizer_users UNION ALL SELECT 'ADMIN',id,true FROM admin_users;
CREATE FUNCTION identity_account_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO identity_accounts(kind,id,mfa_required) VALUES (TG_ARGV[0],NEW.id::text,TG_ARGV[0]<>'BUYER');
 RETURN NEW;
END $$;
CREATE TRIGGER identity_buyer_insert AFTER INSERT ON usuarios FOR EACH ROW EXECUTE FUNCTION identity_account_insert('BUYER');
CREATE TRIGGER identity_organizer_insert AFTER INSERT ON organizer_users FOR EACH ROW EXECUTE FUNCTION identity_account_insert('ORGANIZER');
CREATE TRIGGER identity_admin_insert AFTER INSERT ON admin_users FOR EACH ROW EXECUTE FUNCTION identity_account_insert('ADMIN');

CREATE VIEW identity_principals AS
 SELECT 'BUYER'::text AS kind,id::text,email,email AS login,nombre AS name,password_hash,
   (email_verified_at IS NOT NULL) AS verified,is_active AS active,'BUYER'::text AS role FROM usuarios
 UNION ALL SELECT 'ORGANIZER',id,email,username,display_name,password_hash,verified,
   (is_active AND approved),'ORGANIZER_OWNER' FROM organizer_users
 UNION ALL SELECT 'ADMIN',id,email,username,display_name,password_hash,
   (email_verified_at IS NOT NULL),is_active,role FROM admin_users;

CREATE TABLE identity_sessions (
 token_hash text PRIMARY KEY, kind text NOT NULL, principal_id text NOT NULL,
 version integer NOT NULL, mfa_verified boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, FOREIGN KEY(kind,principal_id) REFERENCES identity_accounts(kind,id)
);
CREATE INDEX identity_sessions_actor ON identity_sessions(kind,principal_id);
CREATE INDEX identity_sessions_expiry ON identity_sessions(expires_at);
CREATE TABLE identity_tokens (
 token_hash text PRIMARY KEY, kind text NOT NULL, principal_id text NOT NULL,
 purpose text NOT NULL CHECK (purpose IN ('RESET','VERIFY')), version integer NOT NULL,
 expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(kind,principal_id) REFERENCES identity_accounts(kind,id)
);
CREATE INDEX identity_tokens_actor ON identity_tokens(kind,principal_id,purpose);
CREATE TABLE security_outbox (
 id uuid PRIMARY KEY, purpose text NOT NULL, payload_cipher text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 delivered_at timestamptz
);
CREATE TABLE identity_mfa (
 kind text NOT NULL, principal_id text NOT NULL, secret_cipher text, pending_cipher text,
 pending_expires_at timestamptz, last_counter bigint NOT NULL DEFAULT -1,
 recovery_hashes text[] NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(kind,principal_id), FOREIGN KEY(kind,principal_id) REFERENCES identity_accounts(kind,id)
);
CREATE TABLE organizer_staff (
 id uuid PRIMARY KEY, organizer_id text NOT NULL REFERENCES organizer_users(id),
 buyer_id uuid NOT NULL REFERENCES usuarios(id), role text NOT NULL CHECK
 (role IN ('ORGANIZER_MANAGER','ORGANIZER_DOOR','ORGANIZER_FINANCE','ORGANIZER_SUPPORT')),
 capabilities text[] NOT NULL, event_ids text[], revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organizer_id,buyer_id)
);
CREATE INDEX organizer_staff_buyer ON organizer_staff(buyer_id) WHERE revoked_at IS NULL;
CREATE TABLE organizer_invites (
 id uuid PRIMARY KEY, organizer_id text NOT NULL REFERENCES organizer_users(id), email text NOT NULL,
 role text NOT NULL, capabilities text[] NOT NULL, event_ids text[], token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, accepted_at timestamptz, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organizer_invites_pending ON organizer_invites(organizer_id,lower(email))
 WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE TABLE security_rate_limits (
 bucket text NOT NULL, subject_hash text NOT NULL, window_start timestamptz NOT NULL,
 hits integer NOT NULL, expires_at timestamptz NOT NULL, PRIMARY KEY(bucket,subject_hash)
);
CREATE INDEX security_rate_expiry ON security_rate_limits(expires_at);
CREATE TABLE security_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_kind text NOT NULL, actor_id text,
 organizer_id text, event_id text, action text NOT NULL, target_type text NOT NULL, target_id text,
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_audit_scope ON security_audit(organizer_id,created_at DESC);
CREATE INDEX security_audit_actor ON security_audit(actor_kind,actor_id,created_at DESC);
CREATE FUNCTION immutable_security_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit records are append-only'; END $$;
CREATE TRIGGER security_audit_immutable BEFORE UPDATE OR DELETE ON security_audit
 FOR EACH ROW EXECUTE FUNCTION immutable_security_audit();

ALTER TABLE holds ADD COLUMN owner_email text;
CREATE INDEX holds_owner_active ON holds(lower(owner_email),expires_at) WHERE status='ACTIVE';
