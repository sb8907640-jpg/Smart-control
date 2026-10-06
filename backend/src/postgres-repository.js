function createPostgresRepository(pool) {
  if (!pool || typeof pool.query !== "function") throw new TypeError("A PostgreSQL pool is required.");

  return {
    async upsertDevice({ id, userId, name, platform }) {
      const result = await pool.query(
        `INSERT INTO devices (id, user_id, name, platform)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id,
           name = EXCLUDED.name, platform = EXCLUDED.platform, updated_at = NOW()
         RETURNING id, user_id, name, platform, created_at, updated_at`,
        [id, userId, name, platform]
      );
      return result.rows[0];
    },
    async listDevices(userId) {
      const result = await pool.query(
        "SELECT id, user_id, name, platform, created_at, updated_at FROM devices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
        [userId]
      );
      return result.rows;
    },
    async recordAudit({ userId, deviceId, feature, action, metadata = {} }) {
      const result = await pool.query(
        `INSERT INTO audit_events (user_id, device_id, feature, action, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id, created_at`,
        [userId, deviceId, feature, action, JSON.stringify(metadata)]
      );
      return result.rows[0];
    }
  };
}

module.exports = { createPostgresRepository };
