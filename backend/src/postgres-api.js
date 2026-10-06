const crypto = require("node:crypto");

function installPostgresRoutes(app, { pool }) {
  const auth = (req, res, next) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Authentication required." });
    req.pgUser = uid;
    next();
  };

  app.get("/api/postgres/status", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ ok: true, database: "postgresql" });
    } catch (_) {
      res.status(503).json({ ok: false, database: "postgresql" });
    }
  });

  app.get("/api/postgres/devices", auth, async (req, res, next) => {
    try {
      const q = await pool.query(
        "SELECT id,device_key,platform,name,created_at,updated_at FROM devices WHERE owner_uid=$1 ORDER BY updated_at DESC LIMIT 100",
        [req.pgUser]
      );
      res.json({ devices: q.rows });
    } catch (e) { next(e); }
  });

  app.post("/api/postgres/devices", auth, async (req, res, next) => {
    try {
      const { deviceKey, platform, name } = req.body || {};
      if (!deviceKey || !platform) return res.status(400).json({ error: "deviceKey and platform are required." });
      const q = await pool.query(
        "INSERT INTO devices(owner_uid,device_key,platform,name) VALUES($1,$2,$3,$4) ON CONFLICT(owner_uid,device_key) DO UPDATE SET platform=EXCLUDED.platform,name=EXCLUDED.name,updated_at=NOW() RETURNING id,device_key,platform,name,created_at,updated_at",
        [req.pgUser, String(deviceKey).slice(0, 200), String(platform).slice(0, 32), name ? String(name).slice(0, 120) : null]
      );
      res.status(201).json({ device: q.rows[0] });
    } catch (e) { next(e); }
  });

  app.post("/api/postgres/groups", auth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const name = String(req.body?.name || "").trim().slice(0, 120);
      const requestedMax = Number(req.body?.maxClients ?? 100);
      if (!name) return res.status(400).json({ error: "Group name is required." });
      if (!Number.isInteger(requestedMax) || requestedMax < 1 || requestedMax > 100) {
        return res.status(400).json({ error: "maxClients must be between 1 and 100." });
      }

      await client.query("BEGIN");
      let group;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = crypto.randomBytes(8).toString("base64url").slice(0, 11);
        try {
          const result = await client.query(
            "INSERT INTO device_groups(owner_uid,name,join_code,max_clients) VALUES($1,$2,$3,$4) RETURNING id,owner_uid,name,join_code,max_clients,created_at",
            [req.pgUser, name, code, requestedMax]
          );
          group = result.rows[0];
          break;
        } catch (error) {
          if (error.code !== "23505") throw error;
        }
      }
      if (!group) throw new Error("Unable to allocate a unique group code.");
      await client.query(
        "INSERT INTO device_group_members(group_id,member_uid,role) VALUES($1,$2,'OWNER')",
        [group.id, req.pgUser]
      );
      await client.query("COMMIT");
      res.status(201).json({ group, memberCount: 1 });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      next(e);
    } finally {
      client.release();
    }
  });

  app.post("/api/postgres/groups/join", auth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const code = String(req.body?.joinCode || "").trim();
      if (!code || code.length > 64) return res.status(400).json({ error: "Valid joinCode is required." });

      await client.query("BEGIN");
      const groupResult = await client.query(
        "SELECT id,owner_uid,name,join_code,max_clients,created_at FROM device_groups WHERE join_code=$1 FOR UPDATE",
        [code]
      );
      if (!groupResult.rowCount) return res.status(404).json({ error: "Group not found." });
      const group = groupResult.rows[0];
      const existing = await client.query(
        "SELECT role FROM device_group_members WHERE group_id=$1 AND member_uid=$2",
        [group.id, req.pgUser]
      );
      if (!existing.rowCount) {
        const count = await client.query(
          "SELECT COUNT(*)::int AS count FROM device_group_members WHERE group_id=$1",
          [group.id]
        );
        if (count.rows[0].count >= group.max_clients) {
          return res.status(409).json({ error: "Group has reached its client limit." });
        }
        await client.query(
          "INSERT INTO device_group_members(group_id,member_uid,role) VALUES($1,$2,'CLIENT')",
          [group.id, req.pgUser]
        );
      }
      await client.query("COMMIT");
      res.json({ group, joined: true });
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      next(e);
    } finally {
      client.release();
    }
  });

  app.get("/api/postgres/groups", auth, async (req, res, next) => {
    try {
      const q = await pool.query(
        `SELECT g.id,g.owner_uid,g.name,g.join_code,g.max_clients,g.created_at,
                COUNT(m.member_uid)::int AS member_count
           FROM device_groups g
           JOIN device_group_members m ON m.group_id=g.id
          WHERE g.owner_uid=$1 OR EXISTS (
            SELECT 1 FROM device_group_members me
             WHERE me.group_id=g.id AND me.member_uid=$1
          )
          GROUP BY g.id
          ORDER BY g.created_at DESC
          LIMIT 100`,
        [req.pgUser]
      );
      res.json({ groups: q.rows });
    } catch (e) { next(e); }
  });
}

module.exports = { installPostgresRoutes };
