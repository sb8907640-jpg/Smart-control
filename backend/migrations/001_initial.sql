CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT,
  phone_number TEXT,
  role TEXT NOT NULL DEFAULT 'USER',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS devices (
  id BIGSERIAL PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  device_key TEXT NOT NULL,
  platform TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_uid, device_key)
);
CREATE TABLE IF NOT EXISTS device_links (
  id BIGSERIAL PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  client_uid TEXT,
  pairing_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_uid TEXT,
  event_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_uid);
CREATE INDEX IF NOT EXISTS idx_links_owner ON device_links(owner_uid);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time ON audit_events(actor_uid, created_at DESC);
