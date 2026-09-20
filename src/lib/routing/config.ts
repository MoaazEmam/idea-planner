/**
 * Routing threshold lives in one place so it is trivial to retune once the
 * link_source audit tells us how often auto-linking is wrong.
 */
function readThreshold(): number {
  const raw = process.env.LINK_CONFIDENCE_THRESHOLD;
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.7;
}

export const LINK_CONFIDENCE_THRESHOLD = readThreshold();
