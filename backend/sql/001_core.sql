CREATE TABLE IF NOT EXISTS backend_health (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO backend_health (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS api_audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS api_audit_events_actor_created_idx
  ON api_audit_events (actor_uid, created_at DESC);
