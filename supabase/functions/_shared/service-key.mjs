// Resolve the privileged Supabase API key across the supported Edge Function
// environment layouts. Never accept a publishable key as a service credential.
export function isSupabaseSecretKey(value) {
  return typeof value === "string" && /^sb_secret_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/.test(value);
}

function readDefaultSecretKeys(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    const candidate = parsed && typeof parsed === "object" ? parsed.default : null;
    return isSupabaseSecretKey(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function resolveSupabaseServiceKey(env = {}) {
  const direct = isSupabaseSecretKey(env.SUPABASE_SECRET_KEY) ? env.SUPABASE_SECRET_KEY : null;
  if (direct) return direct;

  const mapped = readDefaultSecretKeys(env.SUPABASE_SECRET_KEYS);
  if (mapped) return mapped;

  const legacy = env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof legacy === "string" && legacy.trim() && !legacy.startsWith("sb_publishable_")) {
    return legacy;
  }

  return null;
}

export function isSupabaseServiceRequest(headers, serviceKey) {
  if (typeof serviceKey !== "string" || !serviceKey) return false;
  const token = (headers.get("Authorization") || "").replace(/^Bearer\\s+/i, "");
  return token === serviceKey || headers.get("apikey") === serviceKey;
}

// New opaque secret keys are accepted through apikey, not as JWT Bearer
// credentials. Legacy service_role JWTs still need both headers for older
// request paths and remain supported during the migration window.
export function serviceApiHeaders(serviceKey, contentType = "application/json") {
  const headers = { apikey: serviceKey };
  if (!isSupabaseSecretKey(serviceKey)) headers.Authorization = "Bearer " + serviceKey;
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

// supabase-js versions and call sites may add Authorization: Bearer <api key>.
// Strip that header for opaque secret keys while retaining apikey. This keeps
// the normal client API but follows Supabase's new-key requirement.
export function serviceClientOptions(serviceKey, fetchImpl = fetch) {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  if (!isSupabaseSecretKey(serviceKey)) return options;

  return {
    ...options,
    global: {
      fetch: (input, init = {}) => {
        const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.delete("Authorization");
        return fetchImpl(input, { ...init, headers });
      },
    },
  };
}
