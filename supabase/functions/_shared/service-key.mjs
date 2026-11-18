// Resolve the privileged Supabase API key across the supported Edge Function
// environment layouts. Never accept a publishable key as a service credential.
function isSecretKey(value) {
  return typeof value === "string" && value.startsWith("sb_secret_") && value.length > 20;
}

function readDefaultSecretKeys(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    const candidate = parsed && typeof parsed === "object" ? parsed.default : null;
    return isSecretKey(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function resolveSupabaseServiceKey(env = {}) {
  const direct = isSecretKey(env.SUPABASE_SECRET_KEY) ? env.SUPABASE_SECRET_KEY : null;
  if (direct) return direct;

  const mapped = readDefaultSecretKeys(env.SUPABASE_SECRET_KEYS);
  if (mapped) return mapped;

  const legacy = env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof legacy === "string" && legacy.trim() && !legacy.startsWith("sb_publishable_")) {
    return legacy;
  }

  return null;
}
