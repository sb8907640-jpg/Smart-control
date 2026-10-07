const DEFAULT_MESSAGE = "Hello, I need support for Total Control System";

function normalizeSupportNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!/^\d{10,15}$/.test(digits)) return null;
  return digits;
}

function getSupportWhatsAppUrl(env = process.env, message = DEFAULT_MESSAGE) {
  const number = normalizeSupportNumber(env.SUPPORT_WHATSAPP_NUMBER);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

module.exports = { DEFAULT_MESSAGE, normalizeSupportNumber, getSupportWhatsAppUrl };
