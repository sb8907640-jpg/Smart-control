-- Master production schema for the Smart Control relational backend.
-- Migration is additive and idempotent. It preserves the existing device/link data
-- while bringing the 52-table master domain registry into the PostgreSQL schema.

DO $$
BEGIN
  IF to_regclass('public.app_users') IS NOT NULL AND to_regclass('public.users') IS NULL THEN
    ALTER TABLE app_users RENAME TO users;
  END IF;
  IF to_regclass('public.audit_events') IS NOT NULL AND to_regclass('public.audit_logs') IS NULL THEN
    ALTER TABLE audit_events RENAME TO audit_logs;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS permissions (
  id BIGSERIAL PRIMARY KEY, key TEXT UNIQUE NOT NULL, description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'ACTIVE', metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS auth_tokens (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL, token_type TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS otp_codes (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, destination TEXT NOT NULL, code_hash TEXT NOT NULL, purpose TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS owner_accounts (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE CASCADE, account_status TEXT NOT NULL DEFAULT 'ACTIVE', settings JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS free_access_grants (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, granted_by BIGINT REFERENCES users(id) ON DELETE SET NULL, reason TEXT, status TEXT NOT NULL DEFAULT 'ACTIVE', starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ends_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), controller_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'DISCONNECTED', last_connected_at TIMESTAMPTZ, last_disconnected_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS pairing_codes (
  id BIGSERIAL PRIMARY KEY, owner_uid TEXT NOT NULL, code TEXT UNIQUE NOT NULL, client_uid TEXT, status TEXT NOT NULL DEFAULT 'PENDING', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL, paired_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS group_links (
  id BIGSERIAL PRIMARY KEY, group_key TEXT NOT NULL, owner_uid TEXT NOT NULL, client_uid TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS persistent_links (
  id BIGSERIAL PRIMARY KEY, connection_id UUID REFERENCES connections(id) ON DELETE CASCADE, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, controller_uid TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', last_seen_at TIMESTAMPTZ, reconnect_after TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS connection_logs (
  id BIGSERIAL PRIMARY KEY, connection_id UUID REFERENCES connections(id) ON DELETE SET NULL, user_id TEXT NOT NULL, event TEXT NOT NULL, reason TEXT, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS reconnect_queue (
  id BIGSERIAL PRIMARY KEY, connection_id UUID REFERENCES connections(id) ON DELETE CASCADE, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), status TEXT NOT NULL DEFAULT 'PENDING', last_error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS permission_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, permission_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'REQUESTED', requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), resolved_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS permission_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), request_id UUID REFERENCES permission_requests(id) ON DELETE CASCADE, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, permission_key TEXT NOT NULL, granted BOOLEAN NOT NULL DEFAULT FALSE, source TEXT NOT NULL, granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, scope JSONB NOT NULL, granted BOOLEAN NOT NULL, version TEXT, ip_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS location_data (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, accuracy_m DOUBLE PRECISION, captured_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS camera_data (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, object_key TEXT NOT NULL, media_type TEXT NOT NULL, consent_id UUID REFERENCES consent_logs(id) ON DELETE SET NULL, captured_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS mic_data (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, object_key TEXT NOT NULL, duration_ms BIGINT, consent_id UUID REFERENCES consent_logs(id) ON DELETE SET NULL, captured_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS gallery_data (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, object_key TEXT NOT NULL, media_type TEXT, selected_by_user BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS screen_data (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, kind TEXT NOT NULL, object_key TEXT, session_id UUID REFERENCES sessions(id) ON DELETE SET NULL, consent_id UUID REFERENCES consent_logs(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS clipboard_data (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, content_hash TEXT NOT NULL, content TEXT, captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS notification_data (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, title TEXT, body TEXT, package_name TEXT, received_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS touch_events (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, session_id UUID REFERENCES sessions(id) ON DELETE SET NULL, action TEXT NOT NULL, approved BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS keyboard_events (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, session_id UUID REFERENCES sessions(id) ON DELETE SET NULL, action TEXT NOT NULL, approved BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS app_install_logs (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, package_name TEXT NOT NULL, operation TEXT NOT NULL, status TEXT NOT NULL, system_confirmed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS file_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, direction TEXT NOT NULL, object_key TEXT, bytes BIGINT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'REQUESTED', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS clipboard_sync (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, content_hash TEXT NOT NULL, direction TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS remote_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), controller_uid TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, session_id UUID REFERENCES sessions(id) ON DELETE SET NULL, command_type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'REQUESTED', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS p2p_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), connection_id UUID REFERENCES connections(id) ON DELETE CASCADE, controller_uid TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'NEGOTIATING', transport TEXT, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ended_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS control_logs (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, session_id UUID REFERENCES sessions(id) ON DELETE SET NULL, action TEXT NOT NULL, result TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS files_access (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, object_key TEXT NOT NULL, path_label TEXT, selected_by_user BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, contact_hash TEXT, display_name TEXT, selected_by_user BOOLEAN NOT NULL DEFAULT FALSE, captured_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sms_logs (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, message_hash TEXT, sender_hash TEXT, direction TEXT, captured_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS call_logs (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, number_hash TEXT, direction TEXT, duration_seconds INTEGER, captured_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS app_usage (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, package_name TEXT NOT NULL, foreground_ms BIGINT NOT NULL DEFAULT 0, captured_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS data_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, scope JSONB NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'REQUESTED', object_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ, expires_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT TRUE, price_minor BIGINT NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'INR', display_order INTEGER NOT NULL DEFAULT 0, features JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, plan_id TEXT REFERENCES plans(id) ON DELETE RESTRICT, status TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ends_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL, provider TEXT NOT NULL, provider_payment_id TEXT, amount_minor BIGINT NOT NULL, currency TEXT NOT NULL DEFAULT 'INR', status TEXT NOT NULL DEFAULT 'INITIATED', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), verified_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS emi_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, payment_id UUID REFERENCES payments(id) ON DELETE SET NULL, installment_no INTEGER NOT NULL, amount_minor BIGINT NOT NULL, due_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', paid_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS free_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, granted_by TEXT NOT NULL, plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL, reason TEXT, starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ends_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sos_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'TRIGGERED', message TEXT, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION, triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), cancelled_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS battery_info (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, level_percent NUMERIC(5,2), charging BOOLEAN, captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS network_info (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, device_id BIGINT REFERENCES devices(id) ON DELETE CASCADE, transport TEXT, connected BOOLEAN NOT NULL, metered BOOLEAN, captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY, actor_uid TEXT, event_type TEXT NOT NULL, resource_type TEXT, resource_id TEXT, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN', priority TEXT NOT NULL DEFAULT 'NORMAL', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'NOT_CONNECTED', external_ref TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS chat_logs (
  id BIGSERIAL PRIMARY KEY, user_id TEXT NOT NULL, support_ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE, direction TEXT NOT NULL, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON sessions(user_id,status);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id,expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_destination ON otp_codes(destination,expires_at);
CREATE INDEX IF NOT EXISTS idx_connections_controller ON connections(controller_user_id,status);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_owner ON pairing_codes(owner_uid,status);
CREATE INDEX IF NOT EXISTS idx_persistent_links_device ON persistent_links(device_id,status);
CREATE INDEX IF NOT EXISTS idx_reconnect_queue_due ON reconnect_queue(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_permission_requests_user ON permission_requests(user_id,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_permission_grants_device ON permission_grants(device_id,permission_key);
CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_logs(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_location_device_time ON location_data(device_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_control_logs_device_time ON control_logs(device_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_remote_commands_device_status ON remote_commands(device_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON subscriptions(user_id,status);
CREATE INDEX IF NOT EXISTS idx_payments_user_time ON payments(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_user_time ON sos_alerts(user_id,triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_time ON audit_logs(actor_uid,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id,status,created_at DESC);
