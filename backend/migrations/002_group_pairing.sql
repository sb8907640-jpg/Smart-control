CREATE TABLE IF NOT EXISTS device_groups (
  id BIGSERIAL PRIMARY KEY,
  owner_uid TEXT NOT NULL,
  name TEXT NOT NULL,
  join_code TEXT UNIQUE NOT NULL,
  max_clients INTEGER NOT NULL DEFAULT 100 CHECK (max_clients BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_group_members (
  group_id BIGINT NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
  member_uid TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'CLIENT',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, member_uid)
);

CREATE INDEX IF NOT EXISTS idx_device_group_members_uid ON device_group_members(member_uid);
