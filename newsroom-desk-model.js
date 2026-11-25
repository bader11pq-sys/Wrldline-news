/* Pure helpers for the newsroom desk (admin). The database is the authority for access; this mirrors it
   for display only. UMD, no DOM. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WLNewsroomDesk = factory();
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const STATUSES = Object.freeze(["draft", "review", "published", "rejected"]);
  const TRUSTS = Object.freeze(["confirmed", "unconfirmed", "disputed"]);
  const NOTE_KINDS = Object.freeze(["note", "request_changes", "verification", "assignment"]);
  /** Mirrors the existing role model: private.trust_is_editor() (editor, admin) and admin-only breaking news. */
  const CAPABILITIES = Object.freeze({ view_desk: ["editor", "admin"], add_note: ["editor", "admin"], set_breaking: ["admin"] });
  const can = (role, cap) => Boolean(CAPABILITIES[cap] && CAPABILITIES[cap].includes(role));

  const int = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);
  const counts = (o, allowed) => {
    const out = {};
    for (const k of allowed) out[k] = int(o && o[k]);
    return out;
  };
  /** Validates the overview payload; unknown keys are dropped so nothing unexpected is rendered. */
  function normalizeOverview(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const series = Array.isArray(raw.published_by_day) ? raw.published_by_day
      .filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.day)) && Number.isFinite(Number(r.count)))
      .map((r) => ({ day: String(r.day), count: int(r.count) })) : [];
    return {
      generatedAt: Number.isFinite(Date.parse(raw.generated_at)) ? Date.parse(raw.generated_at) : null,
      windowDays: int(raw.window_days) || 30,
      byStatus: counts(raw.by_status, STATUSES),
      reviewBacklog: int(raw.review_backlog), needsTrustReview: int(raw.needs_trust_review),
      publishedByTrust: counts(raw.published_by_trust, TRUSTS),
      changes: counts(raw.changes_by_type, ["created", "updated", "verification", "correction", "retraction"]),
      updates: counts(raw.story_updates_by_kind, ["update", "development", "correction", "clarification"]),
      translationsAwaiting: int(raw.translations_awaiting_review), openRequests: int(raw.open_review_requests), series
    };
  }
  /** Bar heights (0..100) relative to the busiest day; zero stays zero. */
  function barHeights(series) {
    const max = Math.max(0, ...series.map((s) => s.count));
    return series.map((s) => ({ day: s.day, count: s.count, pct: max ? Math.max(4, Math.round((s.count / max) * 100)) * (s.count ? 1 : 0) : 0 }));
  }
  function queueArgs(f, page, size) {
    const n = Math.max(1, Math.min(200, int(size) || 25));
    return {
      p_status: STATUSES.includes(f && f.status) ? f.status : null,
      p_trust: TRUSTS.includes(f && f.trust) ? f.trust : null,
      p_q: f && typeof f.q === "string" && f.q.trim() ? f.q.trim().slice(0, 120) : null,
      p_limit: n, p_offset: Math.max(0, int(page)) * n
    };
  }
  /** One queue row from the RPC; null when the row is unusable. */
  function normalizeRow(r) {
    if (!r || typeof r.id !== "string" || !/^[0-9a-f-]{36}$/i.test(r.id) || typeof r.title !== "string") return null;
    return {
      id: r.id, title: r.title, status: STATUSES.includes(r.editorial_status) ? r.editorial_status : "draft",
      trust: TRUSTS.includes(r.trust_status) ? r.trust_status : "unconfirmed", needsReview: r.trust_needs_review === true,
      source: typeof r.source_name === "string" ? r.source_name : "", lane: typeof r.audience_lane === "string" ? r.audience_lane : "",
      publishedAt: Date.parse(r.published_at) || null, lastChangeAt: Date.parse(r.last_change_at) || null,
      changes: int(r.change_count), corrections: int(r.correction_count), updates: int(r.update_count), notes: int(r.note_count),
      lastNoteKind: NOTE_KINDS.includes(r.last_note_kind) ? r.last_note_kind : null
    };
  }
  return Object.freeze({ STATUSES, TRUSTS, NOTE_KINDS, CAPABILITIES, can, normalizeOverview, barHeights, queueArgs, normalizeRow });
});
