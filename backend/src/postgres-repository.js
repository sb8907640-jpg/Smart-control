function createPostgresRepository(pool) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("A PostgreSQL pool is required.");

  return {
    async upsertDevice({ id, userId, deviceKey, name, platform }) {
      const key = String(deviceKey || id || "").trim();
      if (!key) throw new TypeError("deviceKey is required.");
      const result = await pool.query(
        `INSERT INTO devices (owner_uid, device_key, platform, name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (owner_uid, device_key) DO UPDATE SET
           platform = EXCLUDED.platform, name = EXCLUDED.name, updated_at = NOW()
         RETURNING id, owner_uid, device_key, platform, name, created_at, updated_at`,
        [userId, key, platform, name || null]
      );
      return result.rows[0];
    },

    async listDevices(userId) {
      const result = await pool.query(
        "SELECT id, owner_uid, device_key, name, platform, created_at, updated_at FROM devices WHERE owner_uid = $1 ORDER BY created_at DESC LIMIT 100",
        [userId]
      );
      return result.rows;
    },

    async recordAudit({ userId, deviceId, feature, action, metadata = {} }) {
      const result = await pool.query(
        `INSERT INTO audit_events (actor_uid, event_type, resource_type, resource_id, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, created_at`,
        [userId, action || feature || "unknown", feature || null, deviceId ? String(deviceId) : null, JSON.stringify(metadata)]
      );
      return result.rows[0];
    }
  };
}

module.exports = { createPostgresRepository };
