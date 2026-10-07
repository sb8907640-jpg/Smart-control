const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_MESSAGE, normalizeSupportNumber, getSupportWhatsAppUrl } = require("../src/support-whatsapp");

test("normalizes a private support number without exposing it", () => {
  assert.equal(normalizeSupportNumber("+91 0000000000"), "910000000000");
  assert.equal(normalizeSupportNumber("invalid"), null);
});

test("builds a WhatsApp URL from the private environment value", () => {
  const url = getSupportWhatsAppUrl({ SUPPORT_WHATSAPP_NUMBER: "+910000000000" });
  assert.match(url, /^https:\/\/wa\.me\/910000000000\?text=/);
  assert.match(url, /Hello%2C%20I%20need%20support%20for%20Total%20Control%20System/);
});

test("does not expose a URL when support number is not configured", () => {
  assert.equal(getSupportWhatsAppUrl({}), null);
});
