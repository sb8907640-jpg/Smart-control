const test = require("node:test");
const assert = require("node:assert/strict");
const { getWebRtcIceServers } = require("../index");

test("Firebase Functions entry point exports the WebRTC ICE callable", () => {
  assert.equal(typeof getWebRtcIceServers, "function");
});
