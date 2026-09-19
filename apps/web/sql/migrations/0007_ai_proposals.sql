ALTER TABLE events ADD COLUMN short_description text NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN seo_title text NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN seo_description text NOT NULL DEFAULT '';

CREATE TABLE ai_requests (
 id uuid PRIMARY KEY,
 subject_hash text NOT NULL,
 input_hash text NOT NULL,
 event_id text REFERENCES events(id),
 actor_kind text,
 actor_id text,
 feature text NOT NULL,
 provider text NOT NULL,
 model text NOT NULL,
 state text NOT NULL CHECK(state IN ('RUNNING','SUCCEEDED','FAILED')),
 outcome text,
 latency_ms integer,
 input_tokens integer,
 output_tokens integer,
 result_ciphertext text,
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days'
);
CREATE INDEX ai_requests_expiry ON ai_requests(expires_at);
CREATE TABLE ai_simulator_sessions (
 token_hash text PRIMARY KEY,
 draft_ciphertext text,
 proposal_id uuid REFERENCES ai_requests(id),
 bound_kind text,
 bound_id text,
 claimed_event_id text REFERENCES events(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 CHECK ((bound_kind IS NULL)=(bound_id IS NULL))
);
CREATE INDEX ai_simulator_expiry ON ai_simulator_sessions(expires_at);
