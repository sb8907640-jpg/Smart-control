const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const { installPairingApi } = require("../src/pairing-api");

function makeDb(seed) {
  const stores = new Map(Object.entries(seed).map(([name, entries]) => [name, new Map(entries)]));
  const read = ref => {
    const value = stores.get(ref.collection)?.get(ref.id);
    return { exists: value !== undefined, data: () => value === undefined ? undefined : structuredClone(value) };
  };
  const makeRef = (collection, id) => ({ collection, id });
  return {
    collection(name) {
      return { doc(id) { return makeRef(name, id); } };
    },
    async runTransaction(work) {
      const writes = [];
      const transaction = {
        get: async ref => read(ref),
        create: (ref, value) => writes.push({ op: "create", ref, value }),
        update: (ref, value) => writes.push({ op: "update", ref, value }),
        set: (ref, value, options) => writes.push({ op: "set", ref, value, merge: options?.merge === true })
      };
      const result = await work(transaction);
      for (const write of writes) {
        if (!stores.has(write.ref.collection)) stores.set(write.ref.collection, new Map());
        const rows = stores.get(write.ref.collection);
        const existing = rows.get(write.ref.id);
        if (write.op === "create") {
          if (existing !== undefined) throw Object.assign(new Error("Document already exists"), { code: 6 });
          rows.set(write.ref.id, structuredClone(write.value));
        } else if (write.op === "update") {
          if (existing === undefined) throw new Error("Document to update does not exist");
          rows.set(write.ref.id, { ...existing, ...structuredClone(write.value) });
        } else {
          rows.set(write.ref.id, write.merge ? { ...(existing || {}), ...structuredClone(write.value) } : structuredClone(write.value));
        }
      }
      return result;
    },
    value(collection, id) {
      const value = stores.get(collection)?.get(id);
      return value === undefined ? undefined : structuredClone(value);
    }
  };
}

async function withServer(db, receiverUid, run) {
  const app = express();
  app.use(express.json());
  installPairingApi(app, {
    db,
    authenticate(req, _res, next) {
      req.user = { uid: receiverUid };
      next();
    }
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    await run("http://127.0.0.1:" + server.address().port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function inviteSeed(token, code, creatorUid = "sender-1") {
  return {
    pairingInvites: [[crypto.createHash("sha256").update(token).digest("hex"), {
      creatorUid,
      senderRole: "Father",
      receiverRole: "Son",
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      codeHash: crypto.createHash("sha256").update(code).digest("hex"),
      status: "pending",
      createdAtEpochMs: Date.now(),
      expiresAtEpochMs: Date.now() + 600_000
    }]],
    users: [[creatorUid, { status: "ACTIVE" }]],
    userAccess: []
  };
}

async function postAccept(base, token, code) {
  return fetch(base + "/api/pairing/invites/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, code, consent: true })
  });
}

test("accepting a web invite creates the canonical Android pairing document", async () => {
  const token = "a".repeat(43);
  const code = "123456";
  const db = makeDb(inviteSeed(token, code));
  await withServer(db, "receiver-1", async base => {
    const response = await postAccept(base, token, code);
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.linked, true);
    const device = db.value("devices", "receiver-1");
    assert.equal(device.controllerUid, "sender-1");
    assert.equal(device.pairingActive, true);
    assert.equal(device.senderRole, "Father");
    assert.equal(device.receiverRole, "Son");
    assert.equal(typeof device.pairedAt, "number");
    assert.equal(Object.hasOwn(device, "pairingToken"), false);
    assert.equal(db.value("pairingInvites", crypto.createHash("sha256").update(token).digest("hex")).status, "accepted");
    assert.equal(db.value("familyPairings", crypto.createHash("sha256").update(token).digest("hex")).status, "linked");
  });
});

test("web invite acceptance refuses to overwrite an active device pairing", async () => {
  const token = "b".repeat(43);
  const code = "654321";
  const seed = inviteSeed(token, code);
  seed.devices = [["receiver-1", { controllerUid: "existing-controller", pairingActive: true }]];
  const db = makeDb(seed);
  await withServer(db, "receiver-1", async base => {
    const response = await postAccept(base, token, code);
    assert.equal(response.status, 409);
    assert.equal(db.value("pairingInvites", crypto.createHash("sha256").update(token).digest("hex")).status, "pending");
    assert.equal(db.value("familyPairings", crypto.createHash("sha256").update(token).digest("hex")), undefined);
  });
});

test("web invite acceptance rejects a blocked invitation sender", async () => {
  const token = "c".repeat(43);
  const code = "112233";
  const seed = inviteSeed(token, code);
  seed.userAccess = [["sender-1", { blocked: true }]];
  const db = makeDb(seed);
  await withServer(db, "receiver-1", async base => {
    const response = await postAccept(base, token, code);
    assert.equal(response.status, 403);
    assert.equal(db.value("pairingInvites", crypto.createHash("sha256").update(token).digest("hex")).status, "pending");
    assert.equal(db.value("devices", "receiver-1"), undefined);
  });
});
