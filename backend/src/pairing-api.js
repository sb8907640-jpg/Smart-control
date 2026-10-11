const crypto = require("crypto");

function installPairingApi(app, { db, authenticate }) {
  app.post("/api/pairing/invites/accept", authenticate, async (req, res, next) => {
    if (!db) return res.status(503).json({ error: "Data service is unavailable." });

    try {
      const token = String(req.body?.token || "");
      const code = String(req.body?.code || "");
      const consent = req.body?.consent === true;
      if (!consent) return res.status(400).json({ error: "Explicit receiver consent is required." });
      if (!/^[A-Za-z0-9_-]{40,60}$/.test(token) || !/^\\d{6}$/.test(code)) {
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
          const error = new Error("Invitation not found or invalid.");
          error.statusCode = 404;
          throw error;
        }
        const invite = inviteSnap.data();
        if (invite.status !== "pending" || invite.expiresAtEpochMs <= now) {
          const error = new Error("Invitation has expired or has already been used.");
          error.statusCode = 410;
          throw error;
        }
        if (invite.codeHash !== codeHash) {
          const error = new Error("Verification code is incorrect.");
          error.statusCode = 401;
          throw error;
        }
        if (invite.creatorUid === req.user.uid) {
          const error = new Error("The sender cannot accept their own invitation.");
          error.statusCode = 400;
          throw error;
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
