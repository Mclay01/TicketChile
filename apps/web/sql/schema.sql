-- =========================================================
-- ENUMS “A LO SIMPLE” (TEXT + CHECK)
-- =========================================================


-- =========================================================
-- AUTH (public users + email verification)
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id                text PRIMARY KEY,
  email             text NOT NULL UNIQUE,
  password_hash     text,
  email_verified_at timestamptz,
  created_at        timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_nonempty CHECK (length(trim(email)) > 3)
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);


CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash  text PRIMARY KEY,
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



-- =========================================================
-- CORE EVENTS (PUBLIC EVENTS APPROVED)
-- =========================================================

CREATE TABLE IF NOT EXISTS events (
  id           text PRIMARY KEY,
  slug         text UNIQUE NOT NULL,
  title        text NOT NULL,
  city         text NOT NULL,
  venue        text NOT NULL,
  date_iso     timestamptz NOT NULL,

  image        text NOT NULL DEFAULT '/events/default.jpg',
  hero_desktop text,
  hero_mobile  text,

  description  text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT NOW()
);



-- =========================================================
-- TICKETS
-- =========================================================

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

CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON ticket_types(event_id);


CREATE TABLE IF NOT EXISTS holds (
  id         text PRIMARY KEY,
  event_id   text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('ACTIVE','EXPIRED','CONSUMED')),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_holds_active_exp ON holds(status, expires_at);


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
  owner_email text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_owner_email_idx ON orders(owner_email);


CREATE TABLE IF NOT EXISTS tickets (
  id               text PRIMARY KEY,
  order_id         text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_id         text NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  ticket_type_id   text NOT NULL,
  ticket_type_name text NOT NULL,
  buyer_email      text NOT NULL,
  owner_email      text NOT NULL,
  status           text NOT NULL CHECK (status IN ('VALID','USED','CANCELLED')),
  used_at          timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tickets_owner_email_idx ON tickets(owner_email);
CREATE INDEX IF NOT EXISTS idx_tickets_event_status ON tickets(event_id, status);



-- =========================================================
-- PAYMENTS
-- =========================================================

CREATE TABLE IF NOT EXISTS payments (
  id           text PRIMARY KEY,
  hold_id      text NOT NULL UNIQUE REFERENCES holds(id) ON DELETE CASCADE,

  provider     text NOT NULL,
  provider_ref text,

  event_id     text,
  event_title  text NOT NULL,
  buyer_name   text NOT NULL,
  buyer_email  text NOT NULL,
  owner_email  text NOT NULL,

  amount_clp   int  NOT NULL,
  currency     text NOT NULL DEFAULT 'CLP',

  status       text NOT NULL CHECK (status IN ('CREATED','PENDING','PAID','FAILED','CANCELLED')),
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  updated_at   timestamptz NOT NULL DEFAULT NOW(),
  paid_at      timestamptz,
  order_id     text REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS payments_hold_id_idx ON payments(hold_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments(status);
CREATE INDEX IF NOT EXISTS payments_owner_email_idx ON payments(owner_email);

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_ref_uniq
  ON payments(provider, provider_ref)
  WHERE provider_ref IS NOT NULL;


CREATE TABLE IF NOT EXISTS webhook_events (
  provider   text NOT NULL,
  event_id   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (provider, event_id)
);



-- =========================================================
-- ORGANIZERS (INTERNAL AUTH SYSTEM)
-- =========================================================

CREATE TABLE IF NOT EXISTS organizer_users (
  id            text PRIMARY KEY,
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name  text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT organizer_username_nonempty CHECK (length(trim(username)) > 2)
);

CREATE INDEX IF NOT EXISTS organizer_users_username_idx
  ON organizer_users(username);


CREATE TABLE IF NOT EXISTS organizer_sessions (
  id           text PRIMARY KEY,
  organizer_id text NOT NULL REFERENCES organizer_users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  expires_at   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS organizer_sessions_org_idx
  ON organizer_sessions(organizer_id);

CREATE INDEX IF NOT EXISTS organizer_sessions_exp_idx
  ON organizer_sessions(expires_at);



-- =========================================================
-- ORGANIZER EVENT FLOW
-- =========================================================

-- 1️⃣ Evento enviado por organizador (pendiente revisión)

CREATE TABLE IF NOT EXISTS organizer_event_submissions (
  id           text PRIMARY KEY,
  organizer_id text NOT NULL REFERENCES organizer_users(id) ON DELETE CASCADE,
  status       text NOT NULL CHECK (status IN ('IN_REVIEW','APPROVED','REJECTED')),
  payload      jsonb NOT NULL,
  review_notes text,
  created_at   timestamptz NOT NULL DEFAULT NOW(),
  reviewed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS organizer_event_submissions_org_idx
  ON organizer_event_submissions(organizer_id);

CREATE INDEX IF NOT EXISTS organizer_event_submissions_status_idx
  ON organizer_event_submissions(status);


-- 2️⃣ Mapea evento aprobado -> organizador dueño

CREATE TABLE IF NOT EXISTS organizer_events (
  event_id      text PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  organizer_id  text NOT NULL REFERENCES organizer_users(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organizer_events_org_idx
  ON organizer_events(organizer_id);