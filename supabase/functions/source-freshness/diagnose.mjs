// Pure diagnosis layer on top of evaluateSource(). The raw monitor cannot tell "the source is broken"
// from "we deliberately stopped polling": with ingestion paused, every source eventually shows
// attempt_overdue/received_stale. This separates expected consequences of the pause from real defects.
export const CATEGORIES = Object.freeze({
  HEALTHY: "healthy",
  QUIET: "quiet",
  PAUSED_EXPECTED: "paused_expected",
  NEVER_SUCCEEDED: "never_succeeded",
  LAST_ATTEMPT_FAILED: "last_attempt_failed",
  STALE_SOURCE: "stale_source",
  NEVER_POLLED: "never_polled",
  MISCONFIGURED: "misconfigured",
});

const ACTIONS = {
  healthy: ["No action", "لا إجراء"],
  quiet: ["No action: poll succeeded with no new items", "لا إجراء: فحص ناجح دون جديد"],
  paused_expected: ["Expected while ingestion is paused. Re-check with the manual reachability probe; do not treat as a source fault", "متوقع أثناء إيقاف الجلب. أعد الفحص بالأداة اليدوية ولا تعده عطلًا في المصدر"],
  never_succeeded: ["Run the reachability probe; fix or replace the feed URL, or deactivate the source", "شغّل فحص الوصول؛ أصلح رابط الخلاصة أو استبدله أو عطّل المصدر"],
  last_attempt_failed: ["Last recorded poll failed before/while paused. Probe the URL; if it is reachable, keep, otherwise replace", "آخر محاولة مسجلة فشلت. افحص الرابط؛ إن كان يعمل فأبقه وإلا فاستبدله"],
  stale_source: ["Source is polled but publishes nothing new: confirm with the publisher or lower its priority", "المصدر يُفحص لكنه لا ينشر جديدًا: تحقق من الناشر أو خفّض أولويته"],
  never_polled: ["Never polled: verify it is active and has a cadence", "لم يُفحص قط: تأكد أنه نشط وله وتيرة"],
  misconfigured: ["Set expected_cadence_seconds in source_freshness_config", "حدّد expected_cadence_seconds في إعداد الحداثة"],
};
const SEVERITY = { healthy: 0, quiet: 0, paused_expected: 1, never_polled: 2, misconfigured: 2, stale_source: 3, last_attempt_failed: 3, never_succeeded: 4 };

/**
 * @param {{status:string, flags?:string[], last_success_at?:string|null, last_attempt_at?:string|null}} metric  evaluateSource() output
 * @param {{ingestionPaused?: boolean}} [opts]
 */
export function diagnose(metric, opts = {}) {
  const paused = opts.ingestionPaused !== false; // default to the documented production state
  const flags = metric.flags || [];
  let category;
  switch (metric.status) {
    case "healthy": category = CATEGORIES.HEALTHY; break;
    case "no_new_news": category = CATEGORIES.QUIET; break;
    case "configuration_required": category = CATEGORIES.MISCONFIGURED; break;
    case "not_initialized": category = CATEGORIES.NEVER_POLLED; break;
    case "error": category = metric.last_success_at ? CATEGORIES.LAST_ATTEMPT_FAILED : CATEGORIES.NEVER_SUCCEEDED; break;
    case "stale": {
      const onlyPollingDriven = flags.length > 0 && flags.every((f) => ["attempt_overdue", "received_stale", "published_stale", "no_new_news", "cadence_not_configured"].includes(f));
      category = paused && onlyPollingDriven && !flags.includes("future_timestamp") ? CATEGORIES.PAUSED_EXPECTED : CATEGORIES.STALE_SOURCE;
      break;
    }
    default: category = CATEGORIES.NEVER_POLLED;
  }
  return { category, severity: SEVERITY[category], action_en: ACTIONS[category][0], action_ar: ACTIONS[category][1] };
}

export function summarize(diagnoses) {
  const counts = {};
  for (const c of Object.values(CATEGORIES)) counts[c] = 0;
  for (const d of diagnoses) counts[d.category] = (counts[d.category] || 0) + 1;
  const defects = counts.never_succeeded + counts.last_attempt_failed + counts.stale_source;
  return { counts, true_defects: defects, expected_from_pause: counts.paused_expected,
    needs_configuration: counts.misconfigured + counts.never_polled };
}
