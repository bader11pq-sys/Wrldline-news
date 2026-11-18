// Distinguish a rejected caller secret from an unavailable verifier service.
// A PostgREST/Database outage must never be reported as an invalid user credential.
export function classifyCronVerifierResult({ ok, value }) {
  if (!ok) {
    return { authorized: false, status: 503, code: "cron_verifier_unavailable" };
  }
  if (value !== true) {
    return { authorized: false, status: 401, code: "unauthorized" };
  }
  return { authorized: true, status: 200, code: "authorized" };
}
