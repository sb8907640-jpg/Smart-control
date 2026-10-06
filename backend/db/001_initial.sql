CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE,
  email TEXT,
  phone_number TEXT,
  role TEXT NOT NULL DEFAULT 'USER',
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  device_name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_created ON audit_events(actor_uid, created_at DESC);
CREATE TABLE IF NOT EXISTS consent_events (
  id BIGSERIAL PRIMARY KEY,
  subject_uid TEXT NOT NULL,
  controller_uid TEXT,
  purpose TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consent_events_subject_created ON consent_events(subject_uid, created_at DESC);
