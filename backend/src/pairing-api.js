const crypto = require("crypto");

function installPairingApi(app, { db, authenticate }) {
  app.post("/api/pairing/invites/accept", authenticate, async (req, res, next) => {
    if (!db) return res.status(503).json({ error: "Data service is unavailable." });

    try {
      const token = String(req.body?.token || "");
      const code = String(req.body?.code || "");
      const consent = req.body?.consent === true;
      if (!consent) return res.status(400).json({ error: "Explicit receiver consent is required." });
      if (!/^[A-Za-z0-9_-]{40,60}$/.test(token) || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "A valid invitation link and 6-digit code are required." });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const codeHash = crypto.createHash("sha256").update(code).digest("hex");
      const inviteRef = db.collection("pairingInvites").doc(tokenHash);
      const pairingRef = db.collection("familyPairings").doc(tokenHash);
      const now = Date.now();

      const result = await db.runTransaction(async transaction => {
        const inviteSnap = await transaction.get(inviteRef);
        if (!inviteSnap.exists) {
          return { failure: { statusCode: 404, message: "Invitation not found or invalid." } };
        }
        const invite = inviteSnap.data();
        if (Number(invite.lockedUntilEpochMs || 0) > now) {
          return { failure: { statusCode: 429, message: "Too many incorrect codes. This invitation is temporarily locked." } };
        }
        if (invite.status !== "pending" || invite.expiresAtEpochMs <= now) {
          return { failure: { statusCode: 410, message: "Invitation has expired or has already been used." } };
        }
        if (invite.codeHash !== codeHash) {
          const failedAttempts = Number(invite.failedAttempts || 0) + 1;
          const lockedUntilEpochMs = failedAttempts >= 5 ? now + 15 * 60_000 : 0;
          transaction.update(inviteRef, { failedAttempts, lockedUntilEpochMs });
          return {
            failure: {
              statusCode: lockedUntilEpochMs > now ? 429 : 401,
              message: lockedUntilEpochMs > now
                ? "Too many incorrect codes. This invitation is locked for 15 minutes."
                : "Verification code is incorrect."
            }
          };
        }
        if (invite.creatorUid === req.user.uid) {
          return { failure: { statusCode: 400, message: "The sender cannot accept their own invitation." } };
        }

        const linkedAtEpochMs = Date.now();
        transaction.create(pairingRef, {
          senderUid: invite.creatorUid,
          receiverUid: req.user.uid,
          senderRole: invite.senderRole,
          receiverRole: invite.receiverRole,
          status: "linked",
          createdAtEpochMs: linkedAtEpochMs,
          invitationTokenHash: tokenHash
        });
        transaction.update(inviteRef, {
          status: "accepted",
          acceptedByUid: req.user.uid,
          acceptedAtEpochMs: linkedAtEpochMs
        });
        return {
          pairingId: tokenHash,
          senderRole: invite.senderRole,
          receiverRole: invite.receiverRole,
          linkedAtEpochMs
        };
      });

      if (result.failure) return res.status(result.failure.statusCode).json({ error: result.failure.message });
      return res.status(201).json({ linked: true, ...result });
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
      if (error.code === 6 || error.code === "already-exists") {
        return res.status(409).json({ error: "This invitation has already been accepted." });
      }
      return next(error);
    }
  });
}

module.exports = { installPairingApi };
