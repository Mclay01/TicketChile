-- enums “a lo simple”: TEXT + CHECK (evita líos en migraciones)

-- =========================
-- AUTH (users + email verification)
-- =========================

CREATE TABLE IF NOT EXISTS users (
  id                text PRIMARY KEY,
  email             text NOT NULL UNIQUE,
  password_hash     text, -- null => usuario solo Google (o aún no setea password)
  email_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_nonempty CHECK (length(trim(email)) > 3)
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);

-- Guarda SOLO el hash sha256(token) en hex. Nunca guardes el token plano.
-- Un usuario = 1 token activo (simple).
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash  text PRIMARY KEY, -- sha256(token) hex
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT evt_expires_future CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_user_uniq
  ON email_verification_tokens(user_id);

CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_idx
  ON email_verification_tokens(expires_at);


-- =========================
-- CORE APP TABLES
-- =========================

CREATE TABLE IF NOT EXISTS events (
  id          text PRIMARY KEY,
  slug        text UNIQUE NOT NULL,
  title       text NOT NULL,
  city        text NOT NULL,
  venue       text NOT NULL,
  date_iso    timestamptz NOT NULL,
  description text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_types (
  id          text NOT NULL,
  event_id    text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        text NOT NULL,
  price_clp   int  NOT NULL,
  capacity    int  NOT NULL,
  sold        int  NOT NULL DEFAULT 0,
  held        int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT NOW(),

  PRIMARY KEY (event_id, id),
  CONSTRAINT ticket_types_nonneg CHECK (capacity >= 0 AND sold >= 0 AND held >= 0)
);

CREATE TABLE IF NOT EXISTS holds (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('ACTIVE','EXPIRED','CONSUMED')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS hold_items (
  hold_id          text NOT NULL REFERENCES holds(id) ON DELETE CASCADE,
  event_id         text NOT NULL,
  ticket_type_id   text NOT NULL,
  ticket_type_name text NOT NULL,
  unit_price_clp   int  NOT NULL,
  qty              int  NOT NULL CHECK (qty > 0),

  PRIMARY KEY (hold_id, ticket_type_id),

  CONSTRAINT hold_items_ticket_fk
    FOREIGN KEY (event_id, ticket_type_id)
    REFERENCES ticket_types(event_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS orders (
  id          text PRIMARY KEY,
  hold_id     text UNIQUE NOT NULL REFERENCES holds(id) ON DELETE RESTRICT,
  event_id    text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  event_title text NOT NULL,
  buyer_name  text NOT NULL,
  buyer_email text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id               text PRIMARY KEY,
  order_id         text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_id         text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  ticket_type_id   text NOT NULL,
  ticket_type_name text NOT NULL,
  buyer_email      text NOT NULL,
  status           text NOT NULL CHECK (status IN ('VALID','USED','CANCELLED')),
  used_at          timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT NOW()
);


-- =========================
-- PAYMENTS + WEBHOOK DEDUPE
-- =========================

CREATE TABLE IF NOT EXISTS payments (
  id           text PRIMARY KEY,
  hold_id      text NOT NULL UNIQUE REFERENCES holds(id) ON DELETE CASCADE,

  provider     text NOT NULL,
  provider_ref text, -- ej: stripe session id

  event_id     text, -- recomendado
  event_title  text NOT NULL,
  buyer_name   text NOT NULL,
  buyer_email  text NOT NULL,

  amount_clp   int  NOT NULL,
  currency     text NOT NULL DEFAULT 'CLP',

  status       text NOT NULL, -- CREATED | PENDING | PAID | FAILED | CANCELLED
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW(),
  paid_at      timestamptz,
  order_id     text REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS payments_hold_id_idx ON payments(hold_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);

-- Evita duplicados por proveedor+ref (cuando exista)
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_uniq
  ON payments(provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

-- Dedupe de webhooks (por provider + event_id)
CREATE TABLE IF NOT EXISTS webhook_events (
  provider   text NOT NULL,
  event_id   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);


-- =========================
-- USEFUL INDEXES
-- =========================

CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON ticket_types(event_id);
CREATE INDEX IF NOT EXISTS idx_holds_active_exp ON holds(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets(event_id, status);
