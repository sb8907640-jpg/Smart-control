const UNIT_MS = Object.freeze({
  MINUTES: 60 * 1000,
  HOURS: 60 * 60 * 1000,
  DAYS: 24 * 60 * 60 * 1000,
  MONTHS: 30 * 24 * 60 * 60 * 1000
});

function normalizeUnit(value, allowed = Object.keys(UNIT_MS)) {
  const unit = String(value || "").trim().toUpperCase();
  return allowed.includes(unit) ? unit : null;
}

function durationMs(value, unit, { allowLifetime = false } = {}) {
  const n = Number(value);
  if (allowLifetime && (String(unit || "").toUpperCase() === "LIFETIME" || value == null)) return null;
  const normalized = normalizeUnit(unit);
  if (!Number.isFinite(n) || n <= 0 || !normalized) return null;
  return n * UNIT_MS[normalized];
}

function getPlanDuration(plan = {}) {
  if (plan.lifetime === true || String(plan.durationUnit || "").toUpperCase() === "LIFETIME") {
    return { value: null, unit: "LIFETIME", ms: null };
  }
  const value = Number(plan.durationValue ?? plan.duration ?? 0);
  const unit = normalizeUnit(plan.durationUnit || plan.durationUnitName);
  const ms = durationMs(value, unit);
  if (ms == null) return null;
  return { value, unit, ms };
}

function getLinkValidity(plan = {}) {
  const value = Number(plan.linkValidityValue ?? plan.linkValidity ?? 0);
  const unit = normalizeUnit(plan.linkValidityUnit || plan.linkValidityUnitName, ["MINUTES", "HOURS", "DAYS"]);
  const ms = durationMs(value, unit);
  if (ms == null) return null;
  return { value, unit, ms };
}

function calculateExpiry(startedAt, duration) {
  if (!duration || duration.ms == null) return null;
  return Number(startedAt) + duration.ms;
}

module.exports = { UNIT_MS, normalizeUnit, durationMs, getPlanDuration, getLinkValidity, calculateExpiry };
